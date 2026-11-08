/**
 * 画面の CSS の契約（#553・ADR 0035）。部品の CSS の契約は `packages/ui/tests/spacing-owner.test.mjs`、配置の結果は E2E（`e2e/specs/spacing.spec.ts`）が見る。
 * 部品のテストがアプリを読むと依存の向きが逆（turbo のキャッシュの鍵にも入らない）なので、アプリ自身のテストが自分の CSS を読む。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// vitest はパッケージの直下で動く（`pnpm --filter <app> test`）。アプリ自身のファイルを相対で読む
const root = process.cwd() + '/';
const read = (p: string): string => readFileSync(root + p, 'utf8');

/** `selector { … }` の本体（宣言の文字列）。セレクタは行頭から `{` までの完全一致。無ければ null。 */
function ruleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\>]/g, '\\$&');
  const m = new RegExp(`^${escaped} \\{([^}]*)\\}`, 'm').exec(css);
  return m === null ? null : (m[1] ?? null);
}

describe('余白の持ち主の約束（画面の CSS）', () => {
  it('Given roulette の見出しの行 / When 規則を読む / Then 見出しと小さな字を基準線で揃える', () => {
    expect(ruleBody(read('src/index.css'), '.roulette-regulars-head') ?? '').toMatch(/align-items:\s*baseline;/);
  });
  
  
  it('Given roulette のいつものメンツの区画（縦の flex） / When 規則を読む / Then 直下の子の最小幅を 0 にして、子が区画を広げない', () => {
    expect(ruleBody(read('src/index.css'), '.roulette-regulars > *') ?? '').toMatch(/min-inline-size:\s*0;/);
  });

  it('Given roulette の空の知らせの CSS / When 規則を読む / Then 負の余白・読み上げの木から外す書き方が無く、:empty の写しも持たない（部品 ui-visually-hidden を JSX が足す）', () => {
    const css = read('src/index.css');
    expect(css).not.toMatch(/roulette-regulars-notice:empty/);
    const body = ruleBody(css, '.roulette-regulars-notice') ?? '';
    expect(body).not.toMatch(/display:\s*none|visibility:\s*hidden|margin[^:]*:\s*calc\(\s*-/);
  });
});
