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

  /** コメントを除いた CSS の規則（セレクタの並びと本体）。 */
  const RULES = [...CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
    selectors: (m[1] ?? '').split(',').map((x) => x.trim()),
    body: m[2] ?? '',
  }));

  /** セレクタを持つ規則の宣言の値。**規則が無ければ失敗する**（素通りで undefined を返さない）。 */
  function declared(selector: string, prop: string): string | undefined {
    const rules = RULES.filter((r) => r.selectors.includes(selector));
    expect(rules.length, `CSS に ${selector} の規則が無い`).toBeGreaterThan(0);
    let value: string | undefined;
    for (const r of rules) {
      const decl = r.body.match(new RegExp(`(?:^|[\\s;])${prop}:\\s*([^;]+);`));
      if (decl) value = decl[1]?.trim();
    }
    return value;
  }

  const tierSelector = (tier: string, descendant = ''): string => `.roulette-card-name[data-size='${tier}']${descendant}`;

  it.each([
    ['lg', undefined, '2'],
    ['md', 'var(--font-size-lg)', '3'],
    ['sm', 'var(--font-size-base)', '3'],
  ])('Given 段 %s / Then CSS の字の大きさは %s・名前の要素の最大行数は %s', (tier, font, clamp) => {
    expect(declared(tierSelector(tier), 'font-size')).toBe(font);
    expect(declared(tierSelector(tier, ' .roulette-card-name-text'), '-webkit-line-clamp')).toBe(clamp);
  });

  it('Given 「さん」 / Then どの規則も「さん」に line-clamp を掛けない', () => {
    const onSmall = RULES.filter((r) => r.selectors.some((x) => x.endsWith(' small')));
    expect(onSmall.length).toBeGreaterThan(0);
    for (const r of onSmall) expect(r.body).not.toContain('line-clamp');
  });

  it('Given どの段でも / Then 「さん」は nowrap で、段の規則の外にある（#373）', () => {
    expect(declared('.roulette-card-name small', 'white-space')).toBe('nowrap');
  });

  it('Given 存在しないセレクタ / Then 検査自身が失敗する（素通りしない）', () => {
    expect(() => declared(tierSelector('xs'), 'font-size')).toThrow();
  });
});
