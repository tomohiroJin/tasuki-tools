/**
 * チェックイン（`?tool=checkin`）のメッセージ層と配信（#406 Task 2.3）。
 *
 * 依存はフェイクとスパイで組む。**配信は本物の `makeCheckinBroadcaster`** を通し、送り先の記録（`sent`）で観測する。
 * 乱数は常に 0 を返す偽物。ハンドラはロガーを依存に持たない（ログを書けない。表示名・札をログへ出さないため）。
 */
import { describe, expect, it } from "bun:test";
import { createTokenBucketLimiter, DEFAULT_CAPACITY, DEFAULT_REFILL_PER_SEC } from "@tasuki/rate-limit";
import type { CheckinView } from "@tasuki/checkin-core";
import { CHECKIN_DISCONNECT_REVEAL_GRACE_MS, makeCheckinHandlers } from "../src/application/checkin-handlers.js";
import type { TimerPort } from "../src/application/agenda-deadlines.js";
import { makeCheckinBroadcaster } from "../src/application/checkin-broadcast.js";
import { createRateLimitGate } from "../src/application/rate-limit-gate.js";
import { createTokenStore } from "../src/application/token-store.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryCheckinStore } from "../src/adapters/in-memory-checkin-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { CheckinServerMsg } from "../src/ports/checkin-server-msg.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { spyHub } from "./support/hub.js";

const ROOM = "ROOM-A";

interface Sent {
  connId: string;
  msg: CheckinServerMsg;
}

