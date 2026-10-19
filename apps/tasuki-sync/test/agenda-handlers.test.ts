/**
 * 進行タイマー（`?tool=agenda`）のメッセージ層と、期限の張り直し（#429 Task 2.4）。
 *
 * 依存はフェイクで組む。**配信は本物の `makeAgendaBroadcaster`** を通し、送り先の記録（`sent`）で観測する。
 * 時計は単調時計の偽物（手で進める）、期限の予約も偽物（張られた期限を記録し、手で発火させる）。
 */
import { describe, expect, it } from "bun:test";
import { createTokenBucketLimiter, DEFAULT_CAPACITY, DEFAULT_REFILL_PER_SEC } from "@tasuki/rate-limit";
import type { AgendaView } from "@tasuki/agenda-core";
import { makeAgendaHandlers } from "../src/application/agenda-handlers.js";
import { makeAgendaBroadcaster } from "../src/application/agenda-broadcast.js";
import type { AgendaDeadlines } from "../src/application/agenda-deadlines.js";
import { createRateLimitGate } from "../src/application/rate-limit-gate.js";
import { createTokenStore } from "../src/application/token-store.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryAgendaStore } from "../src/adapters/in-memory-agenda-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { MonotonicClock } from "../src/ports/monotonic-clock.js";
import type { AgendaServerMsg } from "../src/ports/agenda-server-msg.js";
import { createLogger } from "../src/application/log/logger.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";
import { spyHub } from "./support/hub.js";

const ROOM = "ROOM-A";

interface Sent {
  connId: string;
  msg: AgendaServerMsg;
}

interface Armed {
  atMs: number;
  onDue: (roomCode: string) => void;
}

interface Harness {
  handle: (connId: string, msg: unknown) => Promise<void>;
  store: InMemoryRoomStore;
  agendas: InMemoryAgendaStore;
  sent: Sent[];
  logLines: string[];
  advance: (ms: number) => void;
  /** いま張られている期限（無ければ undefined） */
  armed: () => Armed | undefined;
  /** 張られた期限へ時計を進め、予約の呼び先を呼ぶ（本番の予約が発火したのと同じ） */
  fireArmed: () => void;
  /** ハンドラの `onDue` を直接呼ぶ */
  onDue: (roomCode: string) => void;
}

function setup(): Harness {
  const store = new InMemoryRoomStore();
  const agendas = new InMemoryAgendaStore();
  const sent: Sent[] = [];
  let now = 5_000;
  const monotonicClock: MonotonicClock = { now: () => now };
  const record = (ids: string[], msg: AgendaServerMsg): void => {
    for (const connId of ids) sent.push({ connId, msg });
  };
  const logLines: string[] = [];
  const logger = createLogger((level, line) => logLines.push(`${level} ${line}`));
  let current: Armed | undefined;
  const deadlines: AgendaDeadlines = {
    arm: (_roomCode, atMs, onDue) => {
      current = { atMs, onDue };
    },
    clear: () => {
      current = undefined;
    },
    clearAll: () => {
      current = undefined;
    },
  };
  const broadcaster = makeAgendaBroadcaster({ store, agendas, clock: monotonicClock, send: record });
  const handlers = makeAgendaHandlers({
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
    agendas,
    broadcaster,
    send: (connId, msg) => record([connId], msg),
    monotonicClock,
    deadlines,
    logger,
  });
  store.put({ code: ROOM, createdAt: 0, participants: [] });
  return {
    handle: (connId, msg) => handlers.handleMessage(connId, typeof msg === "string" ? msg : JSON.stringify(msg)),
    store,
    agendas,
    sent,
    logLines,
    advance: (ms) => {
      now += ms;
    },
    armed: () => current,
    fireArmed: () => {
      if (current === undefined) throw new Error("張られた期限が無い");
      const { atMs, onDue } = current;
      now = Math.max(now, atMs);
      onDue(ROOM);
    },
    onDue: (roomCode) => handlers.onDue(roomCode),
  };
}

/** 進行タイマーの接続でルームへ参加し、記録を空にする。 */
async function joined(h: Harness, connId: string, name: string): Promise<void> {
  await h.handle(connId, { command: "room.join", code: ROOM, displayName: name });
  if (!h.sent.some((s) => s.connId === connId && s.msg.type === "room.joined")) {
    throw new Error(`前提の構築に失敗した: ${connId} が参加できていない`);
  }
  h.sent.length = 0;
}

const errorsTo = (h: Harness, connId: string): string[] =>
  h.sent.flatMap((s) => (s.connId === connId && s.msg.type === "error" ? [s.msg.code] : []));

const viewsTo = (h: Harness, connId: string): AgendaView[] =>
  h.sent.flatMap((s) => (s.connId === connId && s.msg.type === "agenda" ? [s.msg.state as AgendaView] : []));

