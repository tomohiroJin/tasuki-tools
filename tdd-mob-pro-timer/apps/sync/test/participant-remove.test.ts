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
import type { RoomCodeGen } from "../src/ports/code-gen.js";
import type { Broadcaster } from "../src/ports/broadcaster.js";
import type { Room, ServerMsg } from "@tdd-mob/core";

class FakeCodeGen implements RoomCodeGen {
  private _c = 0;
  generate(): string { return `RM${String(++this._c).padStart(4, "0")}`; }
  generateParticipantId(): string { return `pid-${++this._c}`; }
  generateResumeToken(): string { return `rt-${++this._c}`; }
}
class SpyBroadcaster implements Broadcaster {
  readonly sent: Array<{ connId: string; msg: ServerMsg }> = [];
  readonly snapshots: Room[] = [];
  broadcastSnapshot(_c: string, room: Room): void { this.snapshots.push(room); }
  sendTo(connId: string, msg: ServerMsg): void { this.sent.push({ connId, msg }); }
  broadcastSignal(): void {}
}
const latest = (b: SpyBroadcaster) => b.snapshots[b.snapshots.length - 1];

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
    const created = await handlers.handleCommand(hostConn, {
      command: "room.create",
      displayName: "Alice",
      config: { language: "TypeScript", difficulty: "easy", members: ["Alice"], intervalMinutes: 5 },
    });
    if (created.isOk()) code = created.value.code;
    await handlers.handleCommand(guestConn, { command: "room.join", code, displayName: "Bob", hasAiKey: false });
    guestId = store.get(code)!.participants.find((p) => p.displayName === "Bob")!.participantId;
    // Bob をローテーションに加える（host が member.add）→ rotation = [Alice, Bob]
    await handlers.handleCommand(hostConn, { command: "member.add", name: "Bob" });
    broadcaster.sent.length = 0;
    broadcaster.snapshots.length = 0;
  });

  it("ホストが参加者を退出させ、一覧と rotation から消える", async () => {
    await handlers.handleCommand(hostConn, { command: "participant.remove", participantId: guestId });
    const room = latest(broadcaster);
    expect(room?.participants.find((p) => p.participantId === guestId)).toBeUndefined();
    expect(room?.session.rotation).not.toContain("Bob");
    expect(room?.session.rotation).toContain("Alice");
  });

  it("ホストでない参加者は実行できない（UNAUTHORIZED）", async () => {
    await handlers.handleCommand(guestConn, { command: "participant.remove", participantId: store.get(code)!.hostParticipantId });
    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error?.msg.type === "error" && error.msg.code).toBe("UNAUTHORIZED");
  });

  it("最後の1人（rotation 1名）は外せない", async () => {
    // Bob を rotation から外して rotation=[Alice] に戻す
    await handlers.handleCommand(hostConn, { command: "member.remove", index: 1 });
    // Alice(host) は自分なので別の参加者で確認: Bob を再加入し Alice を rotation から抜く…
    // 単純化: rotation=[Alice] の状態で Bob(非rotation) を消すのは可能。最後の1人の保護は
    // 「rotation 上の最後の1人」を対象にした場合に効く。ここでは Bob を rotation に戻して
    // Alice を消そうとする（Alice は host=自分なので別経路）。代わりに rotation=[Bob] にして
    // host が Bob を消す→最後の1人で拒否、を検証する。
    await handlers.handleCommand(hostConn, { command: "member.add", name: "Bob" }); // [Alice, Bob]
    await handlers.handleCommand(hostConn, { command: "member.remove", index: 0 }); // [Bob]
    broadcaster.sent.length = 0;
    await handlers.handleCommand(hostConn, { command: "participant.remove", participantId: guestId });
    const error = broadcaster.sent.find((s) => s.msg.type === "error" && (s.msg as { code: string }).code === "BelowMinMembers");
    expect(error).toBeTruthy();
    // Bob はまだ居る（rotation 上の最後の1人なので拒否）
    expect(store.get(code)!.participants.find((p) => p.participantId === guestId)).toBeTruthy();
  });
});

