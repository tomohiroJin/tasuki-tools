/**
 * 変わった止まり方を引く（#420 spec S3）。乱数は引数で受ける（ドメインは環境を読まない）。
 */
import type { Result } from "neverthrow";
import type { RouletteError } from "./errors.js";
import { STOP_STYLES, STOP_STYLE_ODDS, type StopStyle } from "./limits.js";
import { drawRare } from "./rare.js";

/**
 * 1/`STOP_STYLE_ODDS` の目（`[0, STOP_STYLE_ODDS)` の**最後の値**）のときだけ、止まり方を一様に 1 つ選ぶ。外れたら null。
 * `randomInt` が契約（`[0, n)` の整数）を破ったら `INVALID_RANDOM`（{@link drawRare}）。
 */
export function drawStopStyle(randomInt: (n: number) => number): Result<StopStyle | null, RouletteError<"INVALID_RANDOM">> {
  return drawRare(STOP_STYLES, STOP_STYLE_ODDS, randomInt);
}
