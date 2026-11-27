/**
 * うちわけ（`?tool=track`）のメッセージ層（#476）。
 *
 * 依存はフェイクで組む。**配信は本物の `makeTrackBroadcaster`** を通し、送り先の記録（`sent`）で観測する。
 * 時計は単調時計の偽物（手で進める）。
 */
import { describe, expect, it } from "bun:test";
import { createTokenBucketLimiter, DEFAULT_CAPACITY, DEFAULT_REFILL_PER_SEC } from "@tasuki/rate-limit";
import { UNDO_WINDOW_MS, type TrackView } from "@tasuki/track-core";
import { makeTrackHandlers } from "../src/application/track-handlers.js";
import { makeTrackBroadcaster } from "../src/application/track-broadcast.js";
import { createRateLimitGate } from "../src/application/rate-limit-gate.js";
import { createTokenStore } from "../src/application/token-store.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTrackStore } from "../src/adapters/in-memory-track-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { MonotonicClock } from "../src/ports/monotonic-clock.js";
import type { TrackServerMsg } from "../src/ports/track-server-msg.js";
import { createLogger } from "../src/application/log/logger.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";
import { spyHub } from "./support/hub.js";

const ROOM = "ROOM-A";
const WALL = 1_000_000;
const MONO_START = 5_000;
const MIN = 60_000;

interface Sent {
  connId: string;
  msg: TrackServerMsg;
}

interface Harness {
  handle: (connId: string, msg: unknown) => Promise<void>;
  store: InMemoryRoomStore;
  tracks: InMemoryTrackStore;
  sent: Sent[];
  logLines: string[];
  advance: (ms: number) => void;
}

function setup(): Harness {
  const store = new InMemoryRoomStore();
  const tracks = new InMemoryTrackStore();
  const sent: Sent[] = [];
  let now = MONO_START;
  const monotonicClock: MonotonicClock = { now: () => now };
  const clock = new FakeClock(WALL);
  const record = (ids: string[], msg: TrackServerMsg): void => {
    for (const connId of ids) sent.push({ connId, msg });
  };
  const logLines: string[] = [];
  const logger = createLogger((level, line) => logLines.push(`${level} ${line}`));
  const broadcaster = makeTrackBroadcaster({ store, tracks, clock: monotonicClock, wallClock: clock, send: record });
  const handlers = makeTrackHandlers({
    store,
    timers: new InMemoryTimerStore(),
    clock,
    codeGen: new FakeCodeGen(),
    tokenStore: createTokenStore(),
    rateLimitGate: createRateLimitGate(
      createTokenBucketLimiter({ capacity: DEFAULT_CAPACITY, refillPerSec: DEFAULT_REFILL_PER_SEC }),
    ),
    hub: spyHub(),
    timerBroadcaster: new SpyBroadcaster(),
    tracks,
    broadcaster,
    send: (connId, msg) => record([connId], msg),
    monotonicClock,
    logger,
  });
  store.put({ code: ROOM, createdAt: 0, participants: [] });
  return {
    handle: (connId, msg) => handlers.handleMessage(connId, typeof msg === "string" ? msg : JSON.stringify(msg)),
    store,
    tracks,
    sent,
    logLines,
    advance: (ms) => {
      now += ms;
    },
  };
}

/** うちわけの接続でルームへ参加し、記録を空にする。 */
async function joined(h: Harness, connId: string, name: string): Promise<void> {
  await h.handle(connId, { command: "room.join", code: ROOM, displayName: name });
  if (!h.sent.some((s) => s.connId === connId && s.msg.type === "room.joined")) {
    throw new Error(`前提の構築に失敗した: ${connId} が参加できていない`);
  }
  h.sent.length = 0;
}

const errorsTo = (h: Harness, connId: string): string[] =>
  h.sent.flatMap((s) => (s.connId === connId && s.msg.type === "error" ? [s.msg.code] : []));

const viewsTo = (h: Harness, connId: string): TrackView[] =>
  h.sent.flatMap((s) => (s.connId === connId && s.msg.type === "track" ? [s.msg.state as TrackView] : []));

const lastView = (h: Harness, connId: string): TrackView => {
  const view = viewsTo(h, connId).at(-1);
  if (view === undefined) throw new Error(`前提の構築に失敗した: ${connId} に写しが届いていない`);
  return view;
};

/**
 * @requirements #476 メッセージ層
 */
