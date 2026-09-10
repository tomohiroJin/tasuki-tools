/**
 * participant.remove（参加者を退出させる・⑪）の結合テスト
 *
 * Issue #22（host-spof-relaxation G3）で自己退出が可能になった（FR-079）。
 * 「自分自身は外せない」テストはその緩和で撤廃した。
 *
 * #95 S3 で役割とホストを廃止したため、同 Issue が足した残り2点
 * （「編集者以上が1名以上残る」不変条件と、退出前のホスト引き継ぎ）は
 * **どちらも概念ごと消えた**。誰が誰を退出させられるかという判定は無く、
 * 残るのは「結果の状態が妥当か」の検査（rotation を空にしない・
 * 誰も残らないなら部屋ごと破棄する）だけである。
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { makeHandlers } from "../src/application/handlers.js";
import { makeTestHandlers } from "./support/room-builder.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { roomViewOf } from "./support/room-view.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

describe("participant.remove（⑪）", () => {
  let store: InMemoryRoomStore;
  let timers: InMemoryTimerStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let code: string;
  const creatorConn = "creator-conn";
  const guestConn = "guest-conn";
  let creatorId: string;
  let guestId: string;

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    timers = new InMemoryTimerStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeTestHandlers({ store, timers, clock: new FakeClock(1_000_000), broadcaster, codeGen: new FakeCodeGen() });
    await handlers.handleCommand(creatorConn, {
      command: "room.create",
      displayName: "Alice",
      config: { language: "TypeScript", difficulty: "easy", members: ["Alice"], intervalMinutes: 5 },
    });
    creatorId = broadcaster.createdFor(creatorConn).participantId;
    code = broadcaster.createdFor(creatorConn).code;
    await handlers.handleCommand(guestConn, { command: "room.join", code, displayName: "Bob", hasAiKey: false });
    guestId = roomViewOf(store, timers, code).participants.find((p) => p.displayName === "Bob")!.participantId;
    // Bob をローテーションに加える → rotation = [Alice, Bob] の各ID
    await handlers.handleCommand(creatorConn, { command: "member.add", participantId: guestId });
    broadcaster.sent.length = 0;
    broadcaster.snapshots.length = 0;
  });

  it("作成者が参加者を退出させ、一覧と rotation から消える", async () => {
    // Given
    const command = { command: "participant.remove", participantId: guestId } as const;

    // When
    await handlers.handleCommand(creatorConn, command);

    // Then
    const room = broadcaster.latestSnapshot();
    expect(room?.participants.find((p) => p.participantId === guestId)).toBeUndefined();
    // rotation は参加者IDの配列（D6b）
    expect(room?.session.rotation).not.toContain(guestId);
    expect(room?.session.rotation).toContain(creatorId);
  });

  // #95 S3 以前は「ホストでない参加者は実行できない（UNAUTHORIZED）」ことをここで固定していた。
  // 役割の廃止で誰でも実行できるようになったため、期待を反転させて固定し直す。
  it("作成者でない参加者も他人を退出させられる", async () => {
    // Given（後から参加した Bob が、ルームを作った Alice を対象にする）
    const command = { command: "participant.remove", participantId: creatorId } as const;

    // When
    const result = await handlers.handleCommand(guestConn, command);

    // Then
    expect(broadcaster.errorsTo(guestConn)).toEqual([]);
    expect(roomViewOf(store, timers, code).participants.find((p) => p.participantId === creatorId)).toBeUndefined();
    expect(result.isOk()).toBe(true);
  });

  it("最後の1人（rotation 1名）は外せない", async () => {
    // Given（rotation=[Bob] の状態を作る。Alice を対象にすると自己退出の経路になるため、
    // Alice を輪から抜いて Bob だけを残す）
    await handlers.handleCommand(creatorConn, { command: "member.remove", index: 0 }); // [Bob]
    broadcaster.sent.length = 0;

    // When（作成者が Bob を消そうとする）
    await handlers.handleCommand(creatorConn, { command: "participant.remove", participantId: guestId });

    // Then（拒否され、Bob はまだ居る。rotation 上の最後の1人なので拒否）
    const error = broadcaster.sent.find((s) => s.msg.type === "error" && (s.msg as { code: string }).code === "BelowMinMembers");
    expect(error).toBeTruthy();
    expect(roomViewOf(store, timers, code).participants.find((p) => p.participantId === guestId)).toBeTruthy();
  });
});

// ─── Issue #22 G3: 自己退出と他者退出 ────────────────────────────────────────
// 「不変条件（編集者以上が1名以上残る）」と「退出前のホスト引き継ぎ」は #95 S3 で
// 概念ごと消えたため、それらを固定していたケース（③③'⑤⑥⑦⑧⑨）はここから外した。

/**
 * @requirements FR-065, FR-079, US3, US5, Issue #32
 */
