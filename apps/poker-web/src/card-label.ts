import type { Card } from '@tasuki/poker-core';

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
