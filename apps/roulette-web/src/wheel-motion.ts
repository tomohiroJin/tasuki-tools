/**
 * 円盤の動き（#94 PR 3・spec §6.4）。React にも時計にも依存しない純粋関数。
 *
 * 角度は「真上 0°・時計回り」。席 i は回転子の座標で `[i·s, (i+1)·s)`（`s = 360/n`）を占める。
 */

/** 余分に回る周回（2 版で 5 → 4）。 */
export const TURNS = 4;

/** 舞台の幅がこれより狭ければ縦積み（指し針は下）。 */
const STACK_MAX_PX = 720;

export type StageLayout = 'stack' | 'row';

/** 舞台の幅で決める並び。**画面の幅ではない**（脇の有無で舞台の幅が変わる）。 */
export function stageLayoutFor(widthPx: number): StageLayout {
  return widthPx >= STACK_MAX_PX ? 'row' : 'stack';
}

/** 指し針の位置（円盤の外）。縦積みは真下（180°）・横並びは右（90°）。 */
export function pointerDegFor(layout: StageLayout): number {
  return layout === 'row' ? 90 : 180;
}

const mod = (x: number, m: number): number => ((x % m) + m) % m;

/**
 * 指し針の下に、当たりの席の `settle`（0〜1）の位置が来る回転子の角度。
 *
 * **360° の剰余は `startDeg` に依らない**ので、どの画面も同じ席で止まる。`startDeg` は回し始めに
 * その画面が見せている角度で、0° へ戻さない（戻すと前の止まった位置から跳ぶ）。
 */
export function finalAngle(n: number, winnerIndex: number, settle: number, pointerDeg: number, startDeg: number): number {
  return startDeg + 360 * TURNS + mod(pointerDeg - (winnerIndex + settle) * (360 / n) - startDeg, 360);
}

/** 3 次の減速（4 次だと最後の 1 秒がほぼ止まって見えた）。 */
export function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}

/** 経過 `elapsedMs` の回転子の角度。 */
export function angleAt(
  elapsedMs: number,
  durationMs: number,
  n: number,
  winnerIndex: number,
  settle: number,
  pointerDeg: number,
  startDeg: number,
): number {
  const t = Math.min(Math.max(elapsedMs / durationMs, 0), 1);
  return startDeg + (finalAngle(n, winnerIndex, settle, pointerDeg, startDeg) - startDeg) * easeOutCubic(t);
}

/** 回転子が `angle` のとき、指し針の下にある席の番号（指し針の弾みに使う）。 */
export function segmentBoundaryIndex(angle: number, n: number, pointerDeg: number): number {
  return Math.floor(mod(pointerDeg - angle, 360) / (360 / n));
}
