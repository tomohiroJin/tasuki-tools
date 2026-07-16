// 集計（data-model「集計ルール」/ FR-010）
// average は数値票のみの算術平均（生値。丸めは web の責務）、
// modes は ?/☕ を含む全票の最頻カード（同数はすべて返す）
import { cardKey, type Card } from './deck';
import type { RoundStats } from './protocol';

export function computeStats(cards: readonly Card[]): RoundStats {
  const numbers: number[] = cards.flatMap((card) => (card.kind === 'number' ? [card.value] : []));
  const average =
    numbers.length === 0 ? null : numbers.reduce((sum, v) => sum + v, 0) / numbers.length;

  const counts = new Map<string, { card: Card; count: number }>();
  for (const card of cards) {
    const key = cardKey(card);
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { card, count: 1 });
  }
  const max = Math.max(0, ...[...counts.values()].map((e) => e.count));
  const modes = [...counts.values()].filter((e) => e.count === max).map((e) => e.card);

  return { average, modes };
}