describe("うちわけの接続でルームへ入る", () => {
  it("参加すると、本人へ参加の返事と空の記録が 1 通届き、状態が保管される", async () => {
    // Given
    const h = setup();

    // When
    await h.handle("a-1", { command: "room.join", code: ROOM, displayName: "Alice" });

    // Then
    expect(h.sent.map((s) => s.msg.type)).toEqual(["room.joined", "track"]);
    expect(lastView(h, "a-1").segments).toEqual([]);
    expect(h.tracks.get(ROOM)).toBeDefined();
  });

  it("時刻軸の基準は最初に開いた時点で、後から入った人には同じ基準の位置が届く", async () => {
    // Given: 最初の人が入ってから 2 分後に 2 人目が入る
    const h = setup();
    await joined(h, "a-1", "Alice");
    h.advance(2 * MIN);

    // When
    await h.handle("b-1", { command: "room.join", code: ROOM, displayName: "Bob" });

    // Then
    const view = lastView(h, "b-1");
    expect(view.nowMs).toBe(2 * MIN);
    expect(view.epochWallMs).toBe(WALL);
    expect(h.tracks.get(ROOM)!.epochMono).toBe(MONO_START);
  });

  it("ルームを作る・生死を照会するハブの言葉は拒む", async () => {
    // Given
    const h = setup();
    await joined(h, "a-1", "Alice");

    // When
    await h.handle("a-1", { command: "room.check", code: ROOM });

    // Then
    expect(errorsTo(h, "a-1")).toEqual(["INVALID_COMMAND"]);
  });
});

