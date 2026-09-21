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
import { presenceOf } from "@tasuki/room-core";
import type { Participant } from "@tasuki/room-core";

export function pickPromotionTarget(
  participants: readonly Participant[],
  seatedIds: ReadonlySet<string>,
  leavingId: string,
): Participant | null {
  const candidates = participants.filter(
    (p) => p.id !== leavingId && !seatedIds.has(p.id),
  );
  if (candidates.length === 0) return null;
  // 在席を 0・離席を 1 とし、小さいほうを優先する。
  const presenceRank = (p: Participant): number => (presenceOf(p) === "online" ? 0 : 1);
  return candidates.reduce((best, p) => {
    const byPresence = presenceRank(p) - presenceRank(best);
    if (byPresence !== 0) return byPresence < 0 ? p : best;
    return p.joinedAt < best.joinedAt ? p : best;
  });
}
