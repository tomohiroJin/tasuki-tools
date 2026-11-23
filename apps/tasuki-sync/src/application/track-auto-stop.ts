/**
 * うちわけの、全員の切断による自動の停止（#476・FR-24・設計 §4.3）。
 *
 * 名簿が配られるたびに（組み立ての `onRosterBroadcast` の口）数え直す。**名簿の全員が不在**
 * （どの道具・玄関にも接続が無い。アイドルの回収 `room-reclaimer.ts` と同じ数え方）になったら、
 * その時刻を覚えて猶予を待つ。猶予の後も不在のままなら、計測中の区切りを**覚えた時刻**で閉じる。
 *
 * - うちわけの画面だけを閉じて別の道具を見続けている間は、計り続ける（不在と数えない）
 * - 猶予の内に誰かが戻れば何もしない（再読み込み・瞬断で閉じない。`docs/adr/0028` 決定 11 と同じ考え方）
 * - 時計は**単調時計**だけを使う
 * - **ログを書かない**（作業名は利用者の入力。`docs/adr/0012`）
 */
import { presenceOf } from "@tasuki/room-core";
import { autoStop, runningSegmentOf, toView } from "@tasuki/track-core";
import type { MonotonicClock } from "../ports/monotonic-clock.js";
import type { RoomStore } from "../ports/room-store.js";
import type { TrackStore } from "../ports/track-store.js";
import type { TimerPort } from "./agenda-deadlines.js";

/** 全員が不在になってから、区切りを閉じるまで待つ時間。 */
export const TRACK_AUTO_STOP_GRACE_MS = 60 * 1000;

export interface TrackAutoStopDeps<H = unknown> {
  store: Pick<RoomStore, "get">;
  tracks: TrackStore;
  clock: MonotonicClock;
  /** 猶予のタイマー。本番は setTimeout。試験は偽物を渡して手で発火させる */
  timer: TimerPort<H>;
  /** 閉じた後に配る（保管のあとに呼ぶ。受け手が居なければ何も送られない） */
  publish: (roomCode: string) => void;
  /** 猶予の長さ。既定は {@link TRACK_AUTO_STOP_GRACE_MS}。実 WS の試験が設定で縮める */
  graceMs?: number | undefined;
}

export interface TrackAutoStop {
  /** 名簿が変わった（参加・切断・退出・ハブへの移動）。状態が無ければ何もしない */
  rosterChanged(roomCode: string): void;
  /** ルームの破棄で、そのルームの猶予を解放する（`destroy-room.ts`） */
  clearRoom(roomCode: string): void;
  /** シャットダウンで全ルームの猶予を解放する */
  clearAll(): void;
}

export function makeTrackAutoStop<H>(deps: TrackAutoStopDeps<H>): TrackAutoStop {
  const graceMs = deps.graceMs ?? TRACK_AUTO_STOP_GRACE_MS;
  /** roomCode → 不在を最初に見た時刻（単調時計）と猶予の予約 */
  const pending = new Map<string, { since: number; handle: H }>();

  function clear(roomCode: string): void {
    const held = pending.get(roomCode);
    if (held === undefined) return;
    deps.timer.clear(held.handle);
    pending.delete(roomCode);
  }

  /** 全員が不在で、閉じる区切りがあるか。 */
  function shouldStop(roomCode: string): boolean {
    const room = deps.store.get(roomCode);
    const state = deps.tracks.get(roomCode);
    if (room === undefined || state === undefined) return false;
    if (runningSegmentOf(toView(state, deps.clock.now())) === null) return false;
    return room.participants.every((p) => presenceOf(p) === "offline");
  }

  function expired(roomCode: string, since: number): void {
    pending.delete(roomCode);
    // 発火の時点でもう一度確かめる（名簿の知らせより先に予約が来る・古い予約が残る場合がある）
    if (!shouldStop(roomCode)) return;
    const state = deps.tracks.get(roomCode);
    if (state === undefined) return;
    const next = autoStop(state, { at: since });
    if (next === state) return;
    deps.tracks.put(roomCode, next);
    deps.publish(roomCode);
  }

  return {
    rosterChanged(roomCode) {
      if (!shouldStop(roomCode)) {
        clear(roomCode);
        return;
      }
      // 不在のまま名簿が何度配られても、最初に不在を見た時刻を保つ（猶予を張り直さない）
      if (pending.has(roomCode)) return;
      const since = deps.clock.now();
      pending.set(roomCode, { since, handle: deps.timer.set(() => expired(roomCode, since), graceMs) });
    },
    clearRoom: clear,
    clearAll() {
      for (const roomCode of [...pending.keys()]) clear(roomCode);
    },
  };
}
