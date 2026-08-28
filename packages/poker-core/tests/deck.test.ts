import { describe, expect, it } from 'vitest';
import { FIBONACCI_DECK, cardEquals, cardKey, type Card } from '../src/deck';

describe('FIBONACCI_DECK', () => {
  it('フィボナッチ10種を順序どおりに含む（0,1,2,3,5,8,13,21,?,☕）', () => {
    expect(FIBONACCI_DECK).toHaveLength(10);
    expect(FIBONACCI_DECK.slice(0, 8)).toEqual([
      { kind: 'number', value: 0 },
      { kind: 'number', value: 1 },
      { kind: 'number', value: 2 },
      { kind: 'number', value: 3 },
      { kind: 'number', value: 5 },
      { kind: 'number', value: 8 },
      { kind: 'number', value: 13 },
      { kind: 'number', value: 21 },
    ]);
    expect(FIBONACCI_DECK[8]).toEqual({ kind: 'question' });
    expect(FIBONACCI_DECK[9]).toEqual({ kind: 'coffee' });
  });
});

describe('cardKey', () => {
  it('カードごとに一意なキーを返す', () => {
    const keys = FIBONACCI_DECK.map(cardKey);
    expect(new Set(keys).size).toBe(10);
  });

  it('数値カードは値を含むキーになる', () => {
    expect(cardKey({ kind: 'number', value: 5 })).toContain('5');
  });
});

describe('cardEquals', () => {
  it('同じカード同士は等しい', () => {
    // Given
    const five: Card = { kind: 'number', value: 5 };
    // When / Then（cardEquals は純粋関数なので呼び出しと検証が同じ式になる）
    expect(cardEquals(five, { kind: 'number', value: 5 })).toBe(true);
    expect(cardEquals({ kind: 'question' }, { kind: 'question' })).toBe(true);
    expect(cardEquals({ kind: 'coffee' }, { kind: 'coffee' })).toBe(true);
  });

  it('異なるカードは等しくない', () => {
    // Given: 比較する 2 枚のカードを渡す呼び出し自体が前提の指定を兼ねる
    // When / Then（cardEquals は純粋関数なので呼び出しと検証が同じ式になる）
    expect(cardEquals({ kind: 'number', value: 5 }, { kind: 'number', value: 8 })).toBe(false);
    expect(cardEquals({ kind: 'number', value: 0 }, { kind: 'question' })).toBe(false);
    expect(cardEquals({ kind: 'question' }, { kind: 'coffee' })).toBe(false);
  });
});
