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
