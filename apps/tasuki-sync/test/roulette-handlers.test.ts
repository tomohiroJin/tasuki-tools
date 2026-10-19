/**
 * ルーレット（`?tool=roulette`）のメッセージ層と、ルーレットの配信（#94）。
 *
 * 依存はフェイクとスパイで組む。**配信は本物の `makeRouletteBroadcaster`** を通し、送り先の
 * 記録（`sent`）で観測する —— 本番の観測点は送信であって、ハンドラの戻り値ではない。
 * 時計は単調時計の偽物（手で進める）、乱数は常に 0 を返す偽物（最悪の偏り）。
 */
import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { createTokenBucketLimiter, DEFAULT_CAPACITY, DEFAULT_REFILL_PER_SEC } from "@tasuki/rate-limit";
import { MAX_DISPLAY_NAME } from "@tasuki/room-core";
import { SETTLE_MAX, SETTLE_MIN, STOP_STYLES, pickStopsMs, type RouletteView } from "@tasuki/roulette-core";
import { makeRouletteHandlers } from "../src/application/roulette-handlers.js";
import { makeRouletteBroadcaster } from "../src/application/roulette-broadcast.js";
import { createRateLimitGate } from "../src/application/rate-limit-gate.js";
import { createTokenStore } from "../src/application/token-store.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryRouletteStore } from "../src/adapters/in-memory-roulette-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { MonotonicClock } from "../src/ports/monotonic-clock.js";
import type { RandomSource } from "../src/ports/random-source.js";
import type { RouletteServerMsg } from "../src/ports/roulette-server-msg.js";
import { createLogger } from "../src/application/log/logger.js";
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
  /** ロガーへ書かれた行（`水準 行` の形） */
  logLines: string[];
  /** 以降の `randomSettle` の返り値を変える */
  setSettle: (value: number) => void;
}

interface SetupOptions {
  /** 乱数源の `randomInt` が返す値。既定は 0（最悪の偏り） */
  randomIntReturns?: number;
  /** 乱数源の `randomSettle` が返す値。既定は 0.5（契約の範囲内） */
  randomSettleReturns?: number;
  /** 乱数源の `randomInt` を n ごとに決める（`randomIntReturns` より優先） */
  randomIntOf?: (n: number) => number;
}

