/**
 * 変わった止まり方を引く（#420 spec S3）。乱数は引数で受ける（ドメインは環境を読まない）。
 */
import { err, ok, type Result } from "neverthrow";
import type { RouletteError } from "./errors.js";
import { STOP_STYLES, STOP_STYLE_ODDS, type StopStyle } from "./limits.js";

const isIndex = (i: number, n: number): boolean => Number.isInteger(i) && i >= 0 && i < n;

/**
 * 1/`STOP_STYLE_ODDS` の目（`[0, STOP_STYLE_ODDS)` の**最後の値**）のときだけ、止まり方を一様に 1 つ選ぶ。外れたら null。
 * 出る目を最後の値にするのは、0 を返し続ける乱数（最悪の偏りを見るテストの既定）で毎回出ないようにするため。
 * `randomInt` が契約（`[0, n)` の整数）を破ったら `INVALID_RANDOM`。
 */
export function drawStopStyle(randomInt: (n: number) => number): Result<StopStyle | null, RouletteError<"INVALID_RANDOM">> {
  const roll = randomInt(STOP_STYLE_ODDS);
  if (!isIndex(roll, STOP_STYLE_ODDS)) return err({ code: "INVALID_RANDOM" });
  if (roll !== STOP_STYLE_ODDS - 1) return ok(null);
  const style = STOP_STYLES[randomInt(STOP_STYLES.length)];
  return style === undefined ? err({ code: "INVALID_RANDOM" }) : ok(style);
}
