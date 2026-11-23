/**
 * うちわけの、全員の切断による自動の停止（#476・FR-24・設計 §4.3）。
 *
 * 名簿が配られるたびに数え直し、全員が不在のまま猶予を過ぎたら、計測中の区切りを最後の切断の時刻で閉じる。
 * 猶予のタイマーは偽物（張られた予約を記録し、手で発火させる）。
 */
import { describe, expect, it } from "bun:test";
import { createTrackState, start, type TrackState } from "@tasuki/track-core";
import type { Room } from "@tasuki/room-core";
import { makeTrackAutoStop, TRACK_AUTO_STOP_GRACE_MS } from "../src/application/track-auto-stop.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTrackStore } from "../src/adapters/in-memory-track-store.js";
import { roomWith } from "./support/track-rooms.js";

const ROOM = "ROOM-A";
const MIN = 60_000;

interface Harness {
  store: InMemoryRoomStore;
  tracks: InMemoryTrackStore;
  autoStop: ReturnType<typeof makeTrackAutoStop>;
  advance: (ms: number) => void;
  /** いま張られている猶予の数 */
  pending: () => number;
  /** 張られている猶予を発火させる */
  fire: () => void;
  published: string[];
  graceMsSeen: number[];
}

function setup(graceMs?: number): Harness {
  const store = new InMemoryRoomStore();
  const tracks = new InMemoryTrackStore();
  let now = 0;
  const timers = new Map<number, () => void>();
  let nextHandle = 1;
  const published: string[] = [];
  const graceMsSeen: number[] = [];
  const autoStop = makeTrackAutoStop({
    store,
    tracks,
    clock: { now: () => now },
    timer: {
      set: (fn, ms) => {
        graceMsSeen.push(ms);
        const handle = nextHandle++;
        timers.set(handle, fn);
        return handle;
      },
      clear: (handle) => {
        timers.delete(handle);
      },
    },
    publish: (roomCode) => published.push(roomCode),
    ...(graceMs === undefined ? {} : { graceMs }),
  });
  return {
    store,
    tracks,
    autoStop,
    advance: (ms) => {
      now += ms;
    },
    pending: () => timers.size,
    fire: () => {
      const [entry] = timers;
      if (entry === undefined) throw new Error("前提の構築に失敗した: 張られた猶予が無い");
      timers.delete(entry[0]);
      entry[1]();
    },
    published,
    graceMsSeen,
  };
}

/** 0 から計測中の「実装」を持つ状態 */
const running = (): TrackState => start(createTrackState({ mono: 0, wallMs: 0 }), { label: "実装", kind: "work", now: 0 })._unsafeUnwrap();

function put(h: Harness, room: Room, state: TrackState = running()): void {
  h.store.put(room);
  h.tracks.put(ROOM, state);
}

