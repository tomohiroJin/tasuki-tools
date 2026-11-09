/**
 * 画面の CSS の契約（#553・ADR 0035）。部品の CSS の契約は `packages/ui/tests/spacing-owner.test.mjs`、配置の結果は E2E（`e2e/specs/spacing.spec.ts`）が見る。
 * 部品のテストがアプリを読むと依存の向きが逆（turbo のキャッシュの鍵にも入らない）なので、アプリ自身のテストが自分の CSS を読む。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// vitest はパッケージの直下で動く（`pnpm --filter <app> test`）。アプリ自身のファイルを相対で読む
const root = process.cwd() + '/';
const read = (p: string): string => readFileSync(root + p, 'utf8');

/** 規則（宣言ブロックを持つもの）を、`@media` などの入れ子の中・字下げした規則・`,` でつないだセレクタも含めてすべて集める。 */
interface CssRule {
  readonly selectors: readonly string[];
  readonly body: string;
}

/** `,` で区切る（`:is(a, b)` の括弧の中の `,` では区切らない）。 */
function splitSelectors(prelude: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < prelude.length; i++) {
    const c = prelude[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(prelude.slice(from, i));
      from = i + 1;
    }
  }
  out.push(prelude.slice(from));
  return out.map((s) => s.replace(/\s+/g, ' ').trim());
}

function collectRules(css: string): CssRule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: CssRule[] = [];
  const stack: { prelude: string; start: number }[] = [];
  let last = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '{') {
      stack.push({ prelude: src.slice(last, i).trim(), start: i + 1 });
      last = i + 1;
    } else if (c === '}') {
      const top = stack.pop();
      if (top !== undefined && !top.prelude.startsWith('@')) rules.push({ selectors: splitSelectors(top.prelude), body: src.slice(top.start, i) });
      last = i + 1;
    } else if (c === ';') {
      last = i + 1;
    }
  }
  return rules;
}

/** セレクタの並びに `selector` を（完全一致で）含む規則の本体を、すべて返す。無ければ空。 */
function rulesOf(css: string, selector: string): string[] {
  const want = selector.replace(/\s+/g, ' ').trim();
  return collectRules(css).filter((r) => r.selectors.includes(want)).map((r) => r.body);
}

/** セレクタのどれかが `pattern` に当たる規則の本体を、すべて返す。 */
function rulesMatching(css: string, pattern: RegExp): string[] {
  return collectRules(css).filter((r) => r.selectors.some((s) => pattern.test(s))).map((r) => r.body);
}

/** 肯定の検査用: 規則が 1 つ以上見つかることを確かめてから、本体をつないで返す（見つからないまま緑にならない）。 */
function foundBody(bodies: readonly string[], what: string): string {
  expect(bodies.length, `${what} の規則が見つからない（判定が空振りする）`).toBeGreaterThanOrEqual(1);
  return bodies.join('\n');
}

describe('余白の持ち主の約束（画面の CSS）', () => {
  it('Given timer の見出しの行の操作の塊 / When 規則を読む / Then 右へ寄せない（折り返したとき見出しの下に左端そろいで置く）', () => {
    const bodies = rulesOf(read('src/styles/roster-panel.css'), '.roster-panel-head-actions');
    foundBody(bodies, '.roster-panel-head-actions');
    for (const body of bodies) {
      expect(body).not.toMatch(/justify-content:\s*(flex-end|end|right)/);
      expect(body).not.toMatch(/flex:\s*1/);
    }
  });


  it('Given timer の「ランダム」のスタイル / When CSS を読む / Then 中の並びの写し（shuffle-button-*）を持たず、セッションの操作ボタンの session-action-label・session-action-icon を使う（間は 8px の 1 か所）', () => {
    for (const file of ['src/index.css', 'src/styles/roster-panel.css', 'src/styles/session.css']) expect(read(file)).not.toMatch(/shuffle-button/);
    expect(foundBody(rulesOf(read('src/styles/session.css'), '.session-action-label'), '.session-action-label')).toMatch(/gap:\s*var\(--space-2\);/);
  });


  it('Given 共有メモの見出しの行 / When .shared-memo-lead を読む / Then 縮められ（flex: 1 1 8rem・折り返し可）、「編集」が見出しの行の右に残る（一覧 #18）', () => {
    const body = foundBody(rulesOf(read('src/styles/shared-memo.css'), '.shared-memo-lead'), '.shared-memo-lead');
    expect(body).toMatch(/flex:\s*1 1 8rem;/);
    expect(body).toMatch(/flex-wrap:\s*wrap;/);
    expect(body).toMatch(/min-width:\s*0;/);
    // 印が題の下へ折り返したとき、行の間が 0 だと題の字と詰まる（#557 の重なりと間の検査が見つけた）
    expect(body).toMatch(/gap:\s*var\(--space-1\) var\(--space-2\);/);
  });

  it('Given 画面の CSS / When 並びの写しを探す / Then 部品の修飾 --beside を画面が上書きする規則を持たない', () => {
    expect(read('src/styles/primitives.css')).not.toMatch(/section-header--beside/);
  });

  it('Given timer の見出しの行 / When .section-header の規則を読む / Then 横の間（gap・column-gap）を画面が持たない（部品 .ui-section-head の --space-3 に任せる。3px に詰まった・一覧 #33）', () => {
    const css = read('src/styles/primitives.css');
    foundBody(rulesOf(css, '.section-header'), '.section-header');
    for (const body of rulesMatching(css, /(^|[\s>+~])\.section-header$/)) expect(body).not.toMatch(/gap\s*:/);
  });
});
