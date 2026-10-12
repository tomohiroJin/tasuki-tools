/**
 * ルーレット（`?tool=roulette`）のメッセージ層と、ルーレットの配信（#94）。
 *
 * 依存はフェイクとスパイで組む。**配信は本物の `makeRouletteBroadcaster`** を通し、送り先の
 * 記録（`sent`）で観測する —— 本番の観測点は送信であって、ハンドラの戻り値ではない。
 * 時計は単調時計の偽物（手で進める）、乱数は常に 0 を返す偽物（最悪の偏り）。
 */
import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { createTokenBucketLimiter, DEFAULT_CAPACITY, DEFAULT_REFILL_PER_SEC } from "@tasuki/rate-limit";
import { SPIN_DURATION_MS, type RouletteView } from "@tasuki/roulette-core";
import { makeRouletteHandlers } from "../src/application/roulette-handlers.js";
import { makeRouletteBroadcaster } from "../src/application/roulette-broadcast.js";
import { createRateLimitGate } from "../src/application/rate-limit-gate.js";
import { createTokenStore } from "../src/application/token-store.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryRouletteStore } from "../src/adapters/in-memory-roulette-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { MonotonicClock } from "../src/ports/poker-monotonic-clock.js";
import type { RandomSource } from "../src/ports/random-source.js";
import type { RouletteServerMsg } from "../src/ports/roulette-server-msg.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";
import { spyHub } from "./support/hub.js";

const ROOM = "ROOM-A";

interface Sent {
  connId: string;
  msg: RouletteServerMsg;
}

interface Harness {
  handle: (connId: string, msg: unknown) => Promise<void>;
  store: InMemoryRoomStore;
  roulettes: InMemoryRouletteStore;
  sent: Sent[];
  /** 単調時計を進める */
  advance: (ms: number) => void;
  /** `randomInt` に渡された n の記録 */
  randomCalls: number[];
}

function setup(): Harness {
  const store = new InMemoryRoomStore();
  const roulettes = new InMemoryRouletteStore();
  const sent: Sent[] = [];
  const randomCalls: number[] = [];
  let now = 5_000;
  const monotonicClock: MonotonicClock = { now: () => now };
  const random: RandomSource = {
    randomInt: (n) => {
      randomCalls.push(n);
      return 0;
    },
    randomSettle: () => 0.5,
  };
  const record = (ids: string[], msg: RouletteServerMsg): void => {
    for (const connId of ids) sent.push({ connId, msg });
  };
  const broadcaster = makeRouletteBroadcaster({ store, roulettes, clock: monotonicClock, send: record });
  const handlers = makeRouletteHandlers({
    store,
    timers: new InMemoryTimerStore(),
    clock: new FakeClock(1_000_000),
    codeGen: new FakeCodeGen(),
    tokenStore: createTokenStore(),
    rateLimitGate: createRateLimitGate(
      createTokenBucketLimiter({ capacity: DEFAULT_CAPACITY, refillPerSec: DEFAULT_REFILL_PER_SEC }),
    ),
    hub: spyHub(),
    roulettes,
    broadcaster,
    send: (connId, msg) => record([connId], msg),
    monotonicClock,
    random,
  });
  store.put({ code: ROOM, createdAt: 0, participants: [] });
  return {
    handle: (connId, msg) => handlers.handleMessage(connId, typeof msg === "string" ? msg : JSON.stringify(msg)),
    store,
    roulettes,
    sent,
    advance: (ms) => {
      now += ms;
    },
    randomCalls,
  };
}

/** ルーレットの接続でルームへ参加し、記録を空にする。 */
async function joined(h: Harness, connId: string, name: string): Promise<void> {
  await h.handle(connId, { command: "room.join", code: ROOM, displayName: name });
  if (!h.sent.some((s) => s.connId === connId && s.msg.type === "room.joined")) {
    throw new Error(`前提の構築に失敗した: ${connId} が参加できていない`);
  }
  h.sent.length = 0;
}

const errorsTo = (h: Harness, connId: string): string[] =>
  h.sent.flatMap((s) => (s.connId === connId && s.msg.type === "error" ? [s.msg.code] : []));

const viewsTo = (h: Harness, connId: string): RouletteView[] =>
  h.sent.flatMap((s) => (s.connId === connId && s.msg.type === "roulette" ? [s.msg.state] : []));

/** 参加者の接続を全部外す（離席中にする）。 */
function goOffline(h: Harness, displayName: string): void {
  const room = h.store.get(ROOM)!;
  h.store.put({
    ...room,
    participants: room.participants.map((p) => (p.displayName === displayName ? { ...p, connections: new Map() } : p)),
  });
}

