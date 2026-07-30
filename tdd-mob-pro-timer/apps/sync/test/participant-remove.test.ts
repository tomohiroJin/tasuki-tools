/**
 * participant.remove（参加者を退出させる・⑪）の結合テスト
 *
 * Issue #22（host-spof-relaxation G3）で次の3点が変わった:
 *   - 自己退出が可能になった（FR-079）。「自分自身は外せない」テストはこの緩和で撤廃した
 *   - 「編集者以上が1名以上残る」不変条件を検査する（FR-072/073）
 *   - 対象がホストなら退出の前にホストを引き継ぐ（D2b）
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

describe("participant.remove（⑪）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let code: string;
  const hostConn = "host-conn";
  const guestConn = "guest-conn";
  let guestId: string;

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({ store, clock: new FakeClock(1_000_000), broadcaster, codeGen: new FakeCodeGen() });
    await handlers.handleCommand(hostConn, {
      command: "room.create",
      displayName: "Alice",
      config: { language: "TypeScript", difficulty: "easy", members: ["Alice"], intervalMinutes: 5 },
    });
    code = broadcaster.createdFor(hostConn).code;
    await handlers.handleCommand(guestConn, { command: "room.join", code, displayName: "Bob", hasAiKey: false });
    guestId = store.get(code)!.participants.find((p) => p.displayName === "Bob")!.participantId;
    // Bob をローテーションに加える（host が member.add）→ rotation = [Alice, Bob] の各ID
    await handlers.handleCommand(hostConn, { command: "member.add", participantId: guestId });
    broadcaster.sent.length = 0;
    broadcaster.snapshots.length = 0;
  });

  it("ホストが参加者を退出させ、一覧と rotation から消える", async () => {
    // Given
    const command = { command: "participant.remove", participantId: guestId } as const;

    // When
    await handlers.handleCommand(hostConn, command);

    // Then
    const room = broadcaster.latestSnapshot();
    expect(room?.participants.find((p) => p.participantId === guestId)).toBeUndefined();
    // rotation は参加者IDの配列（D6b）
    expect(room?.session.rotation).not.toContain(guestId);
    expect(room?.session.rotation).toContain(store.get(code)!.hostParticipantId);
  });

  it("ホストでない参加者は実行できない（UNAUTHORIZED）", async () => {
    // Given
    const command = { command: "participant.remove", participantId: store.get(code)!.hostParticipantId } as const;

    // When
    await handlers.handleCommand(guestConn, command);
    // Then
    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error?.msg.type === "error" && error.msg.code).toBe("UNAUTHORIZED");
  });

  it("最後の1人（rotation 1名）は外せない", async () => {
    // Given（rotation=[Bob] の状態を作る。Alice を対象にすると自己退出の経路になるため、
    // Alice を輪から抜いて Bob だけを残す）
    await handlers.handleCommand(hostConn, { command: "member.remove", index: 0 }); // [Bob]
    broadcaster.sent.length = 0;

    // When（host が Bob を消そうとする）
    await handlers.handleCommand(hostConn, { command: "participant.remove", participantId: guestId });

    // Then（拒否され、Bob はまだ居る。rotation 上の最後の1人なので拒否）
    const error = broadcaster.sent.find((s) => s.msg.type === "error" && (s.msg as { code: string }).code === "BelowMinMembers");
    expect(error).toBeTruthy();
    expect(store.get(code)!.participants.find((p) => p.participantId === guestId)).toBeTruthy();
  });
});

// ─── Issue #22 G3: 自己退出・不変条件・ホスト引き継ぎ ─────────────────────────
// 設計: docs/plans/host-spof-relaxation/plan.md「D2b」「D3」

/**
 * @requirements FR-065, FR-072, FR-073, FR-079, US3, US5
 */
