/**
 * うちわけの画面の純粋な判断（#476・設計 §5）。
 *
 * 集計・候補・Markdown の規則は `@tasuki/track-core` が持つ。ここは画面だけの整形
 * （名前・経過の h:mm:ss・時刻・描き直す秒・取り消しの残り・± の行き先・読み上げの文・タブの題）を持つ。
 * **端末（`document`・時計・時間帯）は読まない。** 要る値は引数で受ける。
 */
import { MAX_LOOKBACK_MS, MIN_SEGMENT_MS, durationOf, formatClock, formatDuration, formatMonthDay, longRunningOf, runningSegmentOf, type Band, type SegmentView, type TrackView } from '@tasuki/track-core';
import { AWAY_PROMPT_MIN_HIDDEN_MS } from './limits';
import { ANNOUNCE_AUTO_STOPPED, ANNOUNCE_STOPPED, BREAK_NAME, UNNAMED_NAME, announceStarted, bandSummary, tabTitle } from './copy';

const MS_PER_SEC = 1000;

/** 区切りの名前。休憩は「休憩」、名前なしは「（名前なし）」。 */
export function nameOf(segment: Pick<SegmentView, 'kind' | 'label'>): string {
  if (segment.kind === 'break') return BREAK_NAME;
  return segment.label === '' ? UNNAMED_NAME : segment.label;
}

/** 欄を開いている間の描き直しの間隔。止まっている間は画面が描き直さないので、押せる・押せないや「前日」の添えを古いまま残さない（手直しの欄・抜けを足す欄） */
export const OPEN_TICK_MS = 1000;

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

/** 帯と表の色の数（CSS の `.track-tone--0`〜`3` と揃える） */
export const TONE_COUNT = 4;

/**
 * 作業名の色の番号。**表の行の並び（`totalsOf` の降順）の位置**で巡るので、表の行の頭の印と帯の色が同じになる。
 * 良し悪しを表さない（FR-19）。表に無い名前（休憩ほか）は 0。
 */
export function toneIndexOf(rows: readonly { readonly label: string }[], label: string): number {
  const index = rows.findIndex((row) => row.label === label);
  return (index < 0 ? 0 : index) % TONE_COUNT;
}

/**
 * 帯の両端の時刻。右端は切り下げた位置でなく、計測中は「いま」から求める（止まっていれば最後の終わり）。
 * 両端の日付が違うときは、月/日を添える。
 */
export function axisLabelsOf(view: Pick<TrackView, 'epochWallMs'>, band: Band, nowMs: number, tzOffsetMin: number): { start: string; end: string } {
  const startWall = view.epochWallMs + band.startMs;
  const endWall = view.epochWallMs + Math.max(band.endMs, band.running ? nowMs : band.endMs);
  const spans = formatMonthDay(startWall, tzOffsetMin) !== formatMonthDay(endWall, tzOffsetMin);
  const label = (wall: number): string => (spans ? `${formatMonthDay(wall, tzOffsetMin)} ${formatClock(wall, tzOffsetMin)}` : formatClock(wall, tzOffsetMin));
  return { start: label(startWall), end: label(endWall) };
}

/** 帯の読み上げ向けの要約（始まりと終わりの時刻・作業と休憩の区切りの数）。 */
export function bandSummaryOf(view: Pick<TrackView, 'epochWallMs'>, band: Band, nowMs: number, tzOffsetMin: number): string {
  const { start, end } = axisLabelsOf(view, band, nowMs, tzOffsetMin);
  const works = band.parts.filter((part) => part.kind === 'work').length;
  const breaks = band.parts.filter((part) => part.kind === 'break').length;
  return bandSummary(start, end, works, breaks);
}

/** 表に戻ったときに端末が覚えていること。**端末だけが持つ**（サーバーへ送らず、状態にも載せない。設計 §4 C2） */
export interface AwayReturn {
  /** 非表示になった時点の時刻軸の位置（そのときの手元の時計の値） */
  readonly fromMs: number;
  /** 非表示になった時点で計測中だった区切りの id（計測していなければ null） */
  readonly runningId: string | null;
  /** 表に戻った時刻（`performance.now()`）。これ以後に届いた写しで判定する（C1b） */
  readonly returnedAt: number;
}

/** 離れていたときの問いかけ */
export interface AwayPrompt {
  readonly fromMs: number;
  /** 問いかけの対象の区切りの id。これが計測中でなくなれば問いかけは出さない */
  readonly runningId: string;
  /** 離れていた分（切り捨て） */
  readonly awayMin: number;
}

/**
 * 問いかけの対象になる計測中の区切り（作業の条件）。**出すかの判定（`awayPromptOf`）と、出している間の見直し
 * （`isAwayPromptStillValid`）が、この 1 つの関数を通す**（条件を二重に持たない）。次をすべて満たす区切りを返す。
 *
 * - 計測中の区切りが作業（`kind: "work"`。休憩が長く続いても尋ねない）で、`LONG_RUNNING_NOTICE_MS`（90 分）以上続いている
 * - その区切りが、非表示になった時に計測中だった区切りと同じ（離れている間に切り替え・停止されていない）
 * - 非表示になった位置が、その区切りの始まりより後
 * - 非表示になった位置が、いまから `AWAY_PROMPT_MIN_HIDDEN_MS`（10 分）以上前、`MAX_LOOKBACK_MS` 以内（外ならサーバーが拒む。
 *   10 分以上は、サーバーが要る最短の長さ `MIN_SEGMENT_MS` も満たす）
 */
function awayTargetOf(view: TrackView, nowMs: number, fromMs: number, runningId: string | null): SegmentView | null {
  const hiddenMs = nowMs - fromMs;
  if (hiddenMs < Math.max(AWAY_PROMPT_MIN_HIDDEN_MS, MIN_SEGMENT_MS) || hiddenMs > MAX_LOOKBACK_MS) return null;
  const running = longRunningOf(view, nowMs);
  if (running === null || running.kind !== 'work' || running.id !== runningId || running.startMs >= fromMs) return null;
  return running;
}

/**
 * 離れていたときの問いかけを出すか（FR-27・設計 §4 C1・C1b）。**表に戻った後に届いた写しで**、
 * 写しが表に戻った後のもの（`receivedAt` ≧ `away.returnedAt`。戻る前の古い写しでは決めない）で、かつ `awayTargetOf` が区切りを返すときだけ出す。
 *
 * 長さは端末の単調時計ではなく写しの位置で測る（スリープで端末の時計が進まない環境があるため）。
 */
export function awayPromptOf(view: TrackView, nowMs: number, receivedAt: number, away: AwayReturn | null): AwayPrompt | null {
  if (away === null || receivedAt < away.returnedAt) return null;
  const running = awayTargetOf(view, nowMs, away.fromMs, away.runningId);
  if (running === null) return null;
  return { fromMs: away.fromMs, runningId: running.id, awayMin: Math.floor((nowMs - away.fromMs) / 60_000) };
}

/**
 * 出している問いかけを、まだ出してよいか。写しが変わるたびに `awayPromptOf` と同じ条件（`awayTargetOf`）で見直し、
 * 外れたら（誰かが止めた・切り替えた・始まりが動いた・24 時間を越えた）下ろす。
 */
export function isAwayPromptStillValid(view: TrackView, nowMs: number, prompt: AwayPrompt): boolean {
  return awayTargetOf(view, nowMs, prompt.fromMs, prompt.runningId) !== null;
}
