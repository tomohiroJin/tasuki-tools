/**
 * 懐中時計の盤の幾何（#429 spec §7.2）。`AgendaView` だけを読む純粋関数。
 *
 * 角度は度で、**12 時が 0°・時計回り**。1 周（360°）は予定の合計（開始時点の長さの合計。延長・飛ばしで動かない）。
 * 針と内の環の先端は、どちらも**実時間の経過**（一時停止の間も進む）を同じ式で角度にするので必ず一致する
 * （spec §4.1 の不変条件: 終えたステップの所要の合計 ＋ いまのステップの所要 ＝ 実時間の経過）。
 */
import { plannedTotalMs, projectedEndMs, type AgendaView } from '@tasuki/agenda-core';

const FULL = 360;
const MS_PER_SEC = 1000;
const SEC_PER_MIN = 60;

export interface OuterSegment {
  readonly id: string;
  readonly startDeg: number;
  readonly endDeg: number;
  readonly skipped: boolean;
}

export interface InnerSegment {
  readonly id: string;
  readonly startDeg: number;
  readonly endDeg: number;
  /** 延長した「足し」の始まり（持ち時間の長さの先）。いまのステップで延長があるときだけ値を持つ */
  readonly extensionStartDeg: number | null;
  /** 延長した「足し」の終わり（持ち時間の先）。`extensionStartDeg` と対 */
  readonly extensionEndDeg: number | null;
  /** いまのステップか（済んだ区画と色を分ける） */
  readonly current: boolean;
}

/** ms を盤の角度にする（頭打ちしない）。予定の合計が 0 なら 0 */
export function angleOfMs(ms: number, totalMs: number): number {
  // 先に掛けてから割る（整数の ms なら、割り切れる角度は誤差なく出る）
  return totalMs <= 0 ? 0 : (ms * FULL) / totalMs;
}

/** 0〜360 に収める（1 周で頭打ち） */
const lap = (deg: number): number => Math.min(Math.max(deg, 0), FULL);

/** 外の環（予定）。開始時点の長さで割り、延長・飛ばしでは変えない。飛ばした区画も残す */
export function outerSegments(v: AgendaView): OuterSegment[] {
  const total = plannedTotalMs(v);
  let acc = 0;
  return v.steps.map((x) => {
    const startDeg = angleOfMs(acc, total);
    acc += x.durationSec * MS_PER_SEC;
    return { id: x.id, startDeg, endDeg: angleOfMs(acc, total), skipped: x.skipped };
  });
}

/** いまのステップの所要か、済んだステップの確定した所要。まだ・飛ばしたものは null（内の環に出さない） */
function spentOf(v: AgendaView, step: AgendaView['steps'][number]): number | null {
  if (step.skipped) return null;
  if (step.id === v.currentId) return v.stepSpentMs;
  return step.spentMs;
}

/** 内の環（実際）。所要を並べて伸ばし、1 周で頭打ちにする。足し上げは ms で行い、角度にするのは最後 */
export function innerSegments(v: AgendaView): InnerSegment[] {
  const total = plannedTotalMs(v);
  const out: InnerSegment[] = [];
  let acc = 0;
  for (const x of v.steps) {
    const spent = spentOf(v, x);
    if (spent === null) continue;
    const start = acc;
    acc += spent;
    const current = x.id === v.currentId;
    const hasExtension = current && x.extensionSec > 0;
    const budgetEnd = start + x.durationSec * MS_PER_SEC;
    out.push({
      id: x.id,
      startDeg: lap(angleOfMs(start, total)),
      endDeg: lap(angleOfMs(acc, total)),
      extensionStartDeg: hasExtension ? lap(angleOfMs(budgetEnd, total)) : null,
      extensionEndDeg: hasExtension ? lap(angleOfMs(budgetEnd + x.extensionSec * MS_PER_SEC, total)) : null,
      current,
    });
  }
  return out;
}

/** 針。実時間の経過の角度（一時停止中も進む）。1 周で頭打ち */
export function needleDeg(v: AgendaView): number {
  return lap(angleOfMs(v.runElapsedMs, plannedTotalMs(v)));
}