/**
 * @requirements #94 E1・E10・E11
 */
describe("ルーレットの接続でルームへ入る", () => {
  it("参加すると、本人へ復帰の組と既定のルーレットの状態が届き、在席がルーレットの接続として載る", async () => {
    // Given
    const h = setup();

    // When
    await h.handle("r-1", { command: "room.join", code: ROOM, displayName: "Alice" });

    // Then: 復帰の組 → いまの状態の順で届く
    expect(h.sent.filter((s) => s.connId === "r-1").map((s) => s.msg.type)).toEqual(["room.joined", "roulette"]);
    expect(viewsTo(h, "r-1")).toEqual([{ excluded: [], guests: [], drawn: [], spin: null }]);
    expect([...h.store.get(ROOM)!.participants[0]!.connections]).toEqual([["r-1", "roulette"]]);
  });

  it("存在しないルームへの参加は拒まれ、状態は作られない", async () => {
    // Given
    const h = setup();

    // When
    await h.handle("r-1", { command: "room.join", code: "NOPE", displayName: "Alice" });

    // Then
    expect(errorsTo(h, "r-1")).toEqual(["ROOM_NOT_FOUND"]);
    expect(h.roulettes.get("NOPE")).toBeUndefined();
  });

  it("room.create / room.check は INVALID_COMMAND で拒まれ、ルームは増えない", async () => {
    // Given
    const h = setup();

    // When
    await h.handle("r-1", { command: "room.create", roomName: "新しい部屋", displayName: "Alice" });
    await h.handle("r-1", { command: "room.check", code: "NOPE" });

    // Then
    expect(errorsTo(h, "r-1")).toEqual(["INVALID_COMMAND", "INVALID_COMMAND"]);
    expect(h.store.list().map((r) => r.code)).toEqual([ROOM]);
  });

  it("2 度目の room.join は拒まれ、名簿は変わらない", async () => {
    // Given
    const h = setup();
    await joined(h, "r-1", "Alice");
    const before = h.store.get(ROOM)!.participants;

    // When
    await h.handle("r-1", { command: "room.join", code: ROOM, displayName: "Alice2" });

    // Then
    expect(errorsTo(h, "r-1")).toEqual(["INVALID_COMMAND"]);
    expect(h.store.get(ROOM)!.participants).toBe(before);
  });

  it("JSON でない文字列は INVALID_JSON、知らないコマンドは INVALID_COMMAND", async () => {
    // Given
    const h = setup();

    // When
    await h.handle("r-1", "{not json");
    await h.handle("r-1", { command: "topic.clear" });

    // Then
    expect(errorsTo(h, "r-1")).toEqual(["INVALID_JSON", "INVALID_COMMAND"]);
  });
});

/**
 * @requirements #94 E1・E2・E5
 */