// ─── Issue #22 G3: 自己退出・不変条件・ホスト引き継ぎ ─────────────────────────
// 設計: docs/plans/host-spof-relaxation/plan.md「D2b」「D3」
// 要件: FR-065, FR-072, FR-073, FR-079, US3, US5

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
    code = created.value.code;
    await handlers.handleCommand(BOB, { command: "room.join", code, displayName: "Bob", hasAiKey: false });
    await handlers.handleCommand(CAROL, { command: "room.join", code, displayName: "Carol", hasAiKey: false });
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

  it("① 開始後は host でない editor が他人を退出させられる（FR-065）", async () => {
    await start();
    const carolId = pidOf("Carol");

    const result = await handlers.handleCommand(BOB, {
      command: "participant.remove", participantId: carolId,
    });

    expect(result.isOk()).toBe(true);
    expect(store.get(code)!.participants.find((p) => p.participantId === carolId)).toBeUndefined();
  });

  it("② 参加者は自分自身を退出させられる（FR-079）", async () => {
    const carolId = pidOf("Carol");

    const result = await handlers.handleCommand(CAROL, {
      command: "participant.remove", participantId: carolId,
    });

    expect(result.isOk()).toBe(true);
    expect(store.get(code)!.participants.find((p) => p.participantId === carolId)).toBeUndefined();
  });

  it("③ 実在の編集者以上が1名しか居ないとき、その1名は退出できない（FR-072/073）", async () => {
    // Bob と Carol を見学者へ降格し、編集者以上を Alice(host) だけにする。
    await handlers.handleCommand(HOST, { command: "role.set", participantId: pidOf("Bob"), role: "viewer" });
    await handlers.handleCommand(HOST, { command: "role.set", participantId: pidOf("Carol"), role: "viewer" });
    broadcaster.sent.length = 0;
    const aliceId = pidOf("Alice");

    const result = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: aliceId,
    });

    expect(result.isErr()).toBe(true);
    expect(lastError(HOST)?.code).toBe("LAST_MANAGER");
    expect(store.get(code)!.participants.find((p) => p.participantId === aliceId)).toBeTruthy();
  });

  it("③' 代理の編集者が別に居ても③の判定は変わらない（代理は頭数に入らない）", async () => {
    await handlers.handleCommand(HOST, { command: "participant.addProxy", displayName: "Proxy", participantId: "proxy-1" });
    await handlers.handleCommand(HOST, { command: "role.set", participantId: pidOf("Bob"), role: "viewer" });
    await handlers.handleCommand(HOST, { command: "role.set", participantId: pidOf("Carol"), role: "viewer" });
    broadcaster.sent.length = 0;
    const aliceId = pidOf("Alice");

    const result = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: aliceId,
    });

    expect(result.isErr()).toBe(true);
    expect(lastError(HOST)?.code).toBe("LAST_MANAGER");
  });

  it("④ 退出させられた本人へ通知が届く（他人に外された場合）", async () => {
    await start();
    const carolId = pidOf("Carol");

    await handlers.handleCommand(BOB, { command: "participant.remove", participantId: carolId });

    // 通知コードと文言の更新は T027（G4）の担当。ここでは「本人へ届くこと」だけを固定する。
    expect(lastError(CAROL)).toBeTruthy();
  });

  it("④' 自己退出では本人への退出通知を送らない（自分の操作なので通知は不要）", async () => {
    const carolId = pidOf("Carol");

    await handlers.handleCommand(CAROL, { command: "participant.remove", participantId: carolId });

    expect(lastError(CAROL)).toBeUndefined();
  });

  it("⑤ 開始前にホストが自己退出しても、残った編集者が phase.set を実行できる（D2b）", async () => {
    const aliceId = pidOf("Alice");

    const removed = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: aliceId,
    });
    expect(removed.isOk()).toBe(true);

    // ホストは在室者のうち joinedAt 最小（= Bob）へ引き継がれている。
    const after = store.get(code)!;
    expect(after.hostParticipantId).toBe(after.participants.find((p) => p.displayName === "Bob")!.participantId);
    expect(after.participants.find((p) => p.displayName === "Bob")!.role).toBe("host");

    // 引き継ぎが効いていなければ開始前の phase.set はホスト限定なので詰む。
    broadcaster.sent.length = 0;
    const phase = await handlers.handleCommand(BOB, { command: "phase.set", phase: "ready" });

    expect(phase.isOk()).toBe(true);
    expect(store.get(code)!.phase).toBe("ready");
  });

  it("⑥ 他人がホストを退出させた場合もホストが引き継がれる（D2b）", async () => {
    await start();
    const aliceId = pidOf("Alice");

    const result = await handlers.handleCommand(CAROL, {
      command: "participant.remove", participantId: aliceId,
    });

    expect(result.isOk()).toBe(true);
    const after = store.get(code)!;
    expect(after.participants.find((p) => p.participantId === aliceId)).toBeUndefined();
    // 退出した Alice ではなく、残った在室者のうち joinedAt 最小（Bob）が新ホスト。
    expect(after.hostParticipantId).toBe(after.participants.find((p) => p.displayName === "Bob")!.participantId);
  });

  it("⑧ 後継ホストにオフラインの見学者を選ばない（詰みの再導入を防ぐ）", async () => {
    // D2b の目的は「ホストが抜けた後も誰かが操作できる」こと。単に joinedAt 最小を選ぶと
    // オフラインの見学者が新ホストになり、オンラインの編集者が開始前操作を実行できない
    // という、D2b が防ぐはずだった詰みにそのまま戻る。しかも自動委譲は切断契機でしか
    // 発火しないため（既にオフラインの人が昇格しても新たなタイマーは張られない）救済もない。
    await handlers.handleCommand(HOST, { command: "role.set", participantId: pidOf("Bob"), role: "viewer" });
    handlers.handleConnectionClose(BOB);
    store.put({
      ...store.get(code)!,
      participants: store.get(code)!.participants.map((p) =>
        p.displayName === "Bob" ? { ...p, presence: "offline" as const } : p,
      ),
    });
    broadcaster.sent.length = 0;

    await handlers.handleCommand(HOST, { command: "participant.remove", participantId: pidOf("Alice") });

    // joinedAt は Bob < Carol だが、オフラインの見学者ではなくオンラインの編集者を選ぶ。
    const after = store.get(code)!;
    expect(after.hostParticipantId).toBe(after.participants.find((p) => p.displayName === "Carol")!.participantId);
    // 残ったオンラインの参加者が開始前操作を実行できる（詰んでいない）。
    const phase = await handlers.handleCommand(CAROL, { command: "phase.set", phase: "ready" });
    expect(phase.isOk()).toBe(true);
  });

  it("⑨ オンラインの編集者と見学者が居るときは編集者を選ぶ（見学の意思を尊重する）", async () => {
    // Bob（joinedAt 最小）を見学者にするが、オンラインのまま残す。
    await handlers.handleCommand(HOST, { command: "role.set", participantId: pidOf("Bob"), role: "viewer" });
    broadcaster.sent.length = 0;

    await handlers.handleCommand(HOST, { command: "participant.remove", participantId: pidOf("Alice") });

    const after = store.get(code)!;
    expect(after.hostParticipantId).toBe(after.participants.find((p) => p.displayName === "Carol")!.participantId);
    expect(after.participants.find((p) => p.displayName === "Bob")!.role).toBe("viewer");
  });

  it("⑦ 代理しか残らない場合はホストを引き継がずそのまま退出する（候補なし）", async () => {
    await handlers.handleCommand(HOST, { command: "participant.addProxy", displayName: "Proxy", participantId: "proxy-1" });
    // Bob と Carol を退出させ、実在の在室者を Alice だけにする。
    await handlers.handleCommand(HOST, { command: "participant.remove", participantId: pidOf("Bob") });
    await handlers.handleCommand(HOST, { command: "participant.remove", participantId: pidOf("Carol") });
    broadcaster.sent.length = 0;
    const aliceId = pidOf("Alice");

    // Alice は唯一の実在の編集者以上なので不変条件で拒否される（代理は頭数に入らない）。
    const result = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: aliceId,
    });

    expect(result.isErr()).toBe(true);
    expect(lastError(HOST)?.code).toBe("LAST_MANAGER");
  });
});