describe("participant.remove（G3: 自己退出・不変条件・ホスト引き継ぎ）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let code: string;

  const HOST = "g3-host";
  const BOB = "g3-bob";
  const CAROL = "g3-carol";

  /** 参加者を displayName から引く。 */
  const pidOf = (name: string): string =>
    store.get(code)!.participants.find((p) => p.displayName === name)!.participantId;

  /** 直近に connId 宛へ送られた error を返す。 */
  const lastError = (connId: string): { code: string; message: string } | undefined => {
    const found = [...broadcaster.sent].reverse().find(
      (s) => s.connId === connId && s.msg.type === "error",
    );
    if (!found || found.msg.type !== "error") return undefined;
    return { code: found.msg.code, message: found.msg.message };
  };

  /** Alice(host) / Bob / Carol の3名が在室するルームを作る（全員 editor 相当）。 */
  async function setup(): Promise<void> {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({
      store, clock: new FakeClock(1_000_000), broadcaster, codeGen: new FakeCodeGen(),
    });
    const created = await handlers.handleCommand(HOST, {
      command: "room.create",
      displayName: "Alice",
      config: { language: "TypeScript", difficulty: "easy", members: ["Alice", "Bob", "Carol"], intervalMinutes: 5 },
    });
    if (!created.isOk()) throw new Error("room.create failed");
    code = broadcaster.createdFor(HOST).code;
    // rotation は参加者IDの配列（D6b）。config.members に名前を並べるだけでは輪に入らないので、
    // 本人が自分を輪に加える（Web の実フローと同じ）。
    for (const [connId, displayName] of [[BOB, "Bob"], [CAROL, "Carol"]] as const) {
      const join = await handlers.handleCommand(connId, {
        command: "room.join", code, displayName, hasAiKey: false,
      });
      if (!join.isOk()) throw new Error(`room.join failed: ${displayName}`);
      const add = await handlers.handleCommand(connId, {
        command: "member.add", participantId: broadcaster.joinedFor(connId).participantId,
      });
      if (!add.isOk()) throw new Error(`member.add failed: ${displayName}`);
    }
    broadcaster.sent.length = 0;
    broadcaster.snapshots.length = 0;
  }

  /** セッションを開始する（startedAt を立てる）。 */
  async function start(): Promise<void> {
    await handlers.handleCommand(HOST, { command: "phase.set", phase: "session" });
    broadcaster.sent.length = 0;
    broadcaster.snapshots.length = 0;
  }

  beforeEach(setup);

  it("① 開始後は host でない editor が他人を退出させられる", async () => {
    // Given
    await start();
    const carolId = pidOf("Carol");

    // When
    const result = await handlers.handleCommand(BOB, {
      command: "participant.remove", participantId: carolId,
    });

    // Then
    result._unsafeUnwrap();
    expect(store.get(code)!.participants.find((p) => p.participantId === carolId)).toBeUndefined();
  });

  it("② 参加者は自分自身を退出させられる", async () => {
    // Given
    const carolId = pidOf("Carol");

    // When
    const result = await handlers.handleCommand(CAROL, {
      command: "participant.remove", participantId: carolId,
    });

    // Then
    result._unsafeUnwrap();
    expect(store.get(code)!.participants.find((p) => p.participantId === carolId)).toBeUndefined();
  });

  it("③ 実在の編集者以上が1名しか居ないとき、その1名は退出できない", async () => {
    // Given（Bob と Carol を見学者へ降格し、編集者以上を Alice(host) だけにする）
    await handlers.handleCommand(HOST, { command: "role.set", participantId: pidOf("Bob"), role: "viewer" });
    await handlers.handleCommand(HOST, { command: "role.set", participantId: pidOf("Carol"), role: "viewer" });
    broadcaster.sent.length = 0;
    const aliceId = pidOf("Alice");

    // When
    const result = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: aliceId,
    });

    // Then
    expect(result.isErr()).toBe(true);
    expect(lastError(HOST)?.code).toBe("LAST_MANAGER");
    expect(store.get(code)!.participants.find((p) => p.participantId === aliceId)).toBeTruthy();
  });

  it("③' 代理の編集者が別に居ても③の判定は変わらない（代理は頭数に入らない）", async () => {
    // Given
    await handlers.handleCommand(HOST, { command: "participant.addProxy", displayName: "Proxy", participantId: "proxy-1" });
    await handlers.handleCommand(HOST, { command: "role.set", participantId: pidOf("Bob"), role: "viewer" });
    await handlers.handleCommand(HOST, { command: "role.set", participantId: pidOf("Carol"), role: "viewer" });
    broadcaster.sent.length = 0;
    const aliceId = pidOf("Alice");

    // When
    const result = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: aliceId,
    });

    // Then
    expect(result.isErr()).toBe(true);
    expect(lastError(HOST)?.code).toBe("LAST_MANAGER");
  });

  it("④ 退出させられた本人へ通知が届く（他人に外された場合）", async () => {
    // Given
    await start();
    const carolId = pidOf("Carol");

    // When
    await handlers.handleCommand(BOB, { command: "participant.remove", participantId: carolId });

    // Then（通知コードと文言の更新は G4 の担当。ここでは「本人へ届くこと」だけを固定する）
    expect(lastError(CAROL)).toBeTruthy();
  });

  it("④' 自己退出では本人へ LEFT_ROOM が届く（Issue #32: 自分の操作として区別した通知）", async () => {
    // Given
    const carolId = pidOf("Carol");

    // When
    await handlers.handleCommand(CAROL, { command: "participant.remove", participantId: carolId });

    // Then
    expect(lastError(CAROL)?.code).toBe("LEFT_ROOM");
  });

  it("⑤ 開始前にホストが自己退出しても、残った編集者が phase.set を実行できる（D2b）", async () => {
    // Given
    const aliceId = pidOf("Alice");

    // When
    const removed = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: aliceId,
    });
    removed._unsafeUnwrap();

    // Then（ホストは在室者のうち joinedAt 最小＝Bob へ引き継がれている）
    const after = store.get(code)!;
    expect(after.hostParticipantId).toBe(after.participants.find((p) => p.displayName === "Bob")!.participantId);
    expect(after.participants.find((p) => p.displayName === "Bob")!.role).toBe("host");

    // Then（引き継ぎが効いていなければ開始前の phase.set はホスト限定なので詰む）
    broadcaster.sent.length = 0;
    const phase = await handlers.handleCommand(BOB, { command: "phase.set", phase: "ready" });

    phase._unsafeUnwrap();
    expect(store.get(code)!.phase).toBe("ready");
  });

  it("⑥ 他人がホストを退出させた場合もホストが引き継がれる（D2b）", async () => {
    // Given
    await start();
    const aliceId = pidOf("Alice");

    // When
    const result = await handlers.handleCommand(CAROL, {
      command: "participant.remove", participantId: aliceId,
    });

    // Then（退出した Alice ではなく、残った在室者のうち joinedAt 最小＝Bob が新ホスト）
    result._unsafeUnwrap();
    const after = store.get(code)!;
    expect(after.participants.find((p) => p.participantId === aliceId)).toBeUndefined();
    expect(after.hostParticipantId).toBe(after.participants.find((p) => p.displayName === "Bob")!.participantId);
  });

  it("⑧ 後継ホストにオフラインの見学者を選ばない（詰みの再導入を防ぐ）", async () => {
    // Given（D2b の目的は「ホストが抜けた後も誰かが操作できる」こと。単に joinedAt 最小を選ぶと
    // オフラインの見学者が新ホストになり、オンラインの編集者が開始前操作を実行できないという、
    // D2b が防ぐはずだった詰みにそのまま戻る。しかも自動委譲は切断契機でしか発火しないため
    // ＝既にオフラインの人が昇格しても新たなタイマーは張られない、救済もない）
    await handlers.handleCommand(HOST, { command: "role.set", participantId: pidOf("Bob"), role: "viewer" });
    handlers.handleConnectionClose(BOB);
    store.put({
      ...store.get(code)!,
      participants: store.get(code)!.participants.map((p) =>
        p.displayName === "Bob" ? { ...p, presence: "offline" as const } : p,
      ),
    });
    broadcaster.sent.length = 0;

    // When
    await handlers.handleCommand(HOST, { command: "participant.remove", participantId: pidOf("Alice") });

    // Then（joinedAt は Bob < Carol だが、オフラインの見学者ではなくオンラインの編集者を選ぶ）
    const after = store.get(code)!;
    expect(after.hostParticipantId).toBe(after.participants.find((p) => p.displayName === "Carol")!.participantId);
    // 残ったオンラインの参加者が開始前操作を実行できる（詰んでいない）。
    const phase = await handlers.handleCommand(CAROL, { command: "phase.set", phase: "ready" });
    expect(phase.isOk()).toBe(true);
  });

  it("⑨ オンラインの編集者と見学者が居るときは編集者を選ぶ（見学の意思を尊重する）", async () => {
    // Given（Bob＝joinedAt 最小を見学者にするが、オンラインのまま残す）
    await handlers.handleCommand(HOST, { command: "role.set", participantId: pidOf("Bob"), role: "viewer" });
    broadcaster.sent.length = 0;

    // When
    await handlers.handleCommand(HOST, { command: "participant.remove", participantId: pidOf("Alice") });

    // Then
    const after = store.get(code)!;
    expect(after.hostParticipantId).toBe(after.participants.find((p) => p.displayName === "Carol")!.participantId);
    expect(after.participants.find((p) => p.displayName === "Bob")!.role).toBe("viewer");
  });

  it("⑦ 代理しか残らない場合はホストを引き継がずそのまま退出する（候補なし）", async () => {
    // Given（Bob と Carol を退出させ、実在の在室者を Alice だけにする）
    await handlers.handleCommand(HOST, { command: "participant.addProxy", displayName: "Proxy", participantId: "proxy-1" });
    await handlers.handleCommand(HOST, { command: "participant.remove", participantId: pidOf("Bob") });
    await handlers.handleCommand(HOST, { command: "participant.remove", participantId: pidOf("Carol") });
    broadcaster.sent.length = 0;
    const aliceId = pidOf("Alice");

    // When（Alice は唯一の実在の編集者以上なので不変条件で拒否されるはず。代理は頭数に入らない）
    const result = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: aliceId,
    });

    // Then
    expect(result.isErr()).toBe(true);
    expect(lastError(HOST)?.code).toBe("LAST_MANAGER");
  });
});