describe("うちわけの全員切断", () => {
  it("全員が不在のまま猶予を過ぎたら、最後の切断の時刻で区切りを閉じ、印と問いかけを立てる", () => {
    // Given: 計測中に、10 分の時点で全員が切断した
    const h = setup();
    put(h, roomWith(ROOM, { online: 1 }));
    h.advance(10 * MIN);
    h.store.put(roomWith(ROOM, { online: 0, offline: 1 }));

    // When: 名簿が配られ、猶予が過ぎる
    h.autoStop.rosterChanged(ROOM);
    h.advance(TRACK_AUTO_STOP_GRACE_MS);
    h.fire();

    // Then: 閉じる位置は猶予の後ではなく、切断を見た時刻
    const state = h.tracks.get(ROOM)!;
    expect(state.segments).toEqual([{ id: "g-1", kind: "work", label: "実装", startMs: 0, endMs: 10 * MIN, autoClosed: true }]);
    expect(state.resumeOffer).toBe(true);
    expect(h.published).toEqual([ROOM]);
  });

  it("猶予の長さは既定で 60 秒", () => {
    // Given
    const h = setup();
    put(h, roomWith(ROOM, { online: 0, offline: 1 }));

    // When
    h.autoStop.rosterChanged(ROOM);

    // Then
    expect(TRACK_AUTO_STOP_GRACE_MS).toBe(60_000);
    expect(h.graceMsSeen).toEqual([60_000]);
  });

  it("猶予の長さは設定で変えられる", () => {
    // Given
    const h = setup(250);
    put(h, roomWith(ROOM, { online: 0, offline: 1 }));

    // When
    h.autoStop.rosterChanged(ROOM);

    // Then
    expect(h.graceMsSeen).toEqual([250]);
  });

  it("猶予の内に誰かが戻れば、閉じない", () => {
    // Given: 全員が切断して猶予が張られた
    const h = setup();
    put(h, roomWith(ROOM, { online: 0, offline: 1 }));
    h.autoStop.rosterChanged(ROOM);
    expect(h.pending()).toBe(1);

    // When: 戻ってきた
    h.store.put(roomWith(ROOM, { online: 1 }));
    h.autoStop.rosterChanged(ROOM);

    // Then
    expect(h.pending()).toBe(0);
    expect(h.tracks.get(ROOM)!.segments[0]!.endMs).toBeNull();
  });

  it("玄関やほかの道具に 1 本でも接続があれば、不在と数えない", () => {
    // Given: うちわけの画面は閉じたが、別の道具を見ている人がいる
    const h = setup();
    put(h, roomWith(ROOM, { online: 1, offline: 2 }));

    // When
    h.autoStop.rosterChanged(ROOM);

    // Then
    expect(h.pending()).toBe(0);
  });

  it("不在のまま名簿が何度配られても、覚える時刻は最初に不在を見た時刻のまま", () => {
    // Given
    const h = setup();
    put(h, roomWith(ROOM, { online: 0, offline: 1 }));
    h.advance(3 * MIN);
    h.autoStop.rosterChanged(ROOM);

    // When: 30 秒後にもう一度配られる（猶予は張り直さない）
    h.advance(30_000);
    h.autoStop.rosterChanged(ROOM);
    h.fire();

    // Then
    expect(h.graceMsSeen).toHaveLength(1);
    expect(h.tracks.get(ROOM)!.segments[0]!.endMs).toBe(3 * MIN);
  });

  it("計測していなければ、猶予を張らない", () => {
    // Given
    const h = setup();
    put(h, roomWith(ROOM, { online: 0, offline: 1 }), createTrackState({ mono: 0, wallMs: 0 }));

    // When
    h.autoStop.rosterChanged(ROOM);

    // Then
    expect(h.pending()).toBe(0);
  });

  it("うちわけの状態が無いルームでは、何もしない", () => {
    // Given
    const h = setup();
    h.store.put(roomWith(ROOM, { online: 0, offline: 1 }));

    // When
    h.autoStop.rosterChanged(ROOM);

    // Then
    expect(h.pending()).toBe(0);
  });

  it("発火の時点で誰かが戻っていたら、閉じない（古い予約の誤発火）", () => {
    // Given: 猶予が張られた後、名簿の知らせが届かないまま誰かが戻った
    const h = setup();
    put(h, roomWith(ROOM, { online: 0, offline: 1 }));
    h.autoStop.rosterChanged(ROOM);
    h.store.put(roomWith(ROOM, { online: 1 }));

    // When
    h.fire();

    // Then
    expect(h.tracks.get(ROOM)!.segments[0]!.endMs).toBeNull();
    expect(h.published).toEqual([]);
  });

  it("ルームの破棄で、そのルームの猶予を解放する", () => {
    // Given
    const h = setup();
    put(h, roomWith(ROOM, { online: 0, offline: 1 }));
    h.autoStop.rosterChanged(ROOM);

    // When
    h.autoStop.clearRoom(ROOM);

    // Then
    expect(h.pending()).toBe(0);
  });

  it("サーバーを止めるとき、全ルームの猶予を解放する", () => {
    // Given: 2 つのルームに猶予が張られている
    const h = setup();
    put(h, roomWith(ROOM, { online: 0, offline: 1 }));
    h.store.put(roomWith("ROOM-B", { online: 0, offline: 1 }));
    h.tracks.put("ROOM-B", running());
    h.autoStop.rosterChanged(ROOM);
    h.autoStop.rosterChanged("ROOM-B");
    expect(h.pending()).toBe(2);

    // When
    h.autoStop.clearAll();

    // Then
    expect(h.pending()).toBe(0);
  });
});