describe("回す", () => {
  it("2 人で 2 回回すと、2 回目は 1 回目と違う人（乱数が常に 0 でも）", async () => {
    // Given: 乱数は常に 0 を返す
    const h = setup();
    await joined(h, "r-1", "Alice");
    await joined(h, "r-2", "Bob");

    // When
    await h.handle("r-1", { command: "roulette.spin" });
    h.advance(SPIN_DURATION_MS);
    await h.handle("r-1", { command: "roulette.spin" });

    // Then
    const spins = viewsTo(h, "r-1").map((v) => v.spin!);
    expect(spins.map((s) => s.seq)).toEqual([1, 2]);
    const winners = spins.map((s) => s.wheel[s.winnerIndex]!.name);
    expect(winners[0]).not.toBe(winners[1]);
  });

  it("回すと、同じルームの全ルーレット接続へ同じ seq・winnerIndex・settle・回した人が届く", async () => {
    // Given
    const h = setup();
    await joined(h, "r-1", "Alice");
    await joined(h, "r-2", "Bob");

    // When
    await h.handle("r-2", { command: "roulette.spin" });

    // Then
    const a = viewsTo(h, "r-1")[0]!.spin!;
    const b = viewsTo(h, "r-2")[0]!.spin!;
    expect(a).toEqual(b);
    expect(a.spunBy).toBe("Bob");
    expect(a.wheel.map((e) => e.name)).toEqual(["Alice", "Bob"]);
  });

  it("回転中の roulette.spin は ROULETTE_SPINNING で、配信は増えず lastSpin.seq も変わらない", async () => {
    // Given: 1 回回した直後
    const h = setup();
    await joined(h, "r-1", "Alice");
    await joined(h, "r-2", "Bob");
    await h.handle("r-1", { command: "roulette.spin" });
    h.sent.length = 0;
    h.advance(SPIN_DURATION_MS - 1);

    // When
    await h.handle("r-2", { command: "roulette.spin" });

    // Then
    expect(errorsTo(h, "r-2")).toEqual(["ROULETTE_SPINNING"]);
    expect(h.sent.filter((s) => s.msg.type === "roulette")).toEqual([]);
    expect(h.roulettes.get(ROOM)!.lastSpin!.seq).toBe(1);
  });

  it("離席中（接続 0 本）の参加者を除くと 1 人になるルームでは回せない（ROULETTE_TOO_FEW）", async () => {
    // Given: Bob が離席中
    const h = setup();
    await joined(h, "r-1", "Alice");
    await joined(h, "r-2", "Bob");
    goOffline(h, "Bob");

    // When
    await h.handle("r-1", { command: "roulette.spin" });

    // Then: 離席中も入れる実装なら回せてしまう
    expect(errorsTo(h, "r-1")).toEqual(["ROULETTE_TOO_FEW"]);
    expect(h.roulettes.get(ROOM)!.lastSpin).toBeNull();
  });

  it("ハブとして在席している人は在室なので、入る人に数える", async () => {
    // Given: Bob は選択画面（ハブ）に居る。接続があれば online
    const h = setup();
    await joined(h, "r-1", "Alice");
    const room = h.store.get(ROOM)!;
    h.store.put({
      ...room,
      participants: [
        ...room.participants,
        { id: "p-bob", displayName: "Bob", connections: new Map([["hub-1", null]]), joinedAt: 1 },
      ],
    });

    // When
    await h.handle("r-1", { command: "roulette.spin" });

    // Then
    expect(viewsTo(h, "r-1")[0]!.spin!.wheel.map((e) => e.name)).toEqual(["Alice", "Bob"]);
  });

  it("回転の途中（時計を 2000ms 進めた後）に参加した接続へ届く elapsedMs は 2000", async () => {
    // Given: 回して 2000ms 経った
    const h = setup();
    await joined(h, "r-1", "Alice");
    await joined(h, "r-2", "Bob");
    await h.handle("r-1", { command: "roulette.spin" });
    h.advance(2000);

    // When: 途中から Carol が参加する
    await h.handle("r-3", { command: "room.join", code: ROOM, displayName: "Carol" });

    // Then: 回した直後の 0 ではなく、送る時点の経過
    expect(viewsTo(h, "r-3")[0]!.spin!.elapsedMs).toBe(2000);
    expect(viewsTo(h, "r-3")[0]!.spin!.durationMs).toBe(SPIN_DURATION_MS);
  });

  it("ルーレットとして在席していない接続（ハブとして在席）の roulette.spin は NOT_IN_ROOM", async () => {
    // Given: Alice と Bob はルーレット、Hub さんはハブとして在席
    const h = setup();
    await joined(h, "r-1", "Alice");
    await joined(h, "r-2", "Bob");
    const room = h.store.get(ROOM)!;
    h.store.put({
      ...room,
      participants: [
        ...room.participants,
        { id: "p-hub", displayName: "Hub", connections: new Map([["hub-1", null]]), joinedAt: 1 },
      ],
    });

    // When
    await h.handle("hub-1", { command: "roulette.spin" });

    // Then: 状態は変わらない
    expect(errorsTo(h, "hub-1")).toEqual(["NOT_IN_ROOM"]);
    expect(h.roulettes.get(ROOM)!.lastSpin).toBeNull();
  });
});

/**
 * @requirements #94 E13
 */
