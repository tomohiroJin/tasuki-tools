/**
 * 画面の CSS の契約（#553・ADR 0035）。部品の CSS の契約は `packages/ui/tests/spacing-owner.test.mjs`、配置の結果は E2E（`e2e/specs/spacing.spec.ts`）が見る。
 * 部品のテストがアプリを読むと依存の向きが逆（turbo のキャッシュの鍵にも入らない）なので、アプリ自身のテストが自分の CSS を読む。
 */
import { describe, expect, it } from 'vitest';

import { foundBody, readFromCwd as read, rulesMatching, rulesOf } from '@tasuki/test-css/css-rules';

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

  it('Given agenda の進行中の延長の群 / When 規則を読む / Then 見出しを左に並べる 4 列は、帯の幅（容器クエリ・em）が 20em 以上のときだけ。画面の幅（@media）で決めない（文字 200% で「+1 分」が隣と重なった・#557）', () => {
    const css = read('src/run.css');
    expect(foundBody(rulesOf(css, '.run-controls'), '.run-controls')).toMatch(/container:\s*run-controls \/ inline-size;/);
    const four = rulesOf(css, '.run-extend').filter((b) => /grid-template-columns:\s*auto /.test(b));
    expect(foundBody(four, '.run-extend（見出しを左に置く 4 列）')).toMatch(/grid-template-columns:\s*auto repeat\(3, minmax\(0, 1fr\)\);/);
    // 4 列の規則は @container の中にある。@media の中や外にあると、画面の幅で決まって文字 200% で崩れる
    expect(css).toMatch(/@container run-controls \(min-width: 20em\) \{\s*\.run-extend \{\s*grid-template-columns:\s*auto /);
  });
});
