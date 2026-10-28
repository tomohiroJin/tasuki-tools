import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { METHOD_IDS, METHODS } from '@tasuki/checkin-core';
import { CardFace } from '../src/components/CardFace';

const NUMERIC = { energy: ['1', '2', '3', '4', '5'], roti: ['1', '2', '3', '4', '5'], focus: ['2', '5', '8', '10'] } as const;

const ALL = METHOD_IDS.flatMap((method) => METHODS[method].cards.map((card) => [method, card] as const));

/**
 * @requirements #406 E1（札は絵だけ・数のやり方は数字）
 */
describe('CardFace', () => {
  it.each(ALL)('%s / %s: 描けて、読み上げから隠れている', (method, card) => {
    const { container } = render(<CardFace method={method} card={card} />);
    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    expect(root?.getAttribute('aria-hidden')).toBe('true');
  });

  it.each(ALL.filter(([m]) => !(m in NUMERIC)))('%s / %s: 絵だけで文字を持たない', (method, card) => {
    const { container } = render(<CardFace method={method} card={card} />);
    expect(container.textContent).toBe('');
    expect(container.querySelectorAll('svg path, svg circle, svg rect, svg line').length).toBeGreaterThan(1);
  });

  it.each(Object.entries(NUMERIC))('%s: 数字だけを持つ', (method, shown) => {
    const cards = METHODS[method as keyof typeof NUMERIC].cards;
    expect(cards.length).toBe(shown.length);
    cards.forEach((card, i) => {
      const { container } = render(<CardFace method={method as keyof typeof NUMERIC} card={card} />);
      expect(container.textContent).toBe(shown[i]);
      expect(container.firstElementChild?.className).toContain('card-numeral');
    });
  });

  it('同じやり方の中で札ごとに絵が違う', () => {
    for (const method of METHOD_IDS) {
      const seen = METHODS[method].cards.map((card) => render(<CardFace method={method} card={card} />).container.innerHTML);
      expect(new Set(seen).size).toBe(seen.length);
    }
  });

  it('金の面の path は面積を持つ（同じ半径の弧の往復で潰れた形を作らない）', () => {
    for (const [method, card] of ALL) {
      const { container } = render(<CardFace method={method} card={card} />);
      for (const el of container.querySelectorAll('path.ca-gold')) {
        // 弧は `a` の後に 7 つの数を 1 組として、省略形で続けて書ける。組に分けて半径と向きを見る
        const arcs = [...(el.getAttribute('d') ?? '').matchAll(/a((?:-?[\d.]+[ ,]?){7}(?:\s*(?:-?[\d.]+[ ,]?){7})*)/g)]
          .flatMap((m) => {
            const nums = (m[1] ?? '').match(/-?\d+(?:\.\d+)?/g) ?? [];
            return Array.from({ length: Math.floor(nums.length / 7) }, (_, i) => nums.slice(i * 7, i * 7 + 7));
          });
        if (arcs.length === 2) {
          const [a, b] = arcs;
          const sameRadius = a?.[0] === b?.[0] && a?.[1] === b?.[1];
          expect(sameRadius && a?.[4] !== b?.[4], `${method}/${card}`).toBe(false);
        }
      }
    }
  });

  it('知らない札は何も描かない（落ちない）', () => {
    const { container } = render(<CardFace method="weather" card="nope" />);
    expect(container.textContent).toBe('');
  });
});