/** 終了見込みの印（縁の三角）の角度。12 時を過ぎた分も持つ（2 周目の手前で頭打ち）。描くときは 360 で回り込む */
export function projectedMarkerDeg(v: AgendaView): number {
  return Math.min(Math.max(angleOfMs(projectedEndMs(v), plannedTotalMs(v)), 0), 2 * FULL);
}

/** 押しているとき、12 時から印までの縁を塗る長さ（0〜360） */
export function lateRimDeg(v: AgendaView): number {
  return lap(projectedMarkerDeg(v) - FULL);
}

/** オーバーの軌道（3 本目の環）。実時間が 12 時を超えた分（0〜360。満ちたら満ちたまま） */
export function overrunTrackDeg(v: AgendaView): number {
  return lap(angleOfMs(v.runElapsedMs, plannedTotalMs(v)) - FULL);
}

/** 6 時のスモールセコンド。ステップの計時で回るので、一時停止の間は止まる */
export function smallSecondsDeg(v: AgendaView): number {
  return ((v.stepTimerMs / MS_PER_SEC) % SEC_PER_MIN) * (FULL / SEC_PER_MIN);
}

/** 番号を置ける区画の最小の角度（これより狭い区画は番号を省く。名前は中央と進行表が持つ） */
export const MIN_NUMBER_SPAN = 14;

export interface PlanLabel {
  readonly key: string;
  readonly text: string;
  /** 札を置く角度（区画の中央） */
  readonly deg: number;
  readonly skipped: boolean;
}

/**
 * 外の環の札。回数 1 は区画ごとの番号（幅が `MIN_NUMBER_SPAN` を超える区画だけ）。
 * 回数 2 以上は**回ごとに 1 つ**（回の数・その回の区画全体の中央・その回の幅が `MIN_NUMBER_SPAN` を超えるときだけ。
 * 60 区画でも札が重ならない）。`skipped` はその回の全区切りが飛ばされたとき。
 */
export function planLabels(v: AgendaView): PlanLabel[] {
  const segs = outerSegments(v);
  if (v.rounds < 2) {
    return segs.flatMap((seg, i) =>
      seg.endDeg - seg.startDeg > MIN_NUMBER_SPAN
        ? [{ key: seg.id, text: String(i + 1), deg: (seg.startDeg + seg.endDeg) / 2, skipped: seg.skipped }]
        : [],
    );
  }
  const out: PlanLabel[] = [];
  for (let round = 1; round <= v.rounds; round++) {
    const mine = segs.filter((_, i) => v.steps[i]?.round === round);
    const first = mine[0];
    const last = mine[mine.length - 1];
    if (first === undefined || last === undefined) continue;
    if (last.endDeg - first.startDeg <= MIN_NUMBER_SPAN) continue;
    out.push({
      key: `round-${round}`,
      text: String(round),
      deg: (first.startDeg + last.endDeg) / 2,
      skipped: mine.every((s) => s.skipped),
    });
  }
  return out;
}

/* ── SVG の座標（viewBox 0 0 400 400・中心 200,200） ─────────────────── */

export const DIAL_CENTER = 200;

/** 角度と半径から座標を出す（12 時が 0°） */
export function polar(r: number, deg: number): readonly [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [DIAL_CENTER + r * Math.cos(a), DIAL_CENTER + r * Math.sin(a)];
}

const round2 = (n: number): string => n.toFixed(2);

/** 円弧の `d`。1 周ぶんは始点と終点が重なって消えるので、わずかに手前で止める */
export function arcPath(r: number, d0: number, d1: number): string {
  const end = d1 - d0 >= FULL - 0.01 ? d0 + FULL - 0.01 : d1;
  const [x0, y0] = polar(r, d0);
  const [x1, y1] = polar(r, end);
  const large = end - d0 > 180 ? 1 : 0;
  return `M${round2(x0)} ${round2(y0)} A${r} ${r} 0 ${large} 1 ${round2(x1)} ${round2(y1)}`;
}
