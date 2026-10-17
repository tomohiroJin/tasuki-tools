/**
 * 一周の規則で当たりを引く（#94 spec R6・#401 で k 人に広げた）。
 */
import { err, ok, type Result } from "neverthrow";
import type { RouletteError } from "./errors.js";
import type { Entry, RouletteState } from "./types.js";

export interface PicksResult {
  /** 止まる順の当たり（`pool` の中の添字）。互いに異なる */
  picks: number[];
  /** 引いた後の「この一周で選ばれた人」 */
  drawn: string[];
}

/**
 * k 人を「この一周でまだ選ばれていない人」から 1 人ずつ一様に引く（#94 spec R6・#401 spec M7・M8）。
 *
 * - 各回の候補は `pool − drawn − この回転ですでに選んだ人`。**1 回の回転で同じ人を 2 度選ばない**。
 *   周の途中で入ってきた人は `drawn` に居ないので、その周の残りに入る
 * - 候補が空なら周を閉じる（`drawn = []`）。**周を閉じた後の残りの回では、直前の回転で選ばれた人も除く**
 *   （新しい周の最初に同じ人が続くのを防ぐ）。除くと候補が空になる回は、この回転ですでに選んだ人だけを除く
 *   （入る人が少ないときに引けなくなるのを防ぐ。k = 1 で pool が 1 人のときもここに落ちる）
 * - 直前の回転で選ばれた人は `lastSpin.picks` から取る（`drawn` の末尾は周を閉じた直後に意味が変わる）
 *
 * k = 1 では #94 の 1 人の規則（`tests/support/draw-winner-oracle.ts`）と同じ結果になる
 * （`tests/draw-picks.test.ts` が全組で比べる）。
 *
 * `randomInt(n)` は `[0, n)` の整数を返す注入された関数（ドメインは環境から値を読まない）。
 * **pool が k 人以下のときは呼ばない前提**: `startSpin` が先に拒む。
 * `randomInt` が契約を破ったら `INVALID_RANDOM` を返す（ドメインは投げない —— `scripts/audit-domain-side-effects.mjs`）。
 */
export function drawPicks(
  pool: readonly Entry[],
  state: RouletteState,
  pickCount: number,
  randomInt: (n: number) => number,
): Result<PicksResult, RouletteError<"INVALID_RANDOM">> {
  const spin = state.lastSpin;
  const lastIds = new Set((spin?.picks ?? []).map((p) => spin?.wheel[p.index]?.id));
  let drawn = [...state.drawn];
  let closed = false;
  const picked = new Set<string>();
  const picks: number[] = [];
  for (let i = 0; i < pickCount; i++) {
    let open = pool.filter((e) => !drawn.includes(e.id) && !picked.has(e.id));
    if (open.length === 0) {
      drawn = [];
      closed = true;
      open = pool.filter((e) => !picked.has(e.id));
    }
    const fresh = closed ? open.filter((e) => !lastIds.has(e.id)) : open;
    const eligible = fresh.length > 0 ? fresh : open;
    const chosen = eligible[randomInt(eligible.length)];
    // randomInt が契約（[0, n)）を破った。サーバーの乱数源は契約を守るので、ここへは来ない
    if (chosen === undefined) return err({ code: "INVALID_RANDOM" });
    picked.add(chosen.id);
    drawn.push(chosen.id);
    picks.push(pool.findIndex((e) => e.id === chosen.id));
  }
  return ok({ picks, drawn });
}
