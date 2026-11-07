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
  it('Given poker の束の見出しの行 / When 規則を読む / Then 名前の列は flex: 1 1 auto・min-width: 0（基準幅を持たず、収まる名前は同じ行）で、折り返しは部品に任せる', () => {
    const css = read('src/index.css');
    expect(css).toMatch(/\.estimate-group-head > \.estimate-group-item \{[^}]*flex:\s*1 1 auto;[^}]*min-width:\s*0;/);
    expect(css).not.toMatch(/estimate-group-head > \.estimate-group-item \{[^}]*flex:\s*1 1 [0-9]/);
    // 折り返し（部品の宣言の写し）と、どこにも当たらない子の規則は画面に持たない
    expect(ruleBody(css, '.estimate-group-head')).toBe(null);
    expect(css).not.toMatch(/\.estimate-group-head > \.estimate-item--inline/);
  });
  
  
  it('Given poker の束のポイントの選択 / When 規則を読む / Then 字を切らず・縮めず右端へ寄せ、行は折り返してよく、名前の列が主', () => {
    const css = read('src/index.css');
    const points = ruleBody(css, '.estimate-log .estimate-group-points') ?? '';
    expect(points).toMatch(/flex:\s*0 0 auto;/);
    expect(points).toMatch(/margin-inline-start:\s*auto;/);
    expect(points).not.toMatch(/overflow:\s*hidden|text-overflow|max-inline-size/);
    expect(points).not.toMatch(/font-size:\s*[0-9.]+(px|rem)/);
  });
  
  
  it('Given poker の閉じた束の名前の入力 / When 規則を読む / Then 編集中もボタンと同じ場所を見えない複製が取り（流れに残り visibility: hidden）、入力は包みいっぱいに重なり、幅を 0 にしない', () => {
    const css = read('src/index.css');
    const sizer = css.match(/\n\.estimate-item--inline \.estimate-item-sizer \{[^}]*\}/)?.[0] ?? '';
    expect(sizer).toMatch(/visibility:\s*hidden;/);
    expect(sizer).not.toMatch(/display:\s*none/);
    // 入力の規則は 1 か所（つないだ 2 つの規則の後ろが、絶対配置の幅 100% を上書きして 18px に潰した）
    const inputs = [...css.matchAll(/(?<![,])\n\.estimate-item--inline \.estimate-item-input \{[^}]*\}/g)].map((m) => m[0]);
    expect(inputs.length).toBe(1);
    expect(inputs[0]).toMatch(/position:\s*absolute;/);
    expect(inputs[0]).toMatch(/inset-inline:\s*0;/);
    expect(inputs[0]).toMatch(/block-size:\s*var\(--tap-target\);/);
    expect(inputs[0]).toMatch(/inline-size:\s*100%;/);
    expect(css).not.toMatch(/\.estimate-item--inline \.estimate-item-input \{[^}]*[\s;{]inline-size:\s*0;/);
    // 包みの規則も 1 か所
    expect([...css.matchAll(/\n\.estimate-item--inline \{/g)]).toHaveLength(1);
  });

  it('Given 画面の CSS / When 並びの写しを探す / Then 参加者の見出しの行の画面の規則（room-participants-head）を持たない（部品 --beside を当てる）', () => {
    expect(read('src/index.css')).not.toMatch(/room-participants-head/);
  });

  it('Given 開いた束の「見積もり中」 / When 規則を読む / Then ポイントの選択欄と同じく右端へ寄せる', () => {
    const body = ruleBody(read('src/index.css'), '.estimate-group-open') ?? '';
    expect(body).toMatch(/margin-inline-start:\s*auto;/);
  });
});