describe("うちわけのコマンド", () => {
  it("開始すると、うちわけの接続すべてへ同じ写しが届く", async () => {
    // Given
    const h = setup();
    await joined(h, "a-1", "Alice");
    await joined(h, "b-1", "Bob");
    h.advance(MIN);

    // When
    await h.handle("a-1", { command: "track.start", label: "実装", kind: "work" });

    // Then
    expect(viewsTo(h, "a-1")).toHaveLength(1);
    expect(viewsTo(h, "b-1")).toEqual(viewsTo(h, "a-1"));
    expect(lastView(h, "b-1").segments).toEqual([
      { id: "g-1", kind: "work", label: "実装", startMs: MIN, endMs: null, autoClosed: false },
    ]);
  });

  it("写しにも保管にも、操作した人を表す値が載らない", async () => {
    // Given
    const h = setup();
    await joined(h, "a-1", "Alice");

    // When
    await h.handle("a-1", { command: "track.start", label: "実装", kind: "work" });

    // Then: 接続 ID・表示名・参加者 ID のどれも、写しと状態に現れない
    const room = h.store.get(ROOM)!;
    const secrets = ["a-1", "Alice", ...room.participants.map((p) => p.id)];
    const dump = JSON.stringify(lastView(h, "a-1")) + JSON.stringify(h.tracks.get(ROOM));
    for (const secret of secrets) expect(dump).not.toContain(secret);
  });

  it("変わらない操作（同じ作業名の押し直し）は配らず、送り主にだけいまの写しを返す", async () => {
    // Given
    const h = setup();
    await joined(h, "a-1", "Alice");
    await joined(h, "b-1", "Bob");
    await h.handle("a-1", { command: "track.start", label: "実装", kind: "work" });
    h.sent.length = 0;

    // When
    await h.handle("a-1", { command: "track.start", label: "実装", kind: "work" });

    // Then
    expect(viewsTo(h, "a-1")).toHaveLength(1);
    expect(viewsTo(h, "b-1")).toEqual([]);
  });

  it("拒まれた操作は、送り主にだけエラーを返し、状態を変えない", async () => {
    // Given
    const h = setup();
    await joined(h, "a-1", "Alice");
    await joined(h, "b-1", "Bob");
    await h.handle("a-1", { command: "track.start", label: "実装", kind: "work" });
    const before = h.tracks.get(ROOM);
    h.sent.length = 0;

    // When: 始まりを越えるさかのぼり
    await h.handle("a-1", { command: "track.stop", backMin: 5 });

    // Then
    expect(errorsTo(h, "a-1")).toEqual(["TRACK_BACKDATE_TOO_FAR"]);
    expect(h.sent.filter((s) => s.connId === "b-1")).toEqual([]);
    expect(h.tracks.get(ROOM)).toBe(before);
  });

  it("切り替え・停止・取り消しが、時計の進みどおりの位置で当たる", async () => {
    // Given
    const h = setup();
    await joined(h, "a-1", "Alice");
    await h.handle("a-1", { command: "track.start", label: "設計", kind: "work" });
    h.advance(10 * MIN);
    await h.handle("a-1", { command: "track.start", label: "", kind: "break" });
    h.advance(5 * MIN);

    // When
    await h.handle("a-1", { command: "track.stop" });
    const stopped = lastView(h, "a-1");
    h.advance(UNDO_WINDOW_MS - 1);
    await h.handle("a-1", { command: "track.undo", rev: stopped.undo!.rev });

    // Then
    expect(stopped.segments.map((g) => [g.kind, g.startMs, g.endMs])).toEqual([
      ["work", 0, 10 * MIN],
      ["break", 10 * MIN, 15 * MIN],
    ]);
    expect(lastView(h, "a-1").segments.at(-1)!.endMs).toBeNull();
  });

  it("離れていたとき: stop の atMs で切る・track.away で休憩にする。どちらも全員へ配り、取り消せる", async () => {
    // Given: 設計が 0 分から計測中・いまは 120 分
    const h = setup();
    await joined(h, "a-1", "Alice");
    await joined(h, "b-1", "Bob");
    await h.handle("a-1", { command: "track.start", label: "設計", kind: "work" });
    h.advance(120 * MIN);
    h.sent.length = 0;

    // When: 90 分の位置からいままでを休憩にする
    await h.handle("a-1", { command: "track.away", fromMs: 90 * MIN });

    // Then: 全員に同じ写しが届き、取り消しの種類は away
    expect(viewsTo(h, "b-1")).toEqual(viewsTo(h, "a-1"));
    const away = lastView(h, "b-1");
    expect(away.undo!.kind).toBe("away");
    expect(away.segments.map((g) => [g.kind, g.label, g.startMs, g.endMs])).toEqual([
      ["work", "設計", 0, 90 * MIN],
      ["break", "", 90 * MIN, 120 * MIN],
      ["work", "設計", 120 * MIN, null],
    ]);

    // When: 取り消す
    await h.handle("b-1", { command: "track.undo", rev: away.undo!.rev });
    expect(lastView(h, "a-1").segments.map((g) => [g.kind, g.startMs, g.endMs])).toEqual([["work", 0, null]]);

    // When: 60 分の位置で切る
    await h.handle("a-1", { command: "track.stop", atMs: 60 * MIN });
    expect(lastView(h, "b-1").segments.map((g) => [g.kind, g.startMs, g.endMs])).toEqual([["work", 0, 60 * MIN]]);
    expect(lastView(h, "b-1").undo!.kind).toBe("stop");
  });

  it("離れていたとき: 始まり以前・同時指定・計測していない away は、状態を変えない", async () => {
    // Given
    const h = setup();
    await joined(h, "a-1", "Alice");
    await joined(h, "b-1", "Bob");
    await h.handle("a-1", { command: "track.away", fromMs: 1_000 });
    expect(errorsTo(h, "a-1")).toEqual([]);
    expect(h.tracks.get(ROOM)!.segments).toEqual([]);
    await h.handle("a-1", { command: "track.start", label: "設計", kind: "work" });
    h.advance(30 * MIN);
    const before = h.tracks.get(ROOM);
    h.sent.length = 0;

    // When
    await h.handle("a-1", { command: "track.away", fromMs: 0 });
    await h.handle("a-1", { command: "track.stop", atMs: 10 * MIN, backMin: 5 });
    await h.handle("a-1", { command: "track.stop", atMs: 31 * MIN });

    // Then: 境界で拒まれた 1 件は INVALID_COMMAND、ほか 2 件は TRACK_BACKDATE_TOO_FAR
    expect(errorsTo(h, "a-1")).toEqual(["TRACK_BACKDATE_TOO_FAR", "INVALID_COMMAND", "TRACK_BACKDATE_TOO_FAR"]);
    expect(h.sent.filter((s) => s.connId === "b-1")).toEqual([]);
    expect(h.tracks.get(ROOM)).toBe(before);
  });

  it("期限を過ぎた取り消しは何もせず、送り主にだけ写しを返す", async () => {
    // Given
    const h = setup();
    await joined(h, "a-1", "Alice");
    await joined(h, "b-1", "Bob");
    await h.handle("a-1", { command: "track.start", label: "設計", kind: "work" });
    const rev = lastView(h, "a-1").undo!.rev;
    h.advance(UNDO_WINDOW_MS);
    h.sent.length = 0;

    // When
    await h.handle("a-1", { command: "track.undo", rev });

    // Then
    expect(lastView(h, "a-1").segments).toHaveLength(1);
    expect(lastView(h, "a-1").undo).toBeNull();
    expect(viewsTo(h, "b-1")).toEqual([]);
  });

  it("手直しのコマンドが当たる（付け替え・調整・分割・追加・削除・定番・消す）", async () => {
    // Given: 設計 0-10 分・実装 10 分〜（計測中）、いまは 30 分
    const h = setup();
    await joined(h, "a-1", "Alice");
    await h.handle("a-1", { command: "track.start", label: "設計", kind: "work" });
    h.advance(10 * MIN);
    await h.handle("a-1", { command: "track.start", label: "実装", kind: "work" });
    h.advance(20 * MIN);
    const shape = (): string[] => lastView(h, "a-1").segments.map((g) => `${g.kind === "break" ? "休憩" : g.label}:${g.startMs / MIN}-${g.endMs === null ? "" : g.endMs / MIN}`);

    // When / Then
    await h.handle("a-1", { command: "track.segment.set", id: "g-1", label: "要件", kind: "work" });
    expect(shape()).toEqual(["要件:0-10", "実装:10-"]);
    await h.handle("a-1", { command: "track.segment.adjust", id: "g-1", edge: "end", atMs: 12 * MIN });
    expect(shape()).toEqual(["要件:0-12", "実装:12-"]);
    await h.handle("a-1", { command: "track.segment.split", id: "g-2", atMs: 20 * MIN, label: "レビュー", kind: "work" });
    expect(shape()).toEqual(["要件:0-12", "実装:12-20", "レビュー:20-"]);
    await h.handle("a-1", { command: "track.segment.insert", startMs: 14 * MIN, endMs: 16 * MIN, label: "", kind: "break" });
    expect(shape()).toEqual(["要件:0-12", "実装:12-14", "休憩:14-16", "実装:16-20", "レビュー:20-"]);
    await h.handle("a-1", { command: "track.segment.remove", id: "g-1" });
    expect(shape()).toEqual(["実装:12-14", "休憩:14-16", "実装:16-20", "レビュー:20-"]);
    await h.handle("a-1", { command: "track.pin", label: "実装", pinned: true });
    expect(lastView(h, "a-1").pinned).toEqual(["実装"]);
    await h.handle("a-1", { command: "track.clear" });
    expect(lastView(h, "a-1").segments).toEqual([]);
    expect(lastView(h, "a-1").pinned).toEqual(["実装"]);
    expect(errorsTo(h, "a-1")).toEqual([]);
  });

  it("track.sync は送り主にだけ、いまの位置の写しを返す", async () => {
    // Given
    const h = setup();
    await joined(h, "a-1", "Alice");
    await joined(h, "b-1", "Bob");
    await h.handle("a-1", { command: "track.start", label: "設計", kind: "work" });
    h.advance(90_000);
    h.sent.length = 0;

    // When
    await h.handle("b-1", { command: "track.sync" });

    // Then
    expect(lastView(h, "b-1").nowMs).toBe(90_000);
    expect(viewsTo(h, "a-1")).toEqual([]);
  });
});

