/**
 * 変わった動きを引く（#640 決めること 1・6）。乱数は引数で受ける（ドメインは環境を読まない）。
 * 動き出しと回転は別々に引く（止まり方 `drawStopStyle` とも独立）。
 */
import { err, ok, type Result } from "neverthrow";
import type { RouletteError } from "./errors.js";
import { LAUNCH_MOTIONS, LAUNCH_MOTION_ODDS, SPIN_MOTIONS, SPIN_MOTION_ODDS, type LaunchMotion, type SpinMotion } from "./limits.js";

const isIndex = (i: number, n: number): boolean => Number.isInteger(i) && i >= 0 && i < n;

/**
 * 1/`odds` の目（`[0, odds)` の**最後の値**）のときだけ、`names` から一様に 1 つ選ぶ。外れたら null。
 * 出る目を最後の値にするのは、0 を返し続ける乱数（最悪の偏りを見るテストの既定）で毎回出ないようにするため（`drawStopStyle` と同じ）。
 * `randomInt` が契約（`[0, n)` の整数）を破ったら `INVALID_RANDOM`。
 */
function drawRare<T>(names: readonly T[], odds: number, randomInt: (n: number) => number): Result<T | null, RouletteError<"INVALID_RANDOM">> {
  const roll = randomInt(odds);
  if (!isIndex(roll, odds)) return err({ code: "INVALID_RANDOM" });
  if (roll !== odds - 1) return ok(null);
  const index = randomInt(names.length);
  const name = isIndex(index, names.length) ? names[index] : undefined;
  return name === undefined ? err({ code: "INVALID_RANDOM" }) : ok(name);
}

/** 動き出しの動きを引く（1/{@link LAUNCH_MOTION_ODDS}）。外れたら null */
export function drawLaunchMotion(randomInt: (n: number) => number): Result<LaunchMotion | null, RouletteError<"INVALID_RANDOM">> {
  return drawRare(LAUNCH_MOTIONS, LAUNCH_MOTION_ODDS, randomInt);
}

/** 回転の動きを引く（1/{@link SPIN_MOTION_ODDS}）。外れたら null */
export function drawSpinMotion(randomInt: (n: number) => number): Result<SpinMotion | null, RouletteError<"INVALID_RANDOM">> {
  return drawRare(SPIN_MOTIONS, SPIN_MOTION_ODDS, randomInt);
}
