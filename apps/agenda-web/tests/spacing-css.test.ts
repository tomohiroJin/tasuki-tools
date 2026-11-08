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
  it('Given agenda の保存した流れ / When 画面の CSS と JSX を読む / Then 縦の並びの写し（display: grid の gap）と、どの CSS にも当たらない builder-saved クラスを持たない', () => {
    const css = read('src/builder.css');
    expect(rulesOf(css, '.builder-saved')).toEqual([]);
    expect(rulesMatching(css, /(^|[\s>+~])\.builder-saved$/)).toEqual([]);
    // 一覧は縦の並びの写し（display: grid・gap）を、@media の中にも持たない。一覧の規則は 1 つ以上見つかる（空振りしない）
    const listBodies = rulesOf(css, '.builder-saved-list');
    foundBody(listBodies, '.builder-saved-list');
    for (const b of listBodies) expect(b).not.toMatch(/display:|gap:/);
    expect(read('src/components/SavedScenarioList.tsx')).not.toMatch(/className="[^"]*\bbuilder-saved\b(?!-)[^"]*"/);
  });
});
