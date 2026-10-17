/**
 * 押して止める回転の位置（#401 押して止める P2・P5）。
 *
 * **サーバーと全画面が同じこの式で「いま指し針が指している位置」を出す。** 位置は席の単位で、整数部が席の番号・小数部が
 * 席の中の位置。円盤は時計回りに回るので、位置は時間とともに減る（`wheel-motion.ts` の角度 = 指し針 − 位置 × 席の角度）。
 */
import { PRESS_AUTO_STOP_MS } from "./limits.js";
import type { PressSpin, PressStop } from "./types.js";

/** 位置を出すのに要る回転の項目（wire の形からも呼べるように、省略可を `undefined` でも受ける） */
type PressSource = { press?: PressSpin | undefined; wheel: readonly unknown[] };

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** 回し始めから `elapsedMs` の時点の位置（0 以上 席の数 未満）。押して止める回転でなければ 0 */
export function pressPositionAt(spin: PressSource, elapsedMs: number): number {
  const press = spin.press;
  const n = spin.wheel.length;
  if (press === undefined || n === 0) return 0;
  return mod(press.p0 - (press.rate * elapsedMs) / 1000, n);
}

/**
 * 止まったところ。押されていればその位置、押されないまま 30 秒を過ぎていれば**30 秒の時点の位置**（押した人は無い）、
 * それ以外は null（まだ回っている）。**自動の停止は状態に書かない**: 誰の時計でも同じ式で同じ人が出る（サーバーは時計を持たない）。
 */
export function pressStopOf(spin: PressSource, elapsedMs: number): PressStop | null {
  const press = spin.press;
  if (press === undefined) return null;
  if (press.stop !== null) return press.stop;
  if (elapsedMs < PRESS_AUTO_STOP_MS) return null;
  const p = pressPositionAt(spin, PRESS_AUTO_STOP_MS);
  const index = Math.floor(p);
  return { index, settle: p - index, by: null, atMs: PRESS_AUTO_STOP_MS };
}
