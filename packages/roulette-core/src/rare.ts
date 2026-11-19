/**
 * まれに起きる選びの共通の引き方（#420 止まり方・#640 変わった動き）。乱数は引数で受ける（ドメインは環境を読まない）。
 */
import { err, ok, type Result } from "neverthrow";
import type { RouletteError } from "./errors.js";

const isIndex = (i: number, n: number): boolean => Number.isInteger(i) && i >= 0 && i < n;

/**
 * 1/`odds` の目（`[0, odds)` の**最後の値**）のときだけ、`names` から一様に 1 つ選ぶ。外れたら null。
 * 出る目を最後の値にするのは、0 を返し続ける乱数（最悪の偏りを見るテストの既定）で毎回出ないようにするため。
 * `randomInt` が契約（`[0, n)` の整数）を破ったら `INVALID_RANDOM`。
 */
export function drawRare<T>(names: readonly T[], odds: number, randomInt: (n: number) => number): Result<T | null, RouletteError<"INVALID_RANDOM">> {
  const roll = randomInt(odds);
  if (!isIndex(roll, odds)) return err({ code: "INVALID_RANDOM" });
  if (roll !== odds - 1) return ok(null);
  const index = randomInt(names.length);
  const name = isIndex(index, names.length) ? names[index] : undefined;
  return name === undefined ? err({ code: "INVALID_RANDOM" }) : ok(name);
}