// ─── 同名参加者の巻き添え退出（G6・T040・D6 改訂） ────────────────────────────
// 実機検証で判明: rotation に居ない幽霊を退出させると、同名で rotation に居る本物が輪から外れる。
// 退出処理が rotation の位置を表示名で引いていたため。本 Issue の主要シナリオで発火する。
// rotation は表示名の配列のまま（設計は変えない・D6）、枠を外すかは
// 「その名前がまだ部屋に残るか」で決める。
// 要件: FR-085, SC-024

describe("participant.remove（G6: 同名参加者の巻き添えを防ぐ）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let code: string;

  const HOST = "g6-host";
  const REAL = "g6-real";
  const GHOST = "g6-ghost";

  const room = () => store.get(code)!;
  const pidOf = (name: string, nth = 0): string =>
    room().participants.filter((p) => p.displayName === name)[nth]!.participantId;

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({
      store, clock: new FakeClock(1_000_000), broadcaster, codeGen: new FakeCodeGen(),
    });
    const created = await handlers.handleCommand(HOST, {
      command: "room.create",
      displayName: "Alice",
      config: { language: "TypeScript", difficulty: "easy", members: ["Alice", "Bob"], intervalMinutes: 5 },
    });
    if (!created.isOk()) throw new Error("room.create failed");
    code = created.value.code;
    // 本物の Bob（rotation 内）と、二重参加の幽霊 Bob（rotation 外）。
    await handlers.handleCommand(REAL, { command: "room.join", code, displayName: "Bob", hasAiKey: false });
    await handlers.handleCommand(GHOST, { command: "room.join", code, displayName: "Bob", hasAiKey: false });
    broadcaster.sent.length = 0;
  });

  it("① rotation に居ない幽霊を退出させても、同名の本物の枠が残る（実機で踏んだ欠陥）", async () => {
    expect(room().session.rotation).toContain("Bob");
    const ghostId = pidOf("Bob", 1);

    const result = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: ghostId,
    });

    expect(result.isOk()).toBe(true);
    // 幽霊だけが消え、rotation は無傷。
    expect(room().participants.filter((p) => p.displayName === "Bob")).toHaveLength(1);
    expect(room().session.rotation).toContain("Bob");
  });

  it("② 枠の持ち主（先に参加した同名）を退出させると、従来どおり枠が外れる", async () => {
    const ownerId = pidOf("Bob", 0);

    const result = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: ownerId,
    });

    expect(result.isOk()).toBe(true);
    expect(room().session.rotation).not.toContain("Bob");
  });

  it("②' 無関係な同名者が居ても、枠の持ち主を消すときは最後のドライバー保護が働く", async () => {
    // レビューで実測された破綻シナリオの回帰テスト。
    // 「同名が1人でも残るなら枠を外さない」という規則にすると、無関係な同名者が
    // 居合わせただけで rotation を空にしない保護が素通りし、
    // 消えた本人の枠を別人が暗黙に引き継いでしまう。
    await handlers.handleCommand(HOST, { command: "member.remove", index: room().session.rotation.indexOf("Alice") });
    expect(room().session.rotation).toEqual(["Bob"]);
    broadcaster.sent.length = 0;
    const ownerId = pidOf("Bob", 0);

    const result = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: ownerId,
    });

    expect(result.isErr()).toBe(true);
    const err = [...broadcaster.sent].reverse().find((x) => x.msg.type === "error");
    expect(err?.msg.type === "error" && err.msg.code).toBe("BelowMinMembers");
    // 本人も枠も残る（別人が枠を引き継がない）。
    expect(room().participants.some((p) => p.participantId === ownerId)).toBe(true);
    expect(room().session.rotation).toEqual(["Bob"]);
  });

  it("③ 幽霊を消した後に本人を消すと、従来どおり rotation から外れる", async () => {
    // 幽霊（後から参加）は枠の持ち主ではないので、消しても枠は動かない。
    await handlers.handleCommand(HOST, { command: "participant.remove", participantId: pidOf("Bob", 1) });
    expect(room().session.rotation).toContain("Bob");
    const lastBob = pidOf("Bob", 0);

    const result = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: lastBob,
    });

    expect(result.isOk()).toBe(true);
    expect(room().session.rotation).not.toContain("Bob");
  });

  it("④ 枠を外さないケースでは最後のドライバー保護（BelowMinMembers）が誤発火しない", async () => {
    // rotation を [Alice] だけにしてから、rotation 外の幽霊を退出させる。
    await handlers.handleCommand(HOST, { command: "member.remove", index: room().session.rotation.indexOf("Bob") });
    expect(room().session.rotation).toEqual(["Alice"]);
    broadcaster.sent.length = 0;

    const result = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: pidOf("Bob", 1),
    });

    // rotation に触れないので BelowMinMembers は関係ない。
    expect(result.isOk()).toBe(true);
    expect(room().session.rotation).toEqual(["Alice"]);
  });
});
