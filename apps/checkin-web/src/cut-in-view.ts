/**
 * 札が開いたときのカットインの純粋関数（#670・設計 `docs/superpowers/specs/2026-11-27-cutin-design.md` §4）。
 * 画面（`CheckinRoom`）から切り離して試験する。React にも I/O にも依存しない。
 *
 * - `cutInOf`: 題・色・添え書き。やり方（26 種）では出し分けず、側（始まり／終わり）と「全員同じ」だけで決める
 * - `cutInDelayMs`: 出すまでの待ち。山の札が裏返り終わるまで（ネタばらしをしない）
 * - `seenRoundOf`・`revealedLiveAfter`: 開くのを**接続中に見届けた**描画かの判定。再読み込み・途中入室・
 *   再接続の直後の古い状態では出さない（poker の `revealedLiveAfter` と同じ考え方）
 */
import { METHODS, type MethodId, type PileView } from '@tasuki/checkin-core';
import type { CutInCue } from '@tasuki/web-kit/room';
import { CUTIN_ALL_SAME, CUTIN_CHECKIN, CUTIN_CHECKOUT, SIDE_KICKER } from './copy';
import { METHOD_COPY } from './method-copy';
import { REVEAL_FLIP_MS, revealSchedule, summaryLine } from './reveal-view';

/** 「全員同じ」と呼ぶ出した人数の下限（1 人だけでは全員とは言わない） */
const ALL_SAME_MIN_PLAYERS = 2;

/** `CutInCue` のうち、開いた山の中身だけで決まる部分（id・待ちは画面が足す） */
export type CheckinCutIn = Required<Pick<CutInCue, 'title' | 'sub' | 'tone' | 'kicker'>>;

/**
 * 開いた山からカットインの中身を決める。`piles` は `orderedPiles` を通した（札の順・0 枚の山つき）ものでよい。
 * 出した人が 2 人以上で全員が同じ札 → 「全員同じ」（gold・添え書きは札の名前）。
 * それ以外はチェックインの側 → 「チェックイン」（jade）、チェックアウトの側 → 「おつかれさまでした」（rose）。
 * kicker は側に従う（全員同じのときも）。
 */
export function cutInOf(method: MethodId, piles: readonly PileView[]): CheckinCutIn {
  const side = METHODS[method].side;
  const kicker = SIDE_KICKER[side];
  const total = piles.reduce((n, p) => n + p.count, 0);
  const same = total >= ALL_SAME_MIN_PLAYERS ? piles.find((p) => p.count === total) : undefined;
  if (same !== undefined) {
    return { title: CUTIN_ALL_SAME, sub: METHOD_COPY[method].cards[same.card]?.name ?? same.card, tone: 'gold', kicker };
  }
  return {
    title: side === 'checkin' ? CUTIN_CHECKIN : CUTIN_CHECKOUT,
    sub: summaryLine(method, piles),
    tone: side === 'checkin' ? 'jade' : 'rose',
    kicker,
  };
}

/**
 * 出すまでの待ち。山の札が裏返り終わるまで（最後の札の遅れ ＋ 配って裏返る時間）。
 * 札が 0 枚なら裏返すものが無いので待たない。動きを減らす設定は `CutIn` が描かないので、ここでは考えない。
 */
export function cutInDelayMs(piles: readonly PileView[]): number {
  const total = piles.reduce((n, p) => n + p.count, 0);
  if (total <= 0) return 0;
  const { delaysMs } = revealSchedule(total, false);
  return (delaysMs[total - 1] ?? 0) + REVEAL_FLIP_MS;
}

/** この画面が見た回の印（番号と状態） */
export interface SeenRound {
  seq: number;
  status: 'open' | 'revealed';
}

/**
 * この描画で「見た」ことにする回。**接続中**で、かつ**再接続の直後に残った古い状態ではない**ときだけ。
 * 再接続の直後は、切れる前の状態が残ったまま `joined` だけが真になる（入り直した後のフレームで初めて置き換わる）。
 * 開いた時点の状態の実体（`stale`）を控え、それと同じ間は見ていない（null）ものとして扱う。
 */
export function seenRoundOf(
  joined: boolean,
  view: { round: { seq: number; status: 'open' | 'revealed' } | null } | null,
  stale: unknown,
): SeenRound | null {
  if (!joined || view === null || view === stale || view.round === null) return null;
  return { seq: view.round.seq, status: view.round.status };
}

/** 同じ回が投票中（open）から開いた（revealed）のを、前の描画から今の描画で見届けたか */
export function revealedLiveAfter(previous: SeenRound | null, next: SeenRound | null): boolean {
  return previous !== null && next !== null && previous.status === 'open' && next.status === 'revealed' && previous.seq === next.seq;
}
