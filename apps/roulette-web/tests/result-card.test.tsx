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

  it('Given 段のどれが付いても / Then CSS に data-size の規則がある（lg は clamp を持たない）', () => {
    for (const size of ['md', 'sm']) {
      expect(CSS).toContain(`.roulette-card-name[data-size='${size}']`);
    }
    expect(CSS).not.toContain(".roulette-card-name[data-size='lg']");
  });

  it('Given どの段でも / Then 「さん」は nowrap で、1 字ずつ折れない（#373）', () => {
    const rule = CSS.match(/\.roulette-card-name small \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('white-space: nowrap');
  });
});
