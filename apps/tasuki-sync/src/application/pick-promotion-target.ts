/**
 * 輪の最後の席が抜けるとき、代わりに輪へ入れる人を選ぶ（#290・D2）。
 *
 * **在席を優先する。** 離席中の人を唯一のドライバーに据えると、#276 が扱った
 * 「席は在るのに誰も居ない」状態を自分で作ることになる。同条件なら参加の早い順で、
 * 選択を決定的にする（順序が揺れるとテストも実挙動も再現しない）。
 *
 * **判定だけを持ち、状態を変えない。** 輪へ実際に入れるのは呼び出し側である
 * （`command-handlers/participant-remove.ts`）。
 */
import { isPresentIn } from "@tasuki/room-core";
import type { Participant } from "@tasuki/room-core";
import { TOOL_TIMER } from "./tool-id.js";

/** 在席（優先する）を表す `presenceRank` の値。 */
const SEATED_RANK = 0;
/** 離席（後回しにする）を表す `presenceRank` の値。 */
const AWAY_RANK = 1;

export function pickPromotionTarget(
  participants: readonly Participant[],
  seatedIds: ReadonlySet<string>,
  leavingId: string,
): Participant | null {
  const candidates = participants.filter(
    (p) => p.id !== leavingId && !seatedIds.has(p.id),
  );
  if (candidates.length === 0) return null;
  // 在席は timer の在席で見る（D21 が正本）。`presenceOf` は接続が 1 本でもあれば
  // `online` を返し、ハブ（選択画面）や poker のタブを 1 本持っているだけの人も
  // 拾ってしまう。それで繰り上げると、繰り上がった本人は timer を見ていないのに
  // 唯一のドライバーになり、`seatSkipReason` がその席を不適格と判定し続けて
  // `advanceDriver` が「現状維持＋再アンカー」へ縮退する
  // （`apps/tasuki-sync/src/application/timer-snapshot-dto.ts` の D21 と同じ理由）。
  const presenceRank = (p: Participant): number =>
    isPresentIn(p, TOOL_TIMER) ? SEATED_RANK : AWAY_RANK;
  return candidates.reduce((best, p) => {
    const byPresence = presenceRank(p) - presenceRank(best);
    if (byPresence !== 0) return byPresence < 0 ? p : best;
    return p.joinedAt < best.joinedAt ? p : best;
  });
}
