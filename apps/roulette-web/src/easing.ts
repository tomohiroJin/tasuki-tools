/**
 * 円盤の動きの緩急（#94・#420）。`x` は 0〜1 の進み具合、返り値は 0〜1 の動いた割合。
 */
export type Ease = (x: number) => number;

export const linear: Ease = (x) => x;

/** 3 次の減速（4 次だと最後の 1 秒がほぼ止まって見えた）。 */
export const easeOutCubic: Ease = (x) => 1 - Math.pow(1 - x, 3);

export const easeInOutCubic: Ease = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
export const easeInOutSine: Ease = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
export const easeOutSine: Ease = (x) => Math.sin((x * Math.PI) / 2);
