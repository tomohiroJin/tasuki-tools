/**
 * うちわけの画面の純粋な判断（#476・設計 §5）。
 *
 * 集計・候補・Markdown の規則は `@tasuki/track-core` が持つ。ここは画面だけの整形
 * （名前・経過の h:mm:ss・時刻・描き直す秒・取り消しの残り・± の行き先・読み上げの文・タブの題）を持つ。
 * **端末（`document`・時計・時間帯）は読まない。** 要る値は引数で受ける。
 */
import { durationOf, formatClock, formatDuration, runningSegmentOf, type SegmentView, type TrackView } from '@tasuki/track-core';
import { ANNOUNCE_AUTO_STOPPED, ANNOUNCE_STOPPED, BREAK_NAME, UNNAMED_NAME, announceStarted, tabTitle } from './copy';

const MS_PER_SEC = 1000;

/** 区切りの名前。休憩は「休憩」、名前なしは「（名前なし）」。 */
export function nameOf(segment: Pick<SegmentView, 'kind' | 'label'>): string {
  if (segment.kind === 'break') return BREAK_NAME;
  return segment.label === '' ? UNNAMED_NAME : segment.label;
}

/** 目立たせる名前なしの作業か。 */
export const isUnnamed = (segment: Pick<SegmentView, 'kind' | 'label'>): boolean => segment.kind === 'work' && segment.label === '';

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 長さを h:mm:ss にする（秒未満は切り捨て）。 */
export function formatElapsed(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / MS_PER_SEC);
  return `${Math.floor(seconds / 3600)}:${pad2(Math.floor(seconds / 60) % 60)}:${pad2(seconds % 60)}`;
}

/** 時刻軸の位置を、指定の時間帯の HH:MM にする。 */
export function clockOf(view: Pick<TrackView, 'epochWallMs'>, posMs: number, tzOffsetMin: number): string {
  return formatClock(view.epochWallMs + posMs, tzOffsetMin);
}

/** 区切りの範囲の文（HH:MM–HH:MM。計測中は終わりを出さない）。 */
export function rangeTextOf(view: Pick<TrackView, 'epochWallMs'>, segment: SegmentView, tzOffsetMin: number): string {
  const end = segment.endMs === null ? '' : clockOf(view, segment.endMs, tzOffsetMin);
  return `${clockOf(view, segment.startMs, tzOffsetMin)}–${end}`;
}

/**
 * 表示する秒の位相（計測中の経過に足すと、画面に出るそれぞれの時間になる値の、秒の端数）。
 *
 * 画面が秒まで出すのは、区切りの経過・その作業名の合計・作業（か休憩）の合計・全体。
 * 閉じた区切りの長さが秒の端数を持つと、合計の秒は経過の秒とずれた瞬間に変わるので、端数ごとに見張る。
 * 止まっているときは空（動くものが無い）。
 */
export function secondPhasesOf(view: TrackView): number[] {
  const running = runningSegmentOf(view);
  if (running === null) return [];
  let sameName = 0;
  let sameKind = 0;
  let all = 0;
  for (const g of view.segments) {
    if (g.endMs === null) continue;
    const ms = durationOf(g, g.endMs);
    all += ms;
    if (g.kind === running.kind) sameKind += ms;
    if (g.kind === 'work' && running.kind === 'work' && g.label === running.label) sameName += ms;
  }
  return [...new Set([0, sameName % MS_PER_SEC, sameKind % MS_PER_SEC, all % MS_PER_SEC])].sort((a, b) => a - b);
}

/** 表示する秒の組。これが変わったときだけ描き直す。 */
export function shownSecondsKey(phases: readonly number[], elapsedMs: number): string {
  return phases.map((phase) => Math.floor((phase + elapsedMs) / MS_PER_SEC)).join(':');
}

/** 取り消しの残り秒（切り上げ）。期限を過ぎたら 0（下ろす）。 */
export function undoSecondsOf(remainingMs: number, sinceReceivedMs: number): number {
  return Math.max(0, Math.ceil((remainingMs - Math.max(0, sinceReceivedMs)) / MS_PER_SEC));
}

/**
 * ± のボタンの行き先。動かせる範囲（`adjustRangeOf`）に収め、範囲を使い切った所で止める。
 * その向きへ動かせなければ null（ボタンを押せなくする）。位置は整数に収める（境界のスキーマは整数だけを受ける）。
 */
export function steppedEdge(currentMs: number, deltaMs: number, range: { minMs: number; maxMs: number } | null): number | null {
  if (range === null) return null;
  const minMs = Math.ceil(range.minMs);
  const maxMs = Math.floor(range.maxMs);
  if (minMs > maxMs) return null;
  // いまの位置が整数でなくても（古いサーバーの写しなど）、送る位置は整数にする
  const target = Math.min(maxMs, Math.max(minMs, Math.round(currentMs + deltaMs)));
  // 範囲の外にいる端を、押した向きと逆へは引き戻さない
  if (deltaMs > 0 ? target <= currentMs : target >= currentMs) return null;
  return target;
}

/**
 * 読み上げの文。**切り替え・停止・自動の停止のときだけ**返す（経過は読ませない）。
 * 最初の写し・同じ区切りのままの写しは null。
 */
export function announcementFor(prev: TrackView | null, next: TrackView): string | null {
  if (prev === null) return null;
  const before = runningSegmentOf(prev);
  const after = runningSegmentOf(next);
  if (after !== null) return before?.id === after.id ? null : announceStarted(nameOf(after));
  if (before === null) return null;
  return next.resumeOffer && next.segments.at(-1)?.autoClosed === true ? ANNOUNCE_AUTO_STOPPED : ANNOUNCE_STOPPED;
}

/** タブの題（計測中だけ。止まっていれば null ＝元の題に戻す）。 */
export function tabTitleOf(view: TrackView, nowMs: number): string | null {
  const running = runningSegmentOf(view);
  return running === null ? null : tabTitle(nameOf(running), formatDuration(durationOf(running, nowMs)));
}