/** 偽のタイマー（`agenda-deadlines.test.ts` と同じ形）。`advance` で待ちを手で進める。 */
function fakeTimer() {
  let now = 0;
  let seq = 0;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timer: TimerPort = {
    set(fn, ms) {
      const id = ++seq;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clear(handle) {
      pending.delete(handle as number);
    },
  };
  const advance = (ms: number): void => {
    const target = now + ms;
    for (;;) {
      const next = [...pending.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (next === undefined) break;
      pending.delete(next[0]);
      now = next[1].at;
      next[1].fn();
    }
    now = target;
  };
  return { timer, advance, pendingCount: () => pending.size };
}

function setup(randomInt: (n: number) => number = () => 0) {
  const grace = fakeTimer();
  const store = new InMemoryRoomStore();
  const checkins = new InMemoryCheckinStore();
  const sent: Sent[] = [];
  const record = (connId: string, msg: CheckinServerMsg): void => {
    sent.push({ connId, msg });
  };
  const broadcaster = makeCheckinBroadcaster({ store, checkins, send: record });
  const handlers = makeCheckinHandlers({
    store,
    timers: new InMemoryTimerStore(),
    clock: new FakeClock(1_000_000),
    codeGen: new FakeCodeGen(),
    tokenStore: createTokenStore(),
    rateLimitGate: createRateLimitGate(
      createTokenBucketLimiter({ capacity: DEFAULT_CAPACITY, refillPerSec: DEFAULT_REFILL_PER_SEC }),
    ),
    hub: spyHub(),
    timerBroadcaster: new SpyBroadcaster(),
    checkins,
    broadcaster,
    send: record,
    monotonicClock: { now: () => 5_000 },
    random: { randomInt },
    graceTimer: grace.timer,
  });
  store.put({ code: ROOM, createdAt: 0, participants: [] });
  return {
    handle: (connId: string, msg: unknown) =>
      handlers.handleMessage(connId, typeof msg === "string" ? msg : JSON.stringify(msg)),
    rosterChanged: (code: string) => handlers.rosterChanged(code),
    clearRoom: (code: string) => handlers.clearRoom(code),
    advance: grace.advance,
    pendingGrace: grace.pendingCount,
    store,
    checkins,
    sent,
  };
}
type Harness = ReturnType<typeof setup>;

async function joined(h: Harness, connId: string, name: string): Promise<void> {
  await h.handle(connId, { command: "room.join", code: ROOM, displayName: name });
  if (!h.sent.some((s) => s.connId === connId && s.msg.type === "room.joined")) {
    throw new Error(`前提の構築に失敗した: ${connId} が参加できていない`);
  }
  h.sent.length = 0;
}

const errorsTo = (h: Harness, connId: string): string[] =>
  h.sent.flatMap((s) => (s.connId === connId && s.msg.type === "error" ? [s.msg.code] : []));

const viewsTo = (h: Harness, connId: string): CheckinView[] =>
  h.sent.flatMap((s) => (s.connId === connId && s.msg.type === "checkin" ? [s.msg.state] : []));

const lastView = (h: Harness, connId: string): CheckinView => {
  const views = viewsTo(h, connId);
  const v = views[views.length - 1];
  if (v === undefined) throw new Error(`${connId} にフレームが届いていない`);
  return v;
};

/** 参加者の接続を全部外す（切断）。 */
function disconnect(h: Harness, displayName: string): void {
  const room = h.store.get(ROOM)!;
  h.store.put({
    ...room,
    participants: room.participants.map((p) => (p.displayName === displayName ? { ...p, connections: new Map() } : p)),
  });
}

/** 切断した参加者が同じ組で戻る（再読み込み）。 */
function reconnect(h: Harness, displayName: string, connId: string): void {
  const room = h.store.get(ROOM)!;
  h.store.put({
    ...room,
    participants: room.participants.map((p) =>
      p.displayName === displayName ? { ...p, connections: new Map([[connId, "checkin"]]) } : p,
    ),
  });
}

/** 参加者のチェックインの接続を選択画面（ハブ）の接続に替える（ハブへの移動）。 */
function moveToHub(h: Harness, displayName: string, connId: string): void {
  const room = h.store.get(ROOM)!;
  h.store.put({
    ...room,
    participants: room.participants.map((p) =>
      p.displayName === displayName ? { ...p, connections: new Map([[connId, null]]) } : p,
    ),
  });
}

/** 参加者を名簿から外す（退出）。 */
function leave(h: Harness, displayName: string): void {
  const room = h.store.get(ROOM)!;
  h.store.put({ ...room, participants: room.participants.filter((p) => p.displayName !== displayName) });
}

const pilesOf = (v: CheckinView) => {
  if (v.round?.status !== "revealed") throw new Error("開いていない");
  return v.round.piles;
};

/** 選択画面（ハブ）だけに居る参加者を名簿に足す。 */
function addHubOnly(h: Harness, id: string, name: string, connId: string): void {
  const room = h.store.get(ROOM)!;
  h.store.put({
    ...room,
    participants: [...room.participants, { id, displayName: name, connections: new Map([[connId, null]]), joinedAt: 0 }],
  });
}

/** 3 人（a・b と、ここでは入れない c）の用意。重さを避けるため a・b を既定にする。 */
async function twoPlayers(): Promise<Harness> {
  const h = setup();
  await joined(h, "a", "Alice");
  await joined(h, "b", "Bob");
  return h;
}

/** やり方を選んで新しい回を始める（準備用）。いまの回（無ければ 0）を置き換える */
const choose = (h: Harness, connId: string, method: string): Promise<void> =>
  h.handle(connId, { command: "checkin.method.choose", seq: h.checkins.get(ROOM)?.round?.seq ?? 0, method });

const seqOf = (v: CheckinView): number => v.round!.seq;

/**
 * @requirements #406 E1・E5・E6・E7
 */
describe("チェックインの接続でルームへ入る", () => {
  it("参加すると本人へ checkin フレームが 1 通届き、状態が無ければ既定が置かれる", async () => {
    const h = setup();

    await h.handle("a", { command: "room.join", code: ROOM, displayName: "Alice" });

    expect(h.sent.filter((s) => s.connId === "a").map((s) => s.msg.type)).toEqual(["room.joined", "checkin"]);
    expect(viewsTo(h, "a")).toHaveLength(1);
    expect(viewsTo(h, "a")[0]!.round).toBeNull();
    expect(h.checkins.get(ROOM)).toBeDefined();
    expect([...h.store.get(ROOM)!.participants[0]!.connections]).toEqual([["a", "checkin"]]);
  });

  it("room.create / room.check は INVALID_COMMAND、ハブとして在席している接続の操作は NOT_IN_ROOM", async () => {
    const h = setup();
    addHubOnly(h, "p-hub", "Hub", "h-1");

    await h.handle("x", { command: "room.create", roomName: "新しい部屋", displayName: "Alice" });
    await h.handle("x", { command: "room.check", code: "NOPE" });
    await h.handle("h-1", { command: "checkin.reveal", seq: 1 });
    await choose(h, "nobody", "weather");

    expect(errorsTo(h, "x")).toEqual(["INVALID_COMMAND", "INVALID_COMMAND"]);
    expect(errorsTo(h, "h-1")).toEqual(["NOT_IN_ROOM"]);
    expect(errorsTo(h, "nobody")).toEqual(["NOT_IN_ROOM"]);
    expect(h.store.list().map((r) => r.code)).toEqual([ROOM]);
  });
});

describe("受け手ごとの投影と自動公開", () => {
  it("a が出した後、b に届いたフレームに a の札が無く、a に届いたフレームの yourCard が a の札（E5）〈m505〉", async () => {
    const h = await twoPlayers();
    await choose(h, "a", "weather");
    h.sent.length = 0;
    const seq = 1;

    await h.handle("a", { command: "checkin.card.play", seq, card: "thunder" });

    const toA = lastView(h, "a");
    const toB = lastView(h, "b");
    expect(toA.you).not.toBe(toB.you);
    expect(toA.round).toMatchObject({ status: "open", yourCard: "thunder" });
    expect(toB.round).toMatchObject({ status: "open", yourCard: null });
    expect(JSON.stringify(toB)).not.toContain("thunder");
  });

  it("選択画面（ハブ）だけに居る c は札を出す人に数えない: a・b が出すと開く（判断 10）〈m506〉", async () => {
    const h = await twoPlayers();
    addHubOnly(h, "p-c", "Carol", "h-c");
    await choose(h, "a", "weather");

    await h.handle("a", { command: "checkin.card.play", seq: 1, card: "sunny" });
    expect(lastView(h, "a").round!.status).toBe("open");
    await h.handle("b", { command: "checkin.card.play", seq: 1, card: "rain" });

    expect(lastView(h, "a").round!.status).toBe("revealed");
    expect(lastView(h, "b").round!.status).toBe("revealed");
  });

  it("b がまだのまま切断して戻らなければ、猶予（10 秒）の後に a だけで開き、a に開いたフレームが届く〈m507〉", async () => {
    const h = await twoPlayers();
    await choose(h, "a", "weather");
    await h.handle("a", { command: "checkin.card.play", seq: 1, card: "sunny" });
    expect(lastView(h, "a").round!.status).toBe("open");
    h.sent.length = 0;

    disconnect(h, "Bob");
    h.rosterChanged(ROOM);
    // 切断しただけではすぐには開かない（再読み込みかもしれない）
    expect(lastView(h, "a").round!.status).toBe("open");
    h.advance(CHECKIN_DISCONNECT_REVEAL_GRACE_MS - 1);
    expect(h.checkins.get(ROOM)!.round!.status).toBe("open");

    h.advance(1);

    expect(lastView(h, "a").round!.status).toBe("revealed");
    expect(h.checkins.get(ROOM)!.round!.status).toBe("revealed");
    expect(h.pendingGrace()).toBe(0);
  });

  it("rosterChanged は状態が変わらなくても配る（席は名簿から導く）。状態が無ければ何もしない", async () => {
    const h = await twoPlayers();
    h.rosterChanged("NOPE");
    h.sent.length = 0;

    h.rosterChanged(ROOM);

    expect(viewsTo(h, "a")).toHaveLength(1);
    expect(viewsTo(h, "b")).toHaveLength(1);
    // 状態が無いルームでは何もしない
    const h2 = setup();
    h2.rosterChanged(ROOM);
    expect(h2.sent).toEqual([]);
  });

  it("開く前に途中で参加した c は札を出す人に入り、a・b が出しても c が出すまで開かない", async () => {
    const h = await twoPlayers();
    await choose(h, "a", "weather");
    await joined(h, "c", "Carol");

    await h.handle("a", { command: "checkin.card.play", seq: 1, card: "sunny" });
    await h.handle("b", { command: "checkin.card.play", seq: 1, card: "rain" });
    expect(lastView(h, "a").round!.status).toBe("open");
    await h.handle("c", { command: "checkin.card.play", seq: 1, card: "cloudy" });

    expect(lastView(h, "a").round!.status).toBe("revealed");
  });

  it("見学中の c が送った checkin.reveal で開く。見学中の c の checkin.card.play は CHECKIN_SPECTATING（判断 4）", async () => {
    const h = await twoPlayers();
    await joined(h, "c", "Carol");
    await choose(h, "a", "weather");
    await h.handle("c", { command: "checkin.spectator.set", spectator: true });

    await h.handle("c", { command: "checkin.card.play", seq: 1, card: "sunny" });
    expect(errorsTo(h, "c")).toEqual(["CHECKIN_SPECTATING"]);
    h.sent.length = 0;
    await h.handle("c", { command: "checkin.reveal", seq: 1 });

    expect(errorsTo(h, "c")).toEqual([]);
    expect(lastView(h, "a").round!.status).toBe("revealed");
    expect(lastView(h, "c").spectating).toBe(true);
  });

  it("古い seq の checkin.reveal は全員へは配らず、送り主にだけ 1 通", async () => {
    const h = await twoPlayers();
    await choose(h, "a", "weather");
    await h.handle("a", { command: "checkin.again", seq: 1 });
    expect(seqOf(lastView(h, "a"))).toBe(2);
    h.sent.length = 0;

    await h.handle("b", { command: "checkin.reveal", seq: 1 });

    expect(h.sent.map((s) => s.connId)).toEqual(["b"]);
    expect(viewsTo(h, "b")[0]!.round).toMatchObject({ seq: 2, status: "open" });
  });
});

/**
 * 切断による自動公開の猶予（#406 PR のレビュー・ADR 0028）。
 * まだの人の再読み込み・瞬断で匿名の回が開くと、戻った人には山 1 枚で残った人の札が分かる。
 */
describe("切断による自動公開の猶予", () => {
  /** 匿名の回で a だけが出した局面（b はまだ） */
  async function anonymousAPlayed(): Promise<Harness> {
    const h = await twoPlayers();
    await choose(h, "a", "energy");
    expect(h.checkins.get(ROOM)!.round!.visibility).toBe("anonymous");
    await h.handle("a", { command: "checkin.card.play", seq: 1, card: "1" });
    h.sent.length = 0;
    return h;
  }

  it("匿名の回で b が切断して猶予の内に戻ると開かない（戻った b のフレームに a の札が載らない）〈m523〉", async () => {
    const h = await anonymousAPlayed();

    disconnect(h, "Bob");
    h.rosterChanged(ROOM);
    h.advance(CHECKIN_DISCONNECT_REVEAL_GRACE_MS - 1);
    reconnect(h, "Bob", "b2");
    h.rosterChanged(ROOM);
    h.advance(CHECKIN_DISCONNECT_REVEAL_GRACE_MS * 2);

    expect(h.checkins.get(ROOM)!.round!.status).toBe("open");
    for (const s of h.sent) {
      if (s.msg.type === "checkin") expect(s.msg.state.round!.status).toBe("open");
    }
    expect(JSON.stringify(viewsTo(h, "b2"))).not.toContain('"1"');
    expect(h.pendingGrace()).toBe(0);
  });

  it("b がハブへ移っても猶予を置く（再読み込みと見分けられない）。戻らなければ猶予の後に開く", async () => {
    const h = await anonymousAPlayed();

    moveToHub(h, "Bob", "h-b");
    h.rosterChanged(ROOM);
    expect(h.checkins.get(ROOM)!.round!.status).toBe("open");
    h.advance(CHECKIN_DISCONNECT_REVEAL_GRACE_MS);

    expect(h.checkins.get(ROOM)!.round!.status).toBe("revealed");
    expect(lastView(h, "a").round!.status).toBe("revealed");
  });

  it("b が退出（名簿から外れる）ならすぐ開く。選択画面だけに居る c がいても待たない", async () => {
    const h = await anonymousAPlayed();
    addHubOnly(h, "p-c", "Carol", "h-c");
    h.rosterChanged(ROOM);
    expect(h.pendingGrace()).toBe(0);

    leave(h, "Bob");
    h.rosterChanged(ROOM);

    expect(h.checkins.get(ROOM)!.round!.status).toBe("revealed");
    expect(lastView(h, "a").round!.status).toBe("revealed");
    expect(h.pendingGrace()).toBe(0);
  });

  it("b が切断している間に a が出しても、その場では開かず、猶予の後に開く", async () => {
    const h = await twoPlayers();
    await choose(h, "a", "energy");
    disconnect(h, "Bob");
    h.rosterChanged(ROOM);

    await h.handle("a", { command: "checkin.card.play", seq: 1, card: "1" });
    expect(h.checkins.get(ROOM)!.round!.status).toBe("open");
    expect(lastView(h, "a").round!.status).toBe("open");

    h.advance(CHECKIN_DISCONNECT_REVEAL_GRACE_MS);
    expect(h.checkins.get(ROOM)!.round!.status).toBe("revealed");
  });

  it("猶予の間に「待たずに開く」で開いたら、猶予のタイマーは残らない", async () => {
    const h = await anonymousAPlayed();
    disconnect(h, "Bob");
    h.rosterChanged(ROOM);
    expect(h.pendingGrace()).toBe(1);

    await h.handle("a", { command: "checkin.reveal", seq: 1 });

    expect(h.checkins.get(ROOM)!.round!.status).toBe("revealed");
    expect(h.pendingGrace()).toBe(0);
  });

  it("猶予の間に別のやり方で新しい回を始めたら、猶予のタイマーは残らず、新しい回は開かない", async () => {
    const h = await anonymousAPlayed();
    disconnect(h, "Bob");
    h.rosterChanged(ROOM);

    await choose(h, "a", "weather");
    h.advance(CHECKIN_DISCONNECT_REVEAL_GRACE_MS);

    expect(h.pendingGrace()).toBe(0);
    expect(h.checkins.get(ROOM)!.round).toMatchObject({ seq: 2, status: "open" });
  });

  it("猶予の間にルームが破棄されると（clearRoom）、タイマーが残らず、時間が経っても何も送らない", async () => {
    const h = await anonymousAPlayed();
    disconnect(h, "Bob");
    h.rosterChanged(ROOM);
    expect(h.pendingGrace()).toBe(1);

    h.clearRoom(ROOM);
    h.store.remove(ROOM);
    h.checkins.delete(ROOM);
    h.sent.length = 0;
    h.advance(CHECKIN_DISCONNECT_REVEAL_GRACE_MS * 2);

    expect(h.pendingGrace()).toBe(0);
    expect(h.sent).toEqual([]);
  });

  it("clearRoom を通らずにルームが消えても、猶予の発火は何も送らない", async () => {
    const h = await anonymousAPlayed();
    disconnect(h, "Bob");
    h.rosterChanged(ROOM);
    h.store.remove(ROOM);
    h.checkins.delete(ROOM);
    h.sent.length = 0;

    h.advance(CHECKIN_DISCONNECT_REVEAL_GRACE_MS);

    expect(h.sent).toEqual([]);
    expect(h.checkins.get(ROOM)).toBeUndefined();
  });
});

describe("匿名と公開の仕方の鍵", () => {
  it("匿名で開いた後に届いたすべてのフレームに、他人の ID と札の組が無い（E6）", async () => {
    const h = await twoPlayers();
    await choose(h, "a", "energy");
    await h.handle("a", { command: "checkin.card.play", seq: 1, card: "5" });
    await h.handle("b", { command: "checkin.card.play", seq: 1, card: "1" });

    const frames = h.sent.filter((s) => s.msg.type === "checkin");
    const afterReveal = frames.filter((s) => s.msg.type === "checkin" && s.msg.state.round?.status === "revealed");
    expect(afterReveal.map((s) => s.connId).sort()).toEqual(["a", "b"]);
    for (const { msg } of afterReveal) {
      if (msg.type !== "checkin") continue;
      const round = msg.state.round!;
      if (round.status !== "revealed") throw new Error("開いていない");
      const text = JSON.stringify(msg);
      expect(text).not.toContain('"names"');
      expect(text).not.toContain("yourCard");
      expect(round.seats.every((x) => Object.keys(x).sort().join() === "id,name,played")).toBe(true);
      expect(round.piles.find((p) => p.card === "5")).toEqual({ card: "5", count: 1 });
      expect(round.piles.every((p) => Object.keys(p).sort().join() === "card,count")).toBe(true);
    }
  });

  it("名前つきで開くと山に名前が載る", async () => {
    const h = await twoPlayers();
    await choose(h, "a", "weather");
    await h.handle("a", { command: "checkin.card.play", seq: 1, card: "sunny" });
    await h.handle("b", { command: "checkin.card.play", seq: 1, card: "rain" });

    const round = lastView(h, "b").round!;
    if (round.status !== "revealed") throw new Error("開いていない");
    expect(round.piles.find((p) => p.card === "sunny")!.names).toEqual(["Alice"]);
  });

  it("匿名で開いた後に 1 人が退出しても、全員へのフレームの山が変わらない（前後の差で札が分からない）〈m520〉", async () => {
    const h = await twoPlayers();
    await joined(h, "c", "Carol");
    await choose(h, "a", "energy");
    await h.handle("a", { command: "checkin.card.play", seq: 1, card: "1" });
    await h.handle("b", { command: "checkin.card.play", seq: 1, card: "5" });
    await h.handle("c", { command: "checkin.card.play", seq: 1, card: "5" });
    const before = { b: pilesOf(lastView(h, "b")), c: pilesOf(lastView(h, "c")) };
    h.sent.length = 0;

    leave(h, "Alice");
    h.rosterChanged(ROOM);
    // 退出の後の操作（prune を通る）でも変わらない
    await h.handle("b", { command: "checkin.spectator.set", spectator: true });

    for (const connId of ["b", "c"] as const) {
      const views = viewsTo(h, connId);
      expect(views.length).toBeGreaterThanOrEqual(2);
      for (const v of views) expect(pilesOf(v)).toEqual(before[connId]);
      expect(pilesOf(views[views.length - 1]!).find((p) => p.card === "1")).toEqual({ card: "1", count: 1 });
      // 席は名簿どおり（外れた人は並ばない）
      expect(views[0]!.round!.seats.map((x) => x.name)).toEqual(["Bob", "Carol"]);
    }
  });

  it("名前つきで開いた後に 1 人が退出しても、山の count と names が変わらない〈m520〉", async () => {
    const h = await twoPlayers();
    await choose(h, "a", "weather");
    await h.handle("a", { command: "checkin.card.play", seq: 1, card: "sunny" });
    await h.handle("b", { command: "checkin.card.play", seq: 1, card: "rain" });
    const before = pilesOf(lastView(h, "b"));
    h.sent.length = 0;

    leave(h, "Alice");
    h.rosterChanged(ROOM);

    const after = pilesOf(lastView(h, "b"));
    expect(after).toEqual(before);
    expect(after.find((p) => p.card === "sunny")).toEqual({ card: "sunny", count: 1, names: ["Alice"] });
  });

  it("開いた後の checkin.visibility.set は CHECKIN_VISIBILITY_LOCKED（E7）", async () => {
    const h = await twoPlayers();
    await choose(h, "a", "weather");
    await h.handle("a", { command: "checkin.card.play", seq: 1, card: "sunny" });
    await h.handle("b", { command: "checkin.card.play", seq: 1, card: "rain" });
    h.sent.length = 0;

    await h.handle("a", { command: "checkin.visibility.set", seq: 1, visibility: "anonymous" });

    expect(errorsTo(h, "a")).toEqual(["CHECKIN_VISIBILITY_LOCKED"]);
    expect(h.sent).toHaveLength(1);
  });
});

describe("公開の仕方を変えた直後の札・置き換える回の取り違え", () => {
  it("匿名の回で B の「名前つき」が先に届くと、匿名の画面で押した A の札（古い seq）は入らず、A に今の状態が届く〈m521〉", async () => {
    const h = await twoPlayers();
    await choose(h, "a", "energy");
    expect(lastView(h, "a").round).toMatchObject({ seq: 1, visibility: "anonymous" });
    h.sent.length = 0;

    await h.handle("b", { command: "checkin.visibility.set", seq: 1, visibility: "named" });
    await h.handle("a", { command: "checkin.card.play", seq: 1, card: "3" });

    expect(h.checkins.get(ROOM)!.round!.cards.size).toBe(0);
    expect(errorsTo(h, "a")).toEqual([]);
    const now = lastView(h, "a").round!;
    expect(now).toMatchObject({ seq: 2, visibility: "named", status: "open", yourCard: null });
  });

  it("札が 0 枚で開いた後の checkin.visibility.set も CHECKIN_VISIBILITY_LOCKED", async () => {
    const h = await twoPlayers();
    await choose(h, "a", "weather");
    await h.handle("a", { command: "checkin.reveal", seq: 1 });
    h.sent.length = 0;

    await h.handle("a", { command: "checkin.visibility.set", seq: 1, visibility: "anonymous" });

    expect(errorsTo(h, "a")).toEqual(["CHECKIN_VISIBILITY_LOCKED"]);
    expect(h.checkins.get(ROOM)!.round!.visibility).toBe("named");
  });

  it("ほぼ同時の 2 回目の選択（古い回を置き換えるつもり）は、札の入った新しい回を捨てず、送り主に今の状態だけを返す〈m522〉", async () => {
    const h = await twoPlayers();
    await choose(h, "a", "weather");
    await h.handle("a", { command: "checkin.method.choose", seq: 1, method: "energy" });
    await h.handle("a", { command: "checkin.card.play", seq: 2, card: "4" });
    const before = h.checkins.get(ROOM);
    h.sent.length = 0;

    await h.handle("b", { command: "checkin.method.choose", seq: 1, method: "roti" });
    await h.handle("b", { command: "checkin.method.draw", seq: 1, side: "checkout" });

    expect(h.checkins.get(ROOM)).toBe(before);
    expect(errorsTo(h, "b")).toEqual([]);
    expect(h.sent.map((s) => s.connId)).toEqual(["b", "b"]);
    expect(lastView(h, "b").round).toMatchObject({ seq: 2, method: "energy" });
  });
});

describe("くじ", () => {
  it("乱数 0 のくじは候補の先頭を選ぶ", async () => {
    const h = await twoPlayers();

    await h.handle("a", { command: "checkin.method.draw", seq: 0, side: "checkin" });

    expect(lastView(h, "b").round).toMatchObject({ method: "weather", seq: 1 });
  });

  it("乱数源が範囲外を返すと INTERNAL_ERROR で、状態は保管も配信もされない", async () => {
    const h = setup(() => 99);
    await joined(h, "a", "Alice");
    const before = h.checkins.get(ROOM);

    await h.handle("a", { command: "checkin.method.draw", seq: 0, side: "checkin" });

    expect(errorsTo(h, "a")).toEqual(["INTERNAL_ERROR"]);
    expect(h.sent).toHaveLength(1);
    expect(h.checkins.get(ROOM)).toBe(before);
  });
});