/** 1 つ目は 60 秒で自動で次へ、2 つ目は 60 秒で待つ */
const SCENARIO = {
  title: "定例",
  steps: [
    { name: "ふりかえり", durationSec: 60, onTimeout: "advance" },
    { name: "まとめ", durationSec: 60, onTimeout: "wait" },
  ],
};

async function loadScenario(h: Harness, connId: string): Promise<void> {
  await h.handle(connId, { command: "agenda.scenario.set", scenario: SCENARIO });
  h.sent.length = 0;
}

/**
 * @requirements #429 メッセージ層
 */
describe("進行タイマーの接続でルームへ入る", () => {
  it("参加すると、本人へ参加の返事と既定の状態が 1 通届き、状態が保管される", async () => {
    // Given
    const h = setup();

    // When
    await h.handle("a-1", { command: "room.join", code: ROOM, displayName: "Alice" });

    // Then
    expect(h.sent.map((s) => s.msg.type)).toEqual(["room.joined", "agenda"]);
    expect(viewsTo(h, "a-1")).toHaveLength(1);
    expect(viewsTo(h, "a-1")[0]!.phase).toBe("idle");
    expect(h.agendas.get(ROOM)).toBeDefined();
  });

  it("途中参加（時計を 125_000ms 進めた後）に届く runElapsedMs は 125_000", async () => {
    // Given: 開始して 125_000ms 経った
    const h = setup();
    await joined(h, "a-1", "Alice");
    await loadScenario(h, "a-1");
    await h.handle("a-1", { command: "agenda.start" });
    h.advance(125_000);

    // When
    await h.handle("a-2", { command: "room.join", code: ROOM, displayName: "Bob" });

    // Then: 開始直後の 0 ではなく、送る時点の経過
    expect(viewsTo(h, "a-2")[0]!.runElapsedMs).toBe(125_000);
  });

  it("ハブとして在席している接続の agenda.start は NOT_IN_ROOM", async () => {
    // Given
    const h = setup();
    await joined(h, "a-1", "Alice");
    await loadScenario(h, "a-1");
    const room = h.store.get(ROOM)!;
    h.store.put({
      ...room,
      participants: [
        ...room.participants,
        { id: "p-hub", displayName: "Hub", connections: new Map([["hub-1", null]]), joinedAt: 1 },
      ],
    });

    // When
    await h.handle("hub-1", { command: "agenda.start" });

    // Then
    expect(errorsTo(h, "hub-1")).toEqual(["NOT_IN_ROOM"]);
    expect(h.agendas.get(ROOM)!.phase).toBe("idle");
  });

  it("room.create と room.check は拒む", async () => {
    const h = setup();
    await h.handle("a-1", { command: "room.create", displayName: "Alice" });
    await h.handle("a-1", { command: "room.check", code: ROOM });
    expect(errorsTo(h, "a-1")).toEqual(["INVALID_COMMAND", "INVALID_COMMAND"]);
  });

  it("形の不正なコマンドは INVALID_COMMAND、JSON でなければ INVALID_JSON", async () => {
    const h = setup();
    await h.handle("a-1", { command: "agenda.next" });
    await h.handle("a-1", "{");
    expect(errorsTo(h, "a-1")).toEqual(["INVALID_COMMAND", "INVALID_JSON"]);
  });
});

describe("操作の配信", () => {
  it("開始すると全員へ配られる", async () => {
    // Given
    const h = setup();
    await joined(h, "a-1", "Alice");
    await joined(h, "a-2", "Bob");
    await loadScenario(h, "a-1");

    // When
    await h.handle("a-1", { command: "agenda.start" });

    // Then
    expect(viewsTo(h, "a-1")[0]!.phase).toBe("running");
    expect(viewsTo(h, "a-2")[0]!.phase).toBe("running");
  });

  it("ID 違いの agenda.next は全員へ配らず、送り主にだけ現在の状態を 1 通", async () => {
    // Given
    const h = setup();
    await joined(h, "a-1", "Alice");
    await joined(h, "a-2", "Bob");
    await loadScenario(h, "a-1");
    await h.handle("a-1", { command: "agenda.start" });
    h.sent.length = 0;

    // When: 古い画面が s-9 を次へと押した
    await h.handle("a-2", { command: "agenda.next", stepId: "s-9" });

    // Then
    expect(viewsTo(h, "a-2")).toHaveLength(1);
    expect(viewsTo(h, "a-2")[0]!.currentId).toBe("s-1");
    expect(h.sent.filter((s) => s.connId === "a-1")).toEqual([]);
  });

  it("遷移の失敗は送り主にだけエラーを返し、配らない", async () => {
    // Given: シナリオが無いまま開始
    const h = setup();
    await joined(h, "a-1", "Alice");
    await joined(h, "a-2", "Bob");

    // When
    await h.handle("a-1", { command: "agenda.start" });

    // Then
    expect(errorsTo(h, "a-1")).toEqual(["AGENDA_EMPTY"]);
    expect(h.sent.filter((s) => s.connId === "a-2")).toEqual([]);
  });

  it("agenda.sync は送り主にだけ現在の状態を送る", async () => {
    const h = setup();
    await joined(h, "a-1", "Alice");
    await joined(h, "a-2", "Bob");

    await h.handle("a-1", { command: "agenda.sync" });

    expect(viewsTo(h, "a-1")).toHaveLength(1);
    expect(h.sent.filter((s) => s.connId === "a-2")).toEqual([]);
  });
});

