/**
 * 1 回で決めるときの当たりを引く（#401 で k 人に広げた・#427 で一周の規則を外した）。
 */
import { err, ok, type Result } from "neverthrow";
import type { RouletteError } from "./errors.js";
import type { Entry } from "./types.js";

/**
 * k 人を 1 人ずつ一様に引く（#427）。「同じ人が何度も当たることがあるのがルーレット」なので、
 * 前の回転の当たりは覚えない。
 *
 * - 各回の候補は `pool − この回転ですでに選んだ人`。**1 回の回転で同じ人を 2 度選ばない**
 * - 返すのは止まる順の当たり（`pool` の中の添字・互いに異なる）
 *
 * `randomInt(n)` は `[0, n)` の整数を返す注入された関数（ドメインは環境から値を読まない）。
 * **pool が k 人以下のときは呼ばない前提**: `startSpin` が先に拒む。
 * `randomInt` が契約を破ったら `INVALID_RANDOM` を返す（ドメインは投げない —— `scripts/audit-domain-side-effects.mjs`）。
 */
export function drawPicks(
  pool: readonly Entry[],
  pickCount: number,
  randomInt: (n: number) => number,
): Result<number[], RouletteError<"INVALID_RANDOM">> {
  const picked = new Set<string>();
  const picks: number[] = [];
  for (let i = 0; i < pickCount; i++) {
    const open = pool.filter((e) => !picked.has(e.id));
    const chosen = open[randomInt(open.length)];
    // randomInt が契約（[0, n)）を破った。サーバーの乱数源は契約を守るので、ここへは来ない
    if (chosen === undefined) return err({ code: "INVALID_RANDOM" });
    picked.add(chosen.id);
    picks.push(pool.findIndex((e) => e.id === chosen.id));
  }
  return ok(picks);
}
