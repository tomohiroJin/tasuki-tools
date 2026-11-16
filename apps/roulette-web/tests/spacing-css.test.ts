/**
 * 画面の CSS の契約（#553・ADR 0035）。部品の CSS の契約は `packages/ui/tests/spacing-owner.test.mjs`、配置の結果は E2E（`e2e/specs/spacing.spec.ts`）が見る。
 * 部品のテストがアプリを読むと依存の向きが逆（turbo のキャッシュの鍵にも入らない）なので、アプリ自身のテストが自分の CSS を読む。
 */
import { describe, expect, it } from 'vitest';

import { foundBody, readFromCwd as read, rulesMatching, rulesOf } from '@tasuki/test-css/css-rules';

describe('余白の持ち主の約束（画面の CSS）', () => {
  it('Given roulette の見出しの行 / When 規則を読む / Then 見出しと小さな字を基準線で揃える', () => {
    expect(foundBody(rulesOf(read('src/index.css'), '.roulette-regulars-head'), '.roulette-regulars-head')).toMatch(/align-items:\s*baseline;/);
  });


  it('Given roulette のいつものメンツの区画（縦の flex） / When 規則を読む / Then 区画自身の最小幅を 0 にして、親の列の守りが無くても広がらない', () => {
    expect(foundBody(rulesOf(read('src/index.css'), '.roulette-regulars'), '.roulette-regulars')).toMatch(/min-inline-size:\s*0;/);
  });

  it('Given roulette の空の知らせの CSS / When 規則を読む / Then 負の余白・読み上げの木から外す書き方が無く、:empty の写しも持たない（部品 ui-visually-hidden を JSX が足す）', () => {
    const css = read('src/index.css');
    expect(rulesMatching(css, /roulette-regulars-notice:empty/)).toEqual([]);
    const bodies = rulesOf(css, '.roulette-regulars-notice');
    foundBody(bodies, '.roulette-regulars-notice');
    for (const body of bodies) expect(body).not.toMatch(/display:\s*none|visibility:\s*hidden|margin[^:]*:\s*calc\(\s*-/);
  });

  it('Given roulette の入る人の行（折り返し可） / When 規則を読む / Then 行の間と列の間を --space-2 で持つ。名前と「名前を消す」が次の行へ回っても 2 段が詰まらない（文字 200% の 320・390・#557）', () => {
    const css = read('src/index.css');
    const body = foundBody(rulesOf(css, '.roulette-row'), '.roulette-row');
    expect(body).toMatch(/(^|[\s;])gap:\s*var\(--space-2\);/);
  });
});
