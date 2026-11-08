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
  it('Given poker の束の見出しの行 / When 規則を読む / Then 名前の列は flex: 1 1 auto・min-width: 0（基準幅を持たず、収まる名前は同じ行）で、折り返しは部品に任せる（@media の中も含めて）', () => {
    const css = read('src/index.css');
    const item = foundBody(rulesOf(css, '.estimate-group-head > .estimate-group-item'), '.estimate-group-head > .estimate-group-item');
    expect(item).toMatch(/flex:\s*1 1 auto;/);
    expect(item).toMatch(/min-width:\s*0;/);
    for (const b of rulesOf(css, '.estimate-group-head > .estimate-group-item')) expect(b).not.toMatch(/flex:\s*1 1 [0-9]/);
    // 折り返し（部品の宣言の写し）と、どこにも当たらない子の規則は、@media の中にも画面に持たない
    expect(rulesMatching(css, /(^|[\s>+~])\.estimate-group-head$/)).toEqual([]);
    expect(rulesMatching(css, /\.estimate-group-head > \.estimate-item--inline/)).toEqual([]);
  });

  it('Given poker の束のポイントの選択 / When 規則を読む / Then 字を切らず・縮めず右端へ寄せ、行は折り返してよく、名前の列が主（@media の中も含めて）', () => {
    const css = read('src/index.css');
    const bodies = rulesOf(css, '.estimate-log .estimate-group-points');
    const points = foundBody(bodies, '.estimate-log .estimate-group-points');
    expect(points).toMatch(/flex:\s*0 0 auto;/);
    expect(points).toMatch(/margin-inline-start:\s*auto;/);
    for (const b of bodies) {
      expect(b).not.toMatch(/overflow:\s*hidden|text-overflow|max-inline-size/);
      expect(b).not.toMatch(/font-size:\s*[0-9.]+(px|rem)/);
    }
  });

  it('Given poker の閉じた束の名前の入力 / When 規則を読む / Then 編集中もボタンと同じ場所を見えない複製が取り（流れに残り visibility: hidden）、入力は包みいっぱいに重なり、幅を 0 にしない', () => {
    const css = read('src/index.css');
    const sizerBodies = rulesOf(css, '.estimate-item--inline .estimate-item-sizer');
    expect(foundBody(sizerBodies, '見えない複製')).toMatch(/visibility:\s*hidden;/);
    for (const b of rulesMatching(css, /estimate-item-sizer/)) expect(b).not.toMatch(/display:\s*none/);
    // 入力の幅の規則は 1 か所（つないだ 2 つの規則の後ろが、絶対配置の幅 100% を上書きして 18px に潰した）
    const inputs = rulesOf(css, '.estimate-item--inline .estimate-item-input');
    const widthRules = inputs.filter((b) => /(^|[\s;{])inline-size:/.test(b));
    expect(widthRules).toHaveLength(1);
    const input = foundBody(inputs, '編集中の入力');
    expect(input).toMatch(/position:\s*absolute;/);
    expect(input).toMatch(/inset-inline:\s*0;/);
    expect(input).toMatch(/block-size:\s*var\(--tap-target\);/);
    expect(widthRules[0]).toMatch(/inline-size:\s*100%;/);
    for (const b of rulesMatching(css, /estimate-item-input/)) expect(b).not.toMatch(/(^|[\s;{])inline-size:\s*0;/);
    // 包みの規則も 1 か所
    expect(rulesOf(css, '.estimate-item--inline')).toHaveLength(1);
  });

  it('Given poker の見えない複製と名前のボタン / When 規則を読む / Then 寸法の宣言（幅・折り返し・字・余白・枠）は同じ規則に並べて持つ（ボタン側を変えても複製がずれない）', () => {
    const css = read('src/index.css');
    const sharedWith = (title: string, sizer: string): string[] => {
      const rules = collectRules(css).filter((r) => r.selectors.includes(title) && r.selectors.includes(sizer));
      return rules.map((r) => r.body);
    };
    expect(foundBody(sharedWith('.estimate-item-title', '.estimate-item-sizer'), '名前のボタンと複製の共有の規則')).toMatch(/justify-content:\s*flex-start;/);
    const inlineShared = foundBody(sharedWith('.estimate-item--inline .estimate-item-title', '.estimate-item--inline .estimate-item-sizer'), '束の中の共有の規則');
    expect(inlineShared).toMatch(/flex:\s*1 1 auto;/);
    expect(inlineShared).toMatch(/border-color:\s*transparent;/);
    // 複製だけの規則は、見えなくして触れさせないことだけ（寸法の写しを持たない）
    const own = rulesOf(css, '.estimate-item--inline .estimate-item-sizer').filter((b) => !/padding-inline/.test(b) && !/flex:/.test(b));
    for (const b of own) expect(b).not.toMatch(/\b(width|max-width|min-width|padding-inline|font-size|font-family|overflow-wrap|text-align)\s*:/);
  });

  it('Given 画面の CSS / When 並びの写しを探す / Then 参加者の見出しの行の画面の規則（room-participants-head）を持たない（部品 --beside を当てる）', () => {
    expect(rulesMatching(read('src/index.css'), /room-participants-head/)).toEqual([]);
  });

  it('Given 開いた束の「見積もり中」 / When 規則を読む / Then ポイントの選択欄と同じく右端へ寄せる', () => {
    const body = foundBody(rulesOf(read('src/index.css'), '.estimate-group-open'), '.estimate-group-open');
    expect(body).toMatch(/margin-inline-start:\s*auto;/);
  });
});
