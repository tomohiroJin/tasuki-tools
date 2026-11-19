/**
 * 画面の CSS の契約（#553・ADR 0035）。部品の CSS の契約は `packages/ui/tests/spacing-owner.test.mjs`、配置の結果は E2E（`e2e/specs/spacing.spec.ts`）が見る。
 * 部品のテストがアプリを読むと依存の向きが逆（turbo のキャッシュの鍵にも入らない）なので、アプリ自身のテストが自分の CSS を読む。
 */
import { describe, expect, it } from 'vitest';

import { foundBody, collectRules, readFromCwd as read, rulesMatching, rulesOf } from '@tasuki/test-css/css-rules';

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
    expect(input).toMatch(/inset-inline-start:\s*0;/);
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
    // 共有の規則かどうかは、本文ではなくセレクタで決める（タイトル側のセレクタを含む規則が共有の規則）
    const own = collectRules(css).filter((r) => r.selectors.some((x) => x.includes('estimate-item-sizer')) && !r.selectors.some((x) => x.includes('estimate-item-title') || x.includes('estimate-item-input'))).map((r) => r.body);
    foundBody(own, '複製だけの規則');
    for (const b of own) expect(b).not.toMatch(/\b(width|max-width|min-width|padding-inline|font-size|font-family|overflow-wrap|text-align)\s*:/);
  });

  it('Given 画面の CSS / When 並びの写しを探す / Then 参加者の見出しの行の画面の規則（room-participants-head）を持たない（部品 --beside を当てる）', () => {
    expect(rulesMatching(read('src/index.css'), /room-participants-head/)).toEqual([]);
  });

  it('Given 開いた束の「見積もり中」 / When 規則を読む / Then ポイントの選択欄と同じく右端へ寄せる', () => {
    const body = foundBody(rulesOf(read('src/index.css'), '.estimate-group-open'), '.estimate-group-open');
    expect(body).toMatch(/margin-inline-start:\s*auto;/);
  });

  it('Given 記録のコピーの結果 / When 規則を読む / Then コピーの操作を基準に重ねる', () => {
    const css = read('src/index.css');
    expect(foundBody(rulesOf(css, '.estimate-log-copy'), 'コピーの操作')).toMatch(/position:\s*relative;/);
    expect(foundBody(rulesOf(css, '.estimate-log-copy-status'), 'コピーの結果')).toMatch(/position:\s*absolute;/);
  });
});
