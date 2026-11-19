/**
 * 変わった動きを引く（#640 決めること 1・6）。乱数は引数で受ける（ドメインは環境を読まない）。
 * 動き出しと回転は別々に引く（止まり方 `drawStopStyle` とも独立）。引き方は止まり方と同じ {@link drawRare}。
 */
import type { Result } from "neverthrow";
import type { RouletteError } from "./errors.js";
import { LAUNCH_MOTIONS, LAUNCH_MOTION_ODDS, SPIN_MOTIONS, SPIN_MOTION_ODDS, type LaunchMotion, type SpinMotion } from "./limits.js";
import { drawRare } from "./rare.js";

/** 動き出しの動きを引く（1/{@link LAUNCH_MOTION_ODDS}）。外れたら null */
export function drawLaunchMotion(randomInt: (n: number) => number): Result<LaunchMotion | null, RouletteError<"INVALID_RANDOM">> {
  return drawRare(LAUNCH_MOTIONS, LAUNCH_MOTION_ODDS, randomInt);
}

/** 回転の動きを引く（1/{@link SPIN_MOTION_ODDS}）。外れたら null */
export function drawSpinMotion(randomInt: (n: number) => number): Result<SpinMotion | null, RouletteError<"INVALID_RANDOM">> {
  return drawRare(SPIN_MOTIONS, SPIN_MOTION_ODDS, randomInt);
}
