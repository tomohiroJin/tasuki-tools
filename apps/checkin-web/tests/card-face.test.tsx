import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { METHOD_IDS, METHODS } from '@tasuki/checkin-core';
import { CardFace } from '../src/components/CardFace';
import { NUMERIC_METHODS } from '../src/reveal-view';

const NUMERIC = {
  energy: ['1', '2', '3', '4', '5'],
  expectation: ['1', '2', '3', '4', '5'],
  roti: ['1', '2', '3', '4', '5'],
  understanding: ['1', '2', '3', '4', '5'],
  focus: ['2', '5', '8', '10'],
} as const;

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

  it('顔に数字を出すやり方と、開いた後に数のやり方として扱うやり方（NUMERIC_METHODS）が一致する', () => {
    const shown = METHOD_IDS.filter((m) => render(<CardFace method={m} card={METHODS[m].cards[0]!} />).container.querySelector('.card-numeral'));
    expect([...NUMERIC_METHODS].sort()).toEqual([...shown].sort());
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

  it('終わりの天気は今日の天気と同じ絵（#465・並べて比べやすいように）', () => {
    for (const card of METHODS['weather-end'].cards) {
      const end = render(<CardFace method="weather-end" card={card} />).container.innerHTML;
      const start = render(<CardFace method="weather" card={card} />).container.innerHTML;
      expect(end).toBe(start);
    }
  });

  it('始まりの気分は終わりの気分（mood）と絵を使い回さない', () => {
    const end = new Set(METHODS.mood.cards.map((card) => render(<CardFace method="mood" card={card} />).container.innerHTML));
    for (const card of METHODS['mood-start'].cards) {
      expect(end.has(render(<CardFace method="mood-start" card={card} />).container.innerHTML)).toBe(false);
    }
  });

  it('知らない札は何も描かない（落ちない）', () => {
    const { container } = render(<CardFace method="weather" card="nope" />);
    expect(container.textContent).toBe('');
  });
});