describe("うちわけの接続の守り", () => {
  it("参加していない接続のコマンドは NOT_IN_ROOM", async () => {
    // Given
    const h = setup();

    // When
    await h.handle("x-1", { command: "track.start", label: "実装", kind: "work" });

    // Then
    expect(errorsTo(h, "x-1")).toEqual(["NOT_IN_ROOM"]);
    expect(h.tracks.get(ROOM)).toBeUndefined();
  });

  it("壊れた JSON・知らないコマンド・余計な項目は境界で拒む", async () => {
    // Given
    const h = setup();
    await joined(h, "a-1", "Alice");

    // When
    await h.handle("a-1", "{not json");
    await h.handle("a-1", { command: "agenda.start" });
    await h.handle("a-1", { command: "track.stop", by: "Alice" });

    // Then
    expect(errorsTo(h, "a-1")).toEqual(["INVALID_JSON", "INVALID_COMMAND", "INVALID_COMMAND"]);
  });

  it("作業名をログに書かない（ハンドラはログを書かない）", async () => {
    // Given
    const h = setup();
    await joined(h, "a-1", "Alice");

    // When: 成功する操作と、拒まれる操作
    await h.handle("a-1", { command: "track.start", label: "秘密の案件名", kind: "work" });
    await h.handle("a-1", { command: "track.stop", backMin: 15 });
    await h.handle("a-1", { command: "track.pin", label: "秘密の案件名", pinned: true });

    // Then
    expect(h.logLines).toEqual([]);
  });
});