describe("外す・名前を足す", () => {
  it("roulette.include で外すと入る人から落ち、戻すと入る。知らない ID は黙って無視される", async () => {
    // Given
    const h = setup();
    await joined(h, "r-1", "Alice");
    await joined(h, "r-2", "Bob");
    const bobId = h.store.get(ROOM)!.participants[1]!.id;

    // When
    await h.handle("r-1", { command: "roulette.include", id: bobId, included: false });
    await h.handle("r-1", { command: "roulette.include", id: "p-unknown", included: false });

    // Then: Bob を外すと 1 人になり回せない。知らない ID は excluded に残らない
    expect(h.roulettes.get(ROOM)!.excluded).toEqual([bobId]);
    await h.handle("r-1", { command: "roulette.spin" });
    expect(errorsTo(h, "r-1")).toEqual(["ROULETTE_TOO_FEW"]);
    await h.handle("r-1", { command: "roulette.include", id: bobId, included: true });
    expect(h.roulettes.get(ROOM)!.excluded).toEqual([]);
  });

  it("名前を足すと入る人に加わる。表示名の規約で落ちる名前（空白だけ・不可視文字だけ）は INVALID_GUEST_NAME", async () => {
    // Given
    const h = setup();
    await joined(h, "r-1", "Alice");

    // When
    await h.handle("r-1", { command: "roulette.guest.add", name: "   " });
    await h.handle("r-1", { command: "roulette.guest.add", name: "​​" });
    await h.handle("r-1", { command: "roulette.guest.add", name: "  山田  " });

    // Then: 規約を通さない実装は、空白だけの名前を足してしまう。通った名前は正規化されている
    expect(errorsTo(h, "r-1")).toEqual(["INVALID_GUEST_NAME", "INVALID_GUEST_NAME"]);
    expect(h.roulettes.get(ROOM)!.guests.map((g) => g.name)).toEqual(["山田"]);
  });

  it("在室者・離席中の参加者・ほかのゲストと同じ名前は GUEST_NAME_TAKEN", async () => {
    // Given: Bob は離席中
    const h = setup();
    await joined(h, "r-1", "Alice");
    await joined(h, "r-2", "Bob");
    goOffline(h, "Bob");
    await h.handle("r-1", { command: "roulette.guest.add", name: "山田" });
    h.sent.length = 0;

    // When
    await h.handle("r-1", { command: "roulette.guest.add", name: "Alice" });
    await h.handle("r-1", { command: "roulette.guest.add", name: "Bob" });
    await h.handle("r-1", { command: "roulette.guest.add", name: "山田" });

    // Then
    expect(errorsTo(h, "r-1")).toEqual(["GUEST_NAME_TAKEN", "GUEST_NAME_TAKEN", "GUEST_NAME_TAKEN"]);
  });

  it("13 件目の名前は TOO_MANY_GUESTS", async () => {
    // Given
    const h = setup();
    await joined(h, "r-1", "Alice");
    for (let i = 0; i < 12; i++) await h.handle("r-1", { command: "roulette.guest.add", name: `客${i}` });
    h.sent.length = 0;

    // When
    await h.handle("r-1", { command: "roulette.guest.add", name: "あふれ" });

    // Then
    expect(errorsTo(h, "r-1")).toEqual(["TOO_MANY_GUESTS"]);
  });

  it("名前を消すと、入る人・一周の記録から落ちる。一周をやり直すと drawn が空になる", async () => {
    // Given: 客を 1 人足して回し、客が当たりになるまで…ではなく drawn に載った状態を作る
    const h = setup();
    await joined(h, "r-1", "Alice");
    await h.handle("r-1", { command: "roulette.guest.add", name: "山田" });
    await h.handle("r-1", { command: "roulette.spin" });
    expect(h.roulettes.get(ROOM)!.drawn).toHaveLength(1);

    // When
    await h.handle("r-1", { command: "roulette.guest.remove", id: "g-1" });
    await h.handle("r-1", { command: "roulette.cycle.reset" });

    // Then
    expect(h.roulettes.get(ROOM)!.guests).toEqual([]);
    expect(h.roulettes.get(ROOM)!.drawn).toEqual([]);
  });

  it("退出して名簿から消えた参加者の ID は、次のコマンドで excluded から落ちる（prune）", async () => {
    // Given: Bob を外してから、Bob が名簿から消える
    const h = setup();
    await joined(h, "r-1", "Alice");
    await joined(h, "r-2", "Bob");
    const bobId = h.store.get(ROOM)!.participants[1]!.id;
    await h.handle("r-1", { command: "roulette.include", id: bobId, included: false });
    const room = h.store.get(ROOM)!;
    h.store.put({ ...room, participants: room.participants.filter((p) => p.id !== bobId) });

    // When
    await h.handle("r-1", { command: "roulette.cycle.reset" });

    // Then
    expect(h.roulettes.get(ROOM)!.excluded).toEqual([]);
  });
});

describe("ログ", () => {
  const spies: Array<ReturnType<typeof spyOn>> = [];
  afterEach(() => {
    for (const s of spies) s.mockRestore();
    spies.length = 0;
  });

  it("ゲストの名前を入れて操作した後も、ログの出口は 1 度も呼ばれない", async () => {
    // Given: 出口になりうる console を全部見張る
    for (const m of ["log", "info", "warn", "error", "debug"] as const) spies.push(spyOn(console, m));
    const h = setup();

    // When
    await joined(h, "r-1", "Alice");
    await h.handle("r-1", { command: "roulette.guest.add", name: "秘密の名前" });
    await h.handle("r-1", { command: "roulette.guest.add", name: "   " });
    await h.handle("r-1", { command: "roulette.spin" });

    // Then
    expect(spies.map((s) => s.mock.calls.length)).toEqual([0, 0, 0, 0, 0]);
  });
});