describe("自動で次へ進む期限の予約", () => {
  it("advance のステップで開始すると、開始の単調時計 + 持ち時間に期限が張られる", async () => {
    // Given
    const h = setup();
    await joined(h, "a-1", "Alice");
    await loadScenario(h, "a-1");

    // When: 開始は単調時計 5_000
    await h.handle("a-1", { command: "agenda.start" });

    // Then
    expect(h.armed()!.atMs).toBe(65_000);
  });

  it("wait のステップでは期限を張らない（次へ進んだ先が wait なら予約を消す）", async () => {
    // Given
    const h = setup();
    await joined(h, "a-1", "Alice");
    await loadScenario(h, "a-1");
    await h.handle("a-1", { command: "agenda.start" });

    // When: 手で次へ（s-2 は wait）
    await h.handle("a-1", { command: "agenda.next", stepId: "s-1" });

    // Then
    expect(h.armed()).toBeUndefined();
  });

  it("extend で期限が 60_000ms 後ろへ張り直され、元の期限では進まず新しい期限で進む", async () => {
    // Given
    const h = setup();
    await joined(h, "a-1", "Alice");
    await loadScenario(h, "a-1");
    await h.handle("a-1", { command: "agenda.start" });
    const original = h.armed()!.atMs;

    // When
    await h.handle("a-1", { command: "agenda.extend", stepId: "s-1", minutes: 1 });

    // Then: 張り直された期限は 60_000ms 後ろ
    expect(h.armed()!.atMs).toBe(original + 60_000);

    // 元の期限で呼んでも進まない
    h.advance(original - 5_000);
    h.onDue(ROOM);
    expect(h.agendas.get(ROOM)!.currentId).toBe("s-1");

    // 張られた新しい期限で発火すると進む
    h.fireArmed();
    expect(h.agendas.get(ROOM)!.currentId).toBe("s-2");
  });

  it("期限で進むと全員へ配られ、次が wait なら予約は消える", async () => {
    // Given
    const h = setup();
    await joined(h, "a-1", "Alice");
    await joined(h, "a-2", "Bob");
    await loadScenario(h, "a-1");
    await h.handle("a-1", { command: "agenda.start" });
    h.sent.length = 0;

    // When
    h.fireArmed();

    // Then
    expect(viewsTo(h, "a-1")[0]!.currentId).toBe("s-2");
    expect(viewsTo(h, "a-2")[0]!.currentId).toBe("s-2");
    expect(h.armed()).toBeUndefined();
  });

  it("pause で予約が消え、resume で残りの分だけ後ろに張り直される", async () => {
    // Given: 開始（5_000）から 20_000ms 後に一時停止
    const h = setup();
    await joined(h, "a-1", "Alice");
    await loadScenario(h, "a-1");
    await h.handle("a-1", { command: "agenda.start" });
    h.advance(20_000);

    // When
    await h.handle("a-1", { command: "agenda.pause" });

    // Then
    expect(h.armed()).toBeUndefined();

    // When: 10_000ms 止めてから再開（now = 35_000、残り 40_000ms）
    h.advance(10_000);
    await h.handle("a-1", { command: "agenda.resume" });

    // Then
    expect(h.armed()!.atMs).toBe(75_000);
  });

  it("onDue はルームが消えていたら予約を消して何もしない", async () => {
    // Given
    const h = setup();
    await joined(h, "a-1", "Alice");
    await loadScenario(h, "a-1");
    await h.handle("a-1", { command: "agenda.start" });
    h.store.remove(ROOM);
    h.agendas.remove(ROOM);
    h.sent.length = 0;

    // When
    h.onDue(ROOM);

    // Then
    expect(h.armed()).toBeUndefined();
    expect(h.sent).toEqual([]);
    expect(h.agendas.get(ROOM)).toBeUndefined();
  });
});

describe("ログ", () => {
  it("ステップの名前を入れて一通り操作しても、ロガーへ何も書かない", async () => {
    // Given
    const h = setup();
    await joined(h, "a-1", "Alice");

    // When
    await loadScenario(h, "a-1");
    await h.handle("a-1", { command: "agenda.start" });
    await h.handle("a-1", { command: "agenda.pause" });
    await h.handle("a-1", { command: "agenda.resume" });
    await h.handle("a-1", { command: "agenda.extend", stepId: "s-1", minutes: 3 });
    await h.handle("a-1", { command: "agenda.skip", stepId: "s-2", skipped: true });
    await h.handle("a-1", { command: "agenda.next", stepId: "s-9" });
    await h.handle("a-1", { command: "agenda.reset" });

    // Then
    expect(h.logLines).toEqual([]);
  });
});
