// カード手札（フィボナッチデッキ 10 種。FR-005〜007）
import { FIBONACCI_DECK, cardEquals, cardKey, type Card } from '@tasuki/poker-core';

export function cardLabel(card: Card): string {
  switch (card.kind) {
    case 'number':
      return String(card.value);
    case 'question':
      return '?';
    case 'coffee':
      return '☕';
  }
}

interface Props {
  selected: Card | null;
  onSelect: (card: Card) => void;
  /** revealed 中は選択不可（FR-007 は公開前のみ変更可） */
  disabled: boolean;
}

export function CardHand({ selected, onSelect, disabled }: Props) {
  return (
    <div className="card-hand" role="group" aria-label="カードを選ぶ">
      {FIBONACCI_DECK.map((card) => {
        const isSelected = selected !== null && cardEquals(card, selected);
        const label = cardLabel(card);
        return (
          <button
            key={cardKey(card)}
            type="button"
            className={`card${isSelected ? ' selected' : ''}`}
            data-label={label}
            // `.card::after` がコーナーピップとして `data-label` の中身を描くため、
            // これが無いと読み上げ名が「5 5」のように二重になる（実測）。
            // 名前を明示して、目で見える札の値と読み上げを一致させる。
            aria-label={label}
            aria-pressed={isSelected}
            disabled={disabled}
            onClick={() => onSelect(card)}
          >
            <span className="card-face">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