describe("participant.remove（G3: 自己退出と他者退出）", () => {
  let store: InMemoryRoomStore;
  let timers: InMemoryTimerStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let code: string;

  const CREATOR = "g3-creator";
  const BOB = "g3-bob";
  const CAROL = "g3-carol";

  /** 参加者を displayName から引く。 */
  const pidOf = (name: string): string =>
    roomViewOf(store, timers, code).participants.find((p) => p.displayName === name)!.participantId;

  /** 直近に connId 宛へ送られた error を返す。 */
  const lastError = (connId: string): { code: string; message: string } | undefined => {
    const found = [...broadcaster.sent].reverse().find(
      (s) => s.connId === connId && s.msg.type === "error",
    );
    if (!found || found.msg.type !== "error") return undefined;
    return { code: found.msg.code, message: found.msg.message };
  };

  /** Alice（作成者）/ Bob / Carol の3名が在室するルームを作る（全員同格）。 */
  async function setup(): Promise<void> {
    store = new InMemoryRoomStore();
    timers = new InMemoryTimerStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeTestHandlers({
      store,
      timers, clock: new FakeClock(1_000_000), broadcaster, codeGen: new FakeCodeGen(),
    });
    const created = await handlers.handleCommand(CREATOR, {
      command: "room.create",
      displayName: "Alice",
      config: { language: "TypeScript", difficulty: "easy", members: ["Alice", "Bob", "Carol"], intervalMinutes: 5 },
    });
    if (!created.isOk()) throw new Error("room.create failed");
    code = broadcaster.createdFor(CREATOR).code;
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

  beforeEach(setup);

  it("① 参加者が他人を退出させられる", async () => {
    // Given
    const carolId = pidOf("Carol");

    // When
    const result = await handlers.handleCommand(BOB, {
      command: "participant.remove", participantId: carolId,
    });

    // Then
    result._unsafeUnwrap();
    expect(roomViewOf(store, timers, code).participants.find((p) => p.participantId === carolId)).toBeUndefined();
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
    expect(roomViewOf(store, timers, code).participants.find((p) => p.participantId === carolId)).toBeUndefined();
  });

  it("④ 退出させられた本人へ通知が届く（他人に外された場合）", async () => {
    // Given
    const carolId = pidOf("Carol");

    // When
    await handlers.handleCommand(BOB, { command: "participant.remove", participantId: carolId });

    // Then（通知コードと文言の更新は G4 の担当。ここでは「本人へ届くこと」だけを固定する）
    expect(lastError(CAROL)).toBeTruthy();
  });

  it("④' 自己退出では本人へ LEFT_ROOM が届く（自分の操作として区別した通知）", async () => {
    // Given
    const carolId = pidOf("Carol");

    // When
    await handlers.handleCommand(CAROL, { command: "participant.remove", participantId: carolId });

    // Then
    expect(lastError(CAROL)?.code).toBe("LEFT_ROOM");
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
  let timers: InMemoryTimerStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let code: string;
  let creatorId: string;

  const CREATOR = "g7-creator";
  const REAL = "g7-real";
  const GHOST = "g7-ghost";

  const room = () => roomViewOf(store, timers, code);

  /**
   * Alice（作成者）と同名の Bob 2名（輪に居る本物・輪に居ない幽霊）が在室する部屋を作る。
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
    timers = new InMemoryTimerStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeTestHandlers({
      store,
      timers, clock: new FakeClock(1_000_000), broadcaster, codeGen: new FakeCodeGen(),
    });
    const created = await handlers.handleCommand(CREATOR, {
      command: "room.create",
      displayName: "Alice",
      config: { language: "TypeScript", difficulty: "easy", members: ["Alice"], intervalMinutes: 5 },
    });
    if (!created.isOk()) throw new Error("room.create failed");
    code = broadcaster.createdFor(CREATOR).code;
    creatorId = broadcaster.createdFor(CREATOR).participantId;
  });

  it("① 幽霊が後着でも、幽霊を退出させると本物の枠は残る", async () => {
    // Given
    const { realId, ghostId } = await setupBobs(false);
    expect(room().session.rotation).toContain(realId);

    // When
    const result = await handlers.handleCommand(CREATOR, {
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
    const result = await handlers.handleCommand(CREATOR, {
      command: "participant.remove", participantId: ghostId,
    });

    // Then
    result._unsafeUnwrap();
    expect(room().session.rotation).toContain(realId);
    expect(room().session.rotation).toEqual([creatorId, realId]);
  });

  it("② 枠を持つ本物を退出させると、その枠だけが外れる", async () => {
    // Given
    const { realId, ghostId } = await setupBobs(true);

    // When
    const result = await handlers.handleCommand(CREATOR, {
      command: "participant.remove", participantId: realId,
    });

    // Then
    result._unsafeUnwrap();
    expect(room().session.rotation).toEqual([creatorId]);
    // 幽霊は輪の外に居ただけなので在室したまま（巻き添えにしない）。
    expect(room().participants.some((p) => p.participantId === ghostId)).toBe(true);
  });

  it("③ 輪に本物1人だけのとき、その本物は最後のドライバー保護で外せない", async () => {
    // Given（Alice を輪から抜いて rotation=[本物Bob] にする）
    const { realId } = await setupBobs(true);
    await handlers.handleCommand(CREATOR, { command: "member.remove", index: 0 });
    expect(room().session.rotation).toEqual([realId]);
    broadcaster.sent.length = 0;

    // When
    const result = await handlers.handleCommand(CREATOR, {
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
    await handlers.handleCommand(CREATOR, {
      command: "member.remove", index: room().session.rotation.indexOf(realId),
    });
    expect(room().session.rotation).toEqual([creatorId]);
    broadcaster.sent.length = 0;

    // When（rotation 外の幽霊を退出させる）
    const result = await handlers.handleCommand(CREATOR, {
      command: "participant.remove", participantId: ghostId,
    });

    // Then（rotation に触れないので BelowMinMembers は関係ない）
    result._unsafeUnwrap();
    expect(room().session.rotation).toEqual([creatorId]);
  });
});
