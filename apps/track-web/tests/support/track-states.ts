// 台本つきの偽の WebSocket は共有（`@tasuki/test-css/scripted-web-socket`）。ここには、このアプリの固定データだけを置く
import type { SegmentKind, SegmentView, TrackView } from '@tasuki/track-core';

export { ScriptedWebSocket, latestSocket } from '@tasuki/test-css/scripted-web-socket';

/** 端末に置く復帰の組（玄関と同じ鍵 `tasuki:resume:<コード>`）。 */
export const RESUME = { code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' };

export const JOINED = { type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' };

/** 名簿のフレーム（あや・ゆうの 2 人が在室） */
export const ROSTER_FRAME = {
  type: 'roster',
  room: {
    code: 'R1',
    participants: [
      { participantId: 'p1', displayName: 'あや', presence: 'online', tools: ['track'] },
      { participantId: 'p2', displayName: 'ゆう', presence: 'online', tools: ['track'] },
    ],
  },
};

export const MIN = 60_000;

/** 時刻軸の 0 に当たる壁時計（2026-11-23 01:00:00 UTC） */
export const EPOCH_WALL_MS = Date.UTC(2026, 10, 23, 1, 0, 0);

/** 区切りを 1 つ作る。 */
export function seg(id: string, kind: SegmentKind, label: string, startMs: number, endMs: number | null, autoClosed = false): SegmentView {
  return { id, kind, label, startMs, endMs, autoClosed };
}

/** うちわけの写し。既定は空の記録。 */
export function trackView(over: Partial<TrackView> = {}): TrackView {
  return { epochWallMs: EPOCH_WALL_MS, nowMs: 0, segments: [], pinned: [], rev: 0, undo: null, resumeOffer: false, ...over };
}

/** 空の記録 */
export const EMPTY_TRACK = trackView();

/**
 * 計測中の写し。Review 30 分 → 休憩 15 分 → Build を計測中（`nowMs` は既定で開始から 60 分）。
 */
export function runningTrack(nowMs = 60 * MIN, over: Partial<TrackView> = {}): TrackView {
  return trackView({
    nowMs,
    segments: [seg('g-1', 'work', 'Review', 0, 30 * MIN), seg('g-2', 'break', '', 30 * MIN, 45 * MIN), seg('g-3', 'work', 'Build', 45 * MIN, null)],
    rev: 3,
    ...over,
  });
}

/** 止まっている写し。Review 30 分 → Build 15 分（45 分で停止）。 */
export function stoppedTrack(nowMs = 60 * MIN, over: Partial<TrackView> = {}): TrackView {
  return trackView({
    nowMs,
    segments: [seg('g-1', 'work', 'Review', 0, 30 * MIN), seg('g-2', 'work', 'Build', 30 * MIN, 45 * MIN)],
    rev: 3,
    ...over,
  });
}

/** `track` フレーム */
export const trackFrame = (state: TrackView) => ({ type: 'track', state });
