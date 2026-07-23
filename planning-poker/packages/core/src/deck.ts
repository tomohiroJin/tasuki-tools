// デッキ定義（data-model「Card」「デッキ」）
// MVP はフィボナッチデッキ 10 種に固定（FR-005）

export const NUMBER_CARD_VALUES = [0, 1, 2, 3, 5, 8, 13, 21] as const;

export type NumberCardValue = (typeof NUMBER_CARD_VALUES)[number];

export type Card =
  | { kind: 'number'; value: NumberCardValue }
  | { kind: 'question' }
  | { kind: 'coffee' };

export const FIBONACCI_DECK: readonly Card[] = [
  ...NUMBER_CARD_VALUES.map((value): Card => ({ kind: 'number', value })),
  { kind: 'question' },
  { kind: 'coffee' },
];

/** カードの一意キー（Map のキーや同値判定に使う） */
export function cardKey(card: Card): string {
  return card.kind === 'number' ? `number:${card.value}` : card.kind;
}

export function cardEquals(a: Card, b: Card): boolean {
  return cardKey(a) === cardKey(b);
}