// ─── 同名参加者を識別子で区別する（G7・D6b）────────────────────────────────
// 実機検証で判明: rotation に居ない幽霊を退出させると、同名で rotation に居る本物が輪から外れた。
// 退出処理が rotation の位置を表示名で引いていたためである。G6 では「参加時刻が最も早い同名参加者を
// 枠の持ち主とみなす」規則で凌いだが、再接続では幽霊のほうが先に居るため実態とずれた。
// D6b で rotation を参加者IDの配列にし、枠と参加者を直接結び付けて推測を排した。

/**
 * @requirements FR-085, SC-024
 */
describe("participant.remove（G7: 同名参加者を識別子で区別する）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let code: string;
  let hostId: string;

  const HOST = "g7-host";
  const REAL = "g7-real";
  const GHOST = "g7-ghost";

  const room = () => store.get(code)!;

  /**
   * Alice(host) と同名の Bob 2名（輪に居る本物・輪に居ない幽霊）が在室する部屋を作る。
   *
   * @param ghostFirst true なら幽霊が先に参加する。これが**再接続の向き**で、
   *   参加順から持ち主を推測していた G6 の規則が取り逃していた並びである。
   */
  async function setupBobs(ghostFirst: boolean): Promise<{ realId: string; ghostId: string }> {
    const order = ghostFirst ? ([[GHOST, "ghost"], [REAL, "real"]] as const) : ([[REAL, "real"], [GHOST, "ghost"]] as const);
    const ids: Record<string, string> = {};
    for (const [connId, kind] of order) {
      const join = await handlers.handleCommand(connId, {
        command: "room.join", code, displayName: "Bob", hasAiKey: false,
      });
      if (!join.isOk()) throw new Error(`room.join failed: ${kind}`);
      ids[kind] = broadcaster.joinedFor(connId).participantId;
    }
    // 本物だけが輪に並ぶ（幽霊は rotation 外）。
    const add = await handlers.handleCommand(REAL, {
      command: "member.add", participantId: ids.real!,
    });
    if (!add.isOk()) throw new Error("member.add failed");
    broadcaster.sent.length = 0;
    return { realId: ids.real!, ghostId: ids.ghost! };
  }

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({
      store, clock: new FakeClock(1_000_000), broadcaster, codeGen: new FakeCodeGen(),
    });
    const created = await handlers.handleCommand(HOST, {
      command: "room.create",
      displayName: "Alice",
      config: { language: "TypeScript", difficulty: "easy", members: ["Alice"], intervalMinutes: 5 },
    });
    if (!created.isOk()) throw new Error("room.create failed");
    code = broadcaster.createdFor(HOST).code;
    hostId = room().hostParticipantId;
  });

  it("① 幽霊が後着でも、幽霊を退出させると本物の枠は残る", async () => {
    // Given
    const { realId, ghostId } = await setupBobs(false);
    expect(room().session.rotation).toContain(realId);

    // When
    const result = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: ghostId,
    });

    // Then
    result._unsafeUnwrap();
    expect(room().participants.filter((p) => p.displayName === "Bob")).toHaveLength(1);
    expect(room().session.rotation).toContain(realId);
  });

  it("①' 幽霊が先着（再接続の向き）でも、幽霊を退出させると本物の枠は残る", async () => {
    // Given（G6 の「参加時刻が最も早い同名を持ち主とする」規則はこの並びで破綻していた）
    const { realId, ghostId } = await setupBobs(true);
    expect(room().session.rotation).toContain(realId);
    expect(room().session.rotation).not.toContain(ghostId);

    // When
    const result = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: ghostId,
    });

    // Then
    result._unsafeUnwrap();
    expect(room().session.rotation).toContain(realId);
    expect(room().session.rotation).toEqual([hostId, realId]);
  });

  it("② 枠を持つ本物を退出させると、その枠だけが外れる", async () => {
    // Given
    const { realId, ghostId } = await setupBobs(true);

    // When
    const result = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: realId,
    });

    // Then
    result._unsafeUnwrap();
    expect(room().session.rotation).toEqual([hostId]);
    // 幽霊は輪の外に居ただけなので在室したまま（巻き添えにしない）。
    expect(room().participants.some((p) => p.participantId === ghostId)).toBe(true);
  });

  it("③ 輪に本物1人だけのとき、その本物は最後のドライバー保護で外せない", async () => {
    // Given（Alice を輪から抜いて rotation=[本物Bob] にする）
    const { realId } = await setupBobs(true);
    await handlers.handleCommand(HOST, { command: "member.remove", index: 0 });
    expect(room().session.rotation).toEqual([realId]);
    broadcaster.sent.length = 0;

    // When
    const result = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: realId,
    });

    // Then
    expect(result.isErr()).toBe(true);
    const err = [...broadcaster.sent].reverse().find((x) => x.msg.type === "error");
    expect(err?.msg.type === "error" && err.msg.code).toBe("BelowMinMembers");
    // 同名の幽霊が居合わせても保護は素通りしない（別人が枠を引き継がない）。
    expect(room().participants.some((p) => p.participantId === realId)).toBe(true);
    expect(room().session.rotation).toEqual([realId]);
  });

  it("④ 枠を外さないケースでは最後のドライバー保護（BelowMinMembers）が誤発火しない", async () => {
    // Given（rotation を [Alice] だけにする）
    const { realId, ghostId } = await setupBobs(true);
    await handlers.handleCommand(HOST, {
      command: "member.remove", index: room().session.rotation.indexOf(realId),
    });
    expect(room().session.rotation).toEqual([hostId]);
    broadcaster.sent.length = 0;

    // When（rotation 外の幽霊を退出させる）
    const result = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: ghostId,
    });

    // Then（rotation に触れないので BelowMinMembers は関係ない）
    result._unsafeUnwrap();
    expect(room().session.rotation).toEqual([hostId]);
  });
});
