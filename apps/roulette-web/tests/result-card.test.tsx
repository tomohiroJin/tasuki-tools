import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MAX_DISPLAY_NAME } from '@tasuki/room-core';
import { ResultCard } from '../src/components/ResultCard';
import { CARD_SUFFIX } from '../src/copy';

/** 結果の札の名前の段が、描画と CSS の両方に届いていること（#373）。 */
const CSS = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/index.css'), 'utf8');

describe('ResultCard の名前の段', () => {
  it.each([
    ['あや', 'lg'],
    ['Alexander', 'lg'],
    ['あ'.repeat(15), 'md'],
    ['あ'.repeat(MAX_DISPLAY_NAME), 'sm'],
  ])('Given %s / Then data-size が %s で、名前と「さん」が別の要素にある', (name, size) => {
    const { container } = render(<ResultCard name={name} revealed />);
    const el = container.querySelector('.roulette-card-name');
    expect(el).toHaveAttribute('data-size', size);
    expect(el?.querySelector('.roulette-card-name-text')).toHaveTextContent(name);
    expect(el?.querySelector('small')).toHaveTextContent(CARD_SUFFIX);
  });

  /** CSS から、段ごとの宣言を読む（セレクタ並びの中に段の指定と、任意の子孫を含む規則）。 */
  function declared(tier: string, descendant: string, prop: string): string | undefined {
    const attr = `.roulette-card-name[data-size='${tier}']${descendant}`;
    let value: string | undefined;
    for (const m of CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const selectors = (m[1] ?? '').split(',').map((x) => x.trim());
      if (!selectors.includes(attr)) continue;
      const decl = (m[2] ?? '').match(new RegExp(`${prop}:\\s*([^;]+);`));
      if (decl) value = decl[1]?.trim();
    }
    return value;
  }

  it.each([
    ['lg', undefined, '2'],
    ['md', 'var(--font-size-lg)', '3'],
    ['sm', 'var(--font-size-base)', '3'],
  ])('Given 段 %s / Then CSS の字の大きさは %s・名前の要素の最大行数は %s（「さん」は clamp しない）', (tier, font, clamp) => {
    expect(declared(tier, '', 'font-size')).toBe(font);
    expect(declared(tier, ' .roulette-card-name-text', '-webkit-line-clamp')).toBe(clamp);
    expect(declared(tier, ' small', '-webkit-line-clamp')).toBeUndefined();
  });

  it('Given どの段でも / Then 「さん」は nowrap で、段の規則の外にある（#373）', () => {
    const rule = CSS.match(/\.roulette-card-name small \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('white-space: nowrap');
  });
});
