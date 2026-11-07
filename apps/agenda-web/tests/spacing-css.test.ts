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
  it('Given agenda の保存した流れ / When 画面の CSS と JSX を読む / Then 縦の並びの写し（display: grid の gap）と、どの CSS にも当たらない builder-saved クラスを持たない', () => {
    const css = read('src/builder.css');
    expect(ruleBody(css, '.builder-saved')).toBeNull();
    expect(ruleBody(css, '.builder-saved-list') ?? '').not.toMatch(/display:|gap:/);
    expect(read('src/components/SavedScenarioList.tsx')).not.toMatch(/className="[^"]*\bbuilder-saved\b(?!-)[^"]*"/);
  });
});