function setup(options: SetupOptions = {}): Harness {
  const store = new InMemoryRoomStore();
  const roulettes = new InMemoryRouletteStore();
  const sent: Sent[] = [];
  const randomCalls: number[] = [];
  let settle = options.randomSettleReturns ?? 0.5;
  let now = 5_000;
  const monotonicClock: MonotonicClock = { now: () => now };
  const random: RandomSource = {
    randomInt: (n) => {
      randomCalls.push(n);
      return options.randomIntOf?.(n) ?? options.randomIntReturns ?? 0;
    },
    randomSettle: () => settle,
  };
  const record = (ids: string[], msg: RouletteServerMsg): void => {
    for (const connId of ids) sent.push({ connId, msg });
  };
  const logLines: string[] = [];
  const logger = createLogger((level, line) => logLines.push(`${level} ${line}`));
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
    timerBroadcaster: new SpyBroadcaster(),
    roulettes,
    broadcaster,
    send: (connId, msg) => record([connId], msg),
    monotonicClock,
    random,
    logger,
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
    logLines,
    setSettle: (value) => {
      settle = value;
    },
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
    expect(viewsTo(h, "r-1")).toEqual([{ pickCount: 1, mode: "once", order: null, excluded: [], guests: [], drawn: [], spin: null }]);
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
  it("2 人で 2 回回すと、乱数が常に 0 なら 2 回とも同じ人（前の当たりは覚えない・#427）", async () => {
    // Given: 乱数は常に 0 を返す
    const h = setup();
    await joined(h, "r-1", "Alice");
    await joined(h, "r-2", "Bob");

    // When: 1 回目の回転の長さ（wire で届いた durationMs）だけ待ってから回す
    await h.handle("r-1", { command: "roulette.spin" });
    h.advance(viewsTo(h, "r-1")[0]!.spin!.durationMs);
    await h.handle("r-1", { command: "roulette.spin" });

    // Then
    const spins = viewsTo(h, "r-1").map((v) => v.spin!);
    expect(spins.map((s) => s.seq)).toEqual([1, 2]);
    const winners = spins.map((s) => s.wheel[s.winnerIndex]!.name);
    expect(winners[0]).toBe(winners[1]);
  });

  it("Given 乱数源が範囲外を返す / When 回す / Then INTERNAL_ERROR を返し、ログに on-message-error name=RangeError protocol=roulette と reason=invalid-random の 2 行を残す（#364・#382）", async () => {
    // #364 より前は、ドメインが RangeError を投げ、接続層（adapters/ws/tool-channel.ts）が
    // 隔離して「ログ → エラーフレーム」を返していた。ドメインが Result を返すようになっても、
    // フレームとログの行（中身・水準・順）は変えない（計画 §3「ログを保つ」）。
    // Given
    const h = setup({ randomIntReturns: 5 });
    await joined(h, "r-1", "Alice");
    await joined(h, "r-2", "Bob");
    const before = h.roulettes.get(ROOM);
    const put = spyOn(h.roulettes, "put");

    // When
    await h.handle("r-1", { command: "roulette.spin" });

    // Then
    expect(h.sent).toEqual([
      {
        connId: "r-1",
        msg: { type: "error", code: "INTERNAL_ERROR", message: "サーバー内部でエラーが発生しました" },
      },
    ]);
    // 既存の行（先頭）は変えず、監視が 1 本で拾える reason 付きの行をその次に足す（#382）
    expect(h.logLines).toEqual([
      "error on-message-error name=RangeError protocol=roulette",
      "error roulette-random-violation reason=invalid-random",
    ]);
    expect(h.roulettes.get(ROOM)).toBe(before);
    expect(put).not.toHaveBeenCalled();
  });

  it("変わった止まり方（#420）: 乱数源で 1/24 の目が出たら、止まり方を載せて延びた長さで配り、その間は次の回転を拒む", async () => {
    // Given: どの n にも最後の値を返す乱数（当たりは最後の席・止まり方は表の最後）
    const h = setup({ randomIntOf: (n) => n - 1 });
    await joined(h, "r-1", "Alice");
    await joined(h, "r-2", "Bob");

    // When
    await h.handle("r-1", { command: "roulette.spin" });

    // Then: 当たりは乱数のまま（最後の席）で、止まり方だけが載る
    const spin = viewsTo(h, "r-2").at(-1)?.spin;
    expect(spin?.stopStyle).toBe(STOP_STYLES.at(-1));
    expect(spin?.winnerIndex).toBe(1);
    expect(spin?.durationMs).toBe(pickStopsMs(1, "swing")[0]);
    expect(spin?.durationMs).toBeGreaterThan(pickStopsMs(1)[0]!);
    // 当たり（2 人から 1 人）→ 止まり方が出るか（1/24）→ どの止まり方か
    expect(h.randomCalls).toEqual([2, 24, STOP_STYLES.length]);

    // When: 普通の長さが過ぎた時点で回す
    h.sent.length = 0;
    h.advance(pickStopsMs(1)[0]!);
    await h.handle("r-2", { command: "roulette.spin" });
    // Then: まだ回っている
    expect(errorsTo(h, "r-2")).toEqual(["ROULETTE_SPINNING"]);
  });

  it("変わった止まり方（#420）: 1/24 の目が出なければ止まり方を載せない", async () => {
    // Given: 乱数は既定の 0（当たりは最初の席・止まり方は出ない）
    const h = setup();
    await joined(h, "r-1", "Alice");
    await joined(h, "r-2", "Bob");

    // When
    await h.handle("r-1", { command: "roulette.spin" });

    // Then
    const spin = viewsTo(h, "r-1").at(-1)?.spin;
    expect(spin).not.toHaveProperty("stopStyle");
    expect(spin?.durationMs).toBe(pickStopsMs(1)[0]);
  });

  // 契約は SETTLE_MIN〜SETTLE_MAX。境界の値は含み、すぐ外（境界から計算した隣の浮動小数）・非有限は外れる。
  const nextUp = (x: number): number => {
    const f = new Float64Array([x]);
    new BigInt64Array(f.buffer)[0]! += 1n;
    return f[0]!;
  };
  const nextDown = (x: number): number => {
    const f = new Float64Array([x]);
    new BigInt64Array(f.buffer)[0]! -= 1n;
    return f[0]!;
  };
  const SETTLE_CASES: { settle: number; violates: boolean }[] = [
    { settle: SETTLE_MIN, violates: false },
    { settle: SETTLE_MAX, violates: false },
    { settle: nextDown(SETTLE_MIN), violates: true },
    { settle: nextUp(SETTLE_MAX), violates: true },
    { settle: 0.1, violates: true },
    { settle: 0.9, violates: true },
    { settle: Number.NaN, violates: true },
    { settle: Number.POSITIVE_INFINITY, violates: true },
    { settle: Number.NEGATIVE_INFINITY, violates: true },
  ];
  for (const { settle, violates } of SETTLE_CASES) {
    it(`Given 乱数源の settle が ${String(settle)} / When 回す / Then ${violates ? "INTERNAL_ERROR と reason 付きの error 1 行（#382）" : "成功しログは空"}`, async () => {
      // Given
      const h = setup({ randomSettleReturns: settle });
      await joined(h, "r-1", "Alice");
      await joined(h, "r-2", "Bob");
      const before = h.roulettes.get(ROOM);
      const put = spyOn(h.roulettes, "put");

      // When
      await h.handle("r-1", { command: "roulette.spin" });

      // Then
      if (violates) {
        expect(h.sent).toEqual([
          {
            connId: "r-1",
            msg: { type: "error", code: "INTERNAL_ERROR", message: "サーバー内部でエラーが発生しました" },
          },
        ]);
        expect(h.logLines).toEqual(["error roulette-random-violation reason=invalid-settle"]);
        expect(h.roulettes.get(ROOM)).toBe(before);
        // 保管の書き込みそのものが起きない（同じ参照に書き戻すだけの実装も弾く）
        expect(put).not.toHaveBeenCalled();
      } else {
        expect(h.logLines).toEqual([]);
        expect(put).toHaveBeenCalledTimes(1);
        expect(h.roulettes.get(ROOM)!.lastSpin!.seq).toBe(1);
      }
    });
  }

  it("Given 既存の状態があるルーム / When 契約違反の乱数で回す / Then 保管の書き込みも状態の変化も起きない（#382）", async () => {
    // Given: 1 回成功した後、回転が終わるまで待つ。その後で乱数源が契約を破る
    const h = setup();
    await joined(h, "r-1", "Alice");
    await joined(h, "r-2", "Bob");
    await h.handle("r-1", { command: "roulette.spin" });
    h.advance(viewsTo(h, "r-1")[0]!.spin!.durationMs);
    h.sent.length = 0;
    const before = h.roulettes.get(ROOM);
    expect(before).toBeDefined();
    const put = spyOn(h.roulettes, "put");
    h.setSettle(SETTLE_MAX + 0.1);

    // When
    await h.handle("r-1", { command: "roulette.spin" });

    // Then
    expect(errorsTo(h, "r-1")).toEqual(["INTERNAL_ERROR"]);
    expect(h.logLines).toEqual(["error roulette-random-violation reason=invalid-settle"]);
    expect(put).not.toHaveBeenCalled();
    expect(h.roulettes.get(ROOM)).toBe(before);
  });

  it("Given 利用者の操作で回せない（人数不足）/ When 回す / Then ROULETTE_TOO_FEW を返し、ログは空（#382）", async () => {
    // INVALID_SETTLE の分岐が他の失敗まで巻き込んでログを書かないことを固定する。
    // Given: 1 人だけ
    const h = setup();
    await joined(h, "r-1", "Alice");

    // When
    await h.handle("r-1", { command: "roulette.spin" });

    // Then
    expect(h.sent.map((s) => (s.msg.type === "error" ? s.msg.code : s.msg.type))).toEqual(["ROULETTE_TOO_FEW"]);
    expect(h.logLines).toEqual([]);
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
    const durationMs = viewsTo(h, "r-1")[0]!.spin!.durationMs;
    h.sent.length = 0;
    h.advance(durationMs - 1);

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
    // 回転の長さは、回した画面へ届いたものと同じ（定数との一致は roulette-core の roulette.test.ts が固定する）
    expect(viewsTo(h, "r-3")[0]!.spin!.durationMs).toBe(viewsTo(h, "r-1")[0]!.spin!.durationMs);
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

  it("名前を消すと、入る人から落ちる", async () => {
    // Given: 客を 1 人足す
    const h = setup();
    await joined(h, "r-1", "Alice");
    await h.handle("r-1", { command: "roulette.guest.add", name: "山田" });
    expect(h.roulettes.get(ROOM)!.guests).toHaveLength(1);

    // When
    await h.handle("r-1", { command: "roulette.guest.remove", id: "g-1" });

    // Then
    expect(h.roulettes.get(ROOM)!.guests).toEqual([]);
  });

  it("roulette.cycle.reset は状態を変えず配信しない（一周の規則は外した・古い画面の操作は受けて捨てる）", async () => {
    // Given: 回した後の状態
    const h = setup();
    await joined(h, "r-1", "Alice");
    await joined(h, "r-2", "Bob");
    await h.handle("r-1", { command: "roulette.spin" });
    const before = h.roulettes.get(ROOM)!;
    h.sent.length = 0;

    // When
    await h.handle("r-1", { command: "roulette.cycle.reset" });

    // Then: 同じ参照のまま・誰にも何も届かない（エラーも出ない）
    expect(h.roulettes.get(ROOM)).toBe(before);
    expect(h.sent).toEqual([]);
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

    // When: 変わらない操作でも、prune した状態が保管される
    await h.handle("r-1", { command: "roulette.guest.remove", id: "g-9" });

    // Then
    expect(h.roulettes.get(ROOM)!.excluded).toEqual([]);
  });
});

/**
 * 同じ名前の判定は参加の重複拒否と同じ関数・同じキー（`room-core` の `conflictsWithExisting`・spec R13）。
 * PR #355 のレビュー指摘 1・2・6。
 *
 * @requirements #94 E13
 */
describe("足す名前と同じ名前の判定", () => {
  it("大文字小文字だけ違う名前・全角で書いた名前（正規化すると同じ）は、参加者とも足したゲストとも GUEST_NAME_TAKEN", async () => {
    // Given
    const h = setup();
    await joined(h, "r-1", "Alice");
    await h.handle("r-1", { command: "roulette.guest.add", name: "Guest" });
    h.sent.length = 0;

    // When: 大文字小文字を区別する完全一致だと、どれも通ってしまう
    await h.handle("r-1", { command: "roulette.guest.add", name: "alice" });
    await h.handle("r-1", { command: "roulette.guest.add", name: "ＡＬＩＣＥ" });
    await h.handle("r-1", { command: "roulette.guest.add", name: "GUEST" });

    // Then
    expect(errorsTo(h, "r-1")).toEqual(["GUEST_NAME_TAKEN", "GUEST_NAME_TAKEN", "GUEST_NAME_TAKEN"]);
    expect(h.roulettes.get(ROOM)!.guests.map((g) => g.name)).toEqual(["Guest"]);
  });

  it("ゲストを足した後で同じ名前の人が参加すると、円盤には在室者だけが載り、ゲストは状態に残る", async () => {
    // Given: ゲスト「carol」を足してから、「Carol」がルーレットの接続で参加する
    const h = setup();
    await joined(h, "r-1", "Alice");
    await h.handle("r-1", { command: "roulette.guest.add", name: "carol" });
    await joined(h, "r-2", "Carol");

    // When
    await h.handle("r-1", { command: "roulette.spin" });

    // Then: Carol は 1 席だけ（ゲストの席が外れる）。ゲストは消えない
    const view = viewsTo(h, "r-1").at(-1)!;
    expect(view.spin!.wheel.map((e) => e.name)).toEqual(["Alice", "Carol"]);
    expect(view.guests.map((g) => g.name)).toEqual(["carol"]);
  });

  it("名前は room.join の表示名と同じ境界で受ける（前後の空白で 64 字を超えても、正規化して上限に収まれば足せる）", async () => {
    // Given
    const h = setup();
    await joined(h, "r-1", "Alice");

    // When: 境界に別の上限があると INVALID_COMMAND になる。正規化後に上限を超える名前は INVALID_GUEST_NAME
    await h.handle("r-1", { command: "roulette.guest.add", name: `${" ".repeat(40)}Bob${" ".repeat(40)}` });
    await h.handle("r-1", { command: "roulette.guest.add", name: "x".repeat(MAX_DISPLAY_NAME + 1) });

    // Then
    expect(errorsTo(h, "r-1")).toEqual(["INVALID_GUEST_NAME"]);
    expect(h.roulettes.get(ROOM)!.guests.map((g) => g.name)).toEqual(["Bob"]);
  });
});

/**
 * 保管と配信は一致させる（PR #355 のレビュー指摘 4・7）。
 *
 * @requirements #94 §5.2
 */
/**
 * @requirements #401 E1・E2・E5・E6（選ぶ人数）
 */
describe("選ぶ人数", () => {
  it("roulette.pick.set はルームの全接続へ配られ、後から入った接続にも届く", async () => {
    // Given
    const h = setup();
    await joined(h, "r-1", "Alice");
    await joined(h, "r-2", "Bob");

    // When
    await h.handle("r-1", { command: "roulette.pick.set", count: 2 });
    await h.handle("r-3", { command: "room.join", code: ROOM, displayName: "Carol" });

    // Then
    expect(viewsTo(h, "r-1").at(-1)?.pickCount).toBe(2);
    expect(viewsTo(h, "r-2").at(-1)?.pickCount).toBe(2);
    expect(viewsTo(h, "r-3")[0]?.pickCount).toBe(2);
  });

  it("範囲の外は INVALID_PICK_COUNT になり、状態は変わらず配られない。数でなければ境界で INVALID_COMMAND", async () => {
    // Given
    const h = setup();
    await joined(h, "r-1", "Alice");
    const before = h.roulettes.get(ROOM);

    // When
    await h.handle("r-1", { command: "roulette.pick.set", count: 5 });
    await h.handle("r-1", { command: "roulette.pick.set", count: 1.5 });
    await h.handle("r-1", { command: "roulette.pick.set", count: "2" });

    // Then
    expect(errorsTo(h, "r-1")).toEqual(["INVALID_PICK_COUNT", "INVALID_PICK_COUNT", "INVALID_COMMAND"]);
    expect(h.roulettes.get(ROOM)).toBe(before);
    expect(h.sent.filter((s) => s.msg.type === "roulette")).toEqual([]);
  });

  it("同じ値への変更は配らない", async () => {
    // Given
    const h = setup();
    await joined(h, "r-1", "Alice");
    await h.handle("r-1", { command: "roulette.pick.set", count: 3 });
    h.sent.length = 0;

    // When
    await h.handle("r-1", { command: "roulette.pick.set", count: 3 });

    // Then
    expect(h.sent).toEqual([]);
  });

  it("k = 3 で回すと 3 人が選ばれ、durationMs は 3 人ぶん。1 人ぶんの 4000ms を過ぎても次は回せない", async () => {
    // Given: 4 人・k = 3
    const h = setup();
    for (const [connId, name] of [["r-1", "Alice"], ["r-2", "Bob"], ["r-3", "Carol"], ["r-4", "Dave"]] as const) {
      await joined(h, connId, name);
    }
    await h.handle("r-1", { command: "roulette.pick.set", count: 3 });

    // When
    await h.handle("r-1", { command: "roulette.spin" });
    const spin = viewsTo(h, "r-2").at(-1)!.spin!;
    h.advance(5_000);
    await h.handle("r-1", { command: "roulette.spin" });

    // Then
    expect(spin.picks?.map((p) => spin.wheel[p.index]!.name)).toEqual(["Alice", "Bob", "Carol"]);
    expect(spin.picks?.[0]?.index).toBe(spin.winnerIndex);
    expect(spin.durationMs).toBeGreaterThan(5_000);
    expect(errorsTo(h, "r-1")).toEqual(["ROULETTE_SPINNING"]);

    // 全体の長さを過ぎたら回せる（対照）
    h.advance(spin.durationMs - 5_000);
    await h.handle("r-1", { command: "roulette.spin" });
    expect(viewsTo(h, "r-1").at(-1)?.spin?.seq).toBe(2);
  });

  it("入る人が選ぶ人数 + 1 に満たなければ ROULETTE_TOO_FEW_FOR_PICK", async () => {
    // Given: 2 人・k = 2
    const h = setup();
    await joined(h, "r-1", "Alice");
    await joined(h, "r-2", "Bob");
    await h.handle("r-1", { command: "roulette.pick.set", count: 2 });

    // When
    await h.handle("r-1", { command: "roulette.spin" });

    // Then
    expect(errorsTo(h, "r-1")).toEqual(["ROULETTE_TOO_FEW_FOR_PICK"]);
  });

  it("回っている間に選ぶ人数を変えても、回っている回転の picks と durationMs は変わらない", async () => {
    // Given: 3 人・k = 2 で回した
    const h = setup();
    for (const [connId, name] of [["r-1", "Alice"], ["r-2", "Bob"], ["r-3", "Carol"]] as const) {
      await joined(h, connId, name);
    }
    await h.handle("r-1", { command: "roulette.pick.set", count: 2 });
    await h.handle("r-1", { command: "roulette.spin" });
    const spun = viewsTo(h, "r-1").at(-1)!.spin!;
    expect(spun.picks).toHaveLength(2);

    // When
    h.advance(1_000);
    await h.handle("r-2", { command: "roulette.pick.set", count: 1 });

    // Then: 人数は配られるが、回転はそのまま
    const after = viewsTo(h, "r-1").at(-1)!;
    expect(after.pickCount).toBe(1);
    expect(after.spin?.seq).toBe(spun.seq);
    expect(after.spin?.picks).toEqual(spun.picks);
    expect(after.spin?.durationMs).toBe(spun.durationMs);
  });
});

/**
 * @requirements #401 順番に回す T1・T2・T3・T8
 */
describe("順番に回す", () => {
  async function threeInOrder(): Promise<Harness> {
    const h = setup();
    for (const [connId, name] of [["r-1", "Alice"], ["r-2", "Bob"], ["r-3", "Carol"]] as const) {
      await joined(h, connId, name);
    }
    await h.handle("r-1", { command: "roulette.mode.set", mode: "order" });
    return h;
  }

  it("決め方を全員へ配り、回すたびに 1 人の番が決まって、最後の 1 人は回さずに出る", async () => {
    // Given
    const h = await threeInOrder();
    expect(viewsTo(h, "r-2").at(-1)?.mode).toBe("order");

    // When: 3 人 → 2 人 → 最後の 1 人
    await h.handle("r-1", { command: "roulette.spin" });
    const first = viewsTo(h, "r-2").at(-1)!;
    h.advance(4_000);
    await h.handle("r-2", { command: "roulette.spin" });
    const second = viewsTo(h, "r-3").at(-1)!;
    h.advance(4_000);
    await h.handle("r-3", { command: "roulette.spin" });
    const last = viewsTo(h, "r-1").at(-1)!;

    // Then: 2 つ目の接続に同じ人が同じ順で届き、円盤から済んだ人が抜ける
    expect(first.spin?.turn).toBe(1);
    expect(first.spin?.wheel).toHaveLength(3);
    expect(second.spin?.turn).toBe(2);
    expect(second.spin?.wheel).toHaveLength(2);
    expect(last.spin?.seq).toBe(second.spin?.seq);
    expect(last.order?.finished).toBe(true);
    expect(last.order?.done.map((e) => e.name).sort()).toEqual(["Alice", "Bob", "Carol"]);
    expect(viewsTo(h, "r-2").at(-1)?.order).toEqual(last.order);
  });

  it("回の途中は決め方を変えられず、最初からやり直すと変えられる", async () => {
    // Given
    const h = await threeInOrder();
    await h.handle("r-1", { command: "roulette.spin" });
    h.advance(4_000);

    // When
    await h.handle("r-2", { command: "roulette.mode.set", mode: "once" });
    await h.handle("r-2", { command: "roulette.order.reset" });
    await h.handle("r-2", { command: "roulette.mode.set", mode: "once" });

    // Then
    expect(errorsTo(h, "r-2")).toEqual(["ROULETTE_ROUND_IN_PROGRESS"]);
    const view = viewsTo(h, "r-3").at(-1)!;
    expect(view.mode).toBe("once");
    expect(view.order).toBeNull();
  });

  it("回っている間はやり直せない", async () => {
    // Given
    const h = await threeInOrder();
    await h.handle("r-1", { command: "roulette.spin" });

    // When
    await h.handle("r-2", { command: "roulette.order.reset" });

    // Then
    expect(errorsTo(h, "r-2")).toEqual(["ROULETTE_SPINNING"]);
  });
});

/**
 * @requirements #401 押して止める P3・P4
 */
describe("押して止める", () => {
  it("A が回し、B が止めると、B が送った位置で全員に配られる。後から押しても変わらない", async () => {
    // Given
    const h = setup();
    for (const [connId, name] of [["r-1", "Alice"], ["r-2", "Bob"], ["r-3", "Carol"]] as const) {
      await joined(h, connId, name);
    }
    await h.handle("r-1", { command: "roulette.mode.set", mode: "press" });
    await h.handle("r-1", { command: "roulette.spin" });
    const spin = viewsTo(h, "r-2").at(-1)!.spin!;
    expect(spin.press?.stop).toBeNull();

    // When
    h.advance(700);
    await h.handle("r-2", { command: "roulette.stop", seq: spin.seq, index: 2, settle: 0.25 });
    await h.handle("r-1", { command: "roulette.stop", seq: spin.seq, index: 0, settle: 0.5 });

    // Then
    const stop = { index: 2, settle: 0.25, by: "Bob", atMs: 700 };
    expect(viewsTo(h, "r-1").at(-1)?.spin?.press?.stop).toEqual(stop);
    expect(viewsTo(h, "r-3").at(-1)?.spin?.press?.stop).toEqual(stop);
    expect(viewsTo(h, "r-3").at(-1)?.spin?.winnerIndex).toBe(2);
    expect(errorsTo(h, "r-1")).toEqual([]);
  });

  it("位置の形が外れていたら ROULETTE_STOP_INVALID", async () => {
    // Given
    const h = setup();
    await joined(h, "r-1", "Alice");
    await joined(h, "r-2", "Bob");
    await h.handle("r-1", { command: "roulette.mode.set", mode: "press" });
    await h.handle("r-1", { command: "roulette.spin" });
    const seq = viewsTo(h, "r-1").at(-1)!.spin!.seq;

    // When
    await h.handle("r-2", { command: "roulette.stop", seq, index: 9, settle: 0.5 });

    // Then
    expect(errorsTo(h, "r-2")).toEqual(["ROULETTE_STOP_INVALID"]);
  });
});

describe("保管と配信", () => {
  it("失敗したコマンドは状態を保管せず、配りもしない（名簿から消えた記録の掃除も成功の経路でだけ行う）", async () => {
    // Given: Bob を外した後で Bob が名簿から消える（次のコマンドで prune される記録がある）
    const h = setup();
    await joined(h, "r-1", "Alice");
    await joined(h, "r-2", "Bob");
    const bobId = h.store.get(ROOM)!.participants[1]!.id;
    await h.handle("r-1", { command: "roulette.include", id: bobId, included: false });
    const room = h.store.get(ROOM)!;
    h.store.put({ ...room, participants: room.participants.filter((p) => p.id !== bobId) });
    const before = h.roulettes.get(ROOM);
    h.sent.length = 0;

    // When: 1 人なので回せない・13 件目ではないが同じ名前で足せない
    await h.handle("r-1", { command: "roulette.spin" });
    await h.handle("r-1", { command: "roulette.guest.add", name: "alice" });
    await h.handle("r-1", { command: "roulette.guest.add", name: "   " });

    // Then: 保管した状態は前と同じ参照で、ルーレットのフレームは誰にも届いていない
    expect(errorsTo(h, "r-1")).toEqual(["ROULETTE_TOO_FEW", "GUEST_NAME_TAKEN", "INVALID_GUEST_NAME"]);
    expect(h.roulettes.get(ROOM)).toBe(before);
    expect(h.sent.filter((s) => s.msg.type === "roulette")).toEqual([]);
  });

  it("状態が変わらないコマンドは配らない（知らない ID・すでに同じ値・古い画面からの一周のやり直し・知らないゲストの削除）", async () => {
    // Given
    const h = setup();
    await joined(h, "r-1", "Alice");
    await joined(h, "r-2", "Bob");
    const bobId = h.store.get(ROOM)!.participants[1]!.id;
    await h.handle("r-1", { command: "roulette.include", id: bobId, included: false });
    h.sent.length = 0;

    // When
    await h.handle("r-1", { command: "roulette.include", id: "p-unknown", included: false });
    await h.handle("r-1", { command: "roulette.include", id: bobId, included: false });
    await h.handle("r-1", { command: "roulette.cycle.reset" });
    await h.handle("r-1", { command: "roulette.guest.remove", id: "g-9" });

    // Then: 変わらないのに全員へ配ると、退出と同時の押下や連打のたびに全接続へ飛ぶ
    expect(h.sent).toEqual([]);

    // 変わるコマンドは配る（対照）
    await h.handle("r-1", { command: "roulette.include", id: bobId, included: true });
    expect(viewsTo(h, "r-1").at(-1)?.excluded).toEqual([]);
    expect(viewsTo(h, "r-2").at(-1)?.excluded).toEqual([]);
  });
});

describe("ログ", () => {
  const spies: Array<ReturnType<typeof spyOn>> = [];
  afterEach(() => {
    for (const s of spies) s.mockRestore();
    spies.length = 0;
  });

  it("ゲストの名前を入れて操作した後も、ログは 1 行も出ない", async () => {
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
