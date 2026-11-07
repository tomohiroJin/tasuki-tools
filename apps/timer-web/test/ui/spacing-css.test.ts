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
  it('Given timer の見出しの行の操作の塊 / When 規則を読む / Then 右へ寄せない（折り返したとき見出しの下に左端そろいで置く）', () => {
    const body = ruleBody(read('src/styles/roster-panel.css'), '.roster-panel-head-actions');
    expect(body).not.toBe(null);
    expect(body).not.toMatch(/justify-content:\s*(flex-end|end|right)/);
    expect(body).not.toMatch(/flex:\s*1/);
  });
  
  
  it('Given timer の「ランダム」のスタイル / When 読み込みを読む / Then shuffle-button.css が持ち、index.css が読む（名簿の CSS には置かない）', () => {
    expect(read('src/styles/shuffle-button.css')).toMatch(/\.shuffle-button-label[\s\S]*\.shuffle-button-icon/);
    expect(read('src/index.css')).toMatch(/@import '\.\/styles\/shuffle-button\.css';/);
    expect(read('src/styles/roster-panel.css')).not.toMatch(/shuffle-button/);
  });
  
  
  it('Given 共有メモの見出しの行 / When .shared-memo-lead を読む / Then 縮められ（flex: 1 1 8rem・折り返し可）、「編集」が見出しの行の右に残る（一覧 #18）', () => {
    const body = ruleBody(read('src/styles/shared-memo.css'), '.shared-memo-lead') ?? '';
    expect(body).toMatch(/flex:\s*1 1 8rem;/);
    expect(body).toMatch(/flex-wrap:\s*wrap;/);
    expect(body).toMatch(/min-width:\s*0;/);
  });

  it('Given 画面の CSS / When 並びの写しを探す / Then 部品の修飾 --beside を画面が上書きする規則を持たない', () => {
    expect(read('src/styles/primitives.css')).not.toMatch(/section-header--beside/);
  });
});
