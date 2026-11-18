/**
 * やり方の選択の札の並び（#468 D1・D2）を CSS の宣言で守る。jsdom は配置を計算しないので、実測は E2E（checkin.spec.ts）が持ち、
 * ここは「揃える規則が消えていないか」だけを見る。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/table.css'), 'utf8');

/** 指定のセレクタのブロック（最初の一致）の中身 */
function block(selector: string, from = 0): string {
  const start = css.indexOf(`${selector} {`, from);
  expect(start, `${selector} が見つかる`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

describe('やり方の選択の札の並び', () => {
  // subgrid を読めるブラウザの形（#635 の B）と、読めないブラウザの形（小見出しごとの格子）を、@supports の中で見る
  const SUB = css.indexOf('@supports (grid-template-rows: subgrid) {');
  const NO_SUB = css.indexOf('@supports not (grid-template-rows: subgrid) {');

  it('Given subgrid あり・外側の格子 / Then 既定は 2 列で、行の並びは画面が渡す 2 列用の変数（札の段は 1fr）', () => {
    expect(SUB, '@supports (subgrid) がある').toBeGreaterThanOrEqual(0);
    const groups = block('.method-groups', SUB);
    expect(groups).toMatch(/grid-template-columns:\s*repeat\(2,/);
    expect(groups).toMatch(/grid-template-rows:\s*var\(--rows-narrow\)/);
  });

  it('Given subgrid あり・40rem 以上 / Then 4 列になり、行の並びと小見出しの行のまたぎは 4 列用の変数', () => {
    const media = css.indexOf('@media (width >= 40rem) {', SUB);
    const groups = block('.method-groups', media);
    expect(groups).toMatch(/grid-template-columns:\s*repeat\(4,/);
    expect(groups).toMatch(/grid-template-rows:\s*var\(--rows-wide\)/);
    expect(block('.method-group', media)).toMatch(/grid-row:\s*span var\(--span-wide\)/);
  });

  it('Given subgrid あり・小見出しと札の並び / Then 列と行を subgrid で外側の格子から受け継ぐ（小見出しをまたいで札の高さが揃う）', () => {
    expect(block('.method-group', SUB)).toMatch(/grid-row:\s*span var\(--span-narrow\)/);
    for (const sel of ['.method-group', '.method-list']) {
      expect(block(sel, SUB), sel).toMatch(/grid-template-columns:\s*subgrid/);
      expect(block(sel, SUB), sel).toMatch(/grid-template-rows:\s*subgrid/);
    }
    expect(block('.method-list', SUB)).toMatch(/grid-row:\s*2 \/ -1/);
  });

  it('Given subgrid あり・小見出しの行 / Then 全ての列にまたがる（1 列目だけだと狭い幅で題が折れる・#635 の 2 回目のレビュー 4）', () => {
    expect(block('.method-group-head', SUB)).toMatch(/grid-column:\s*1 \/ -1/);
  });

  it('Given subgrid なし / Then 小見出しごとの格子に戻る（既定 2 列・40rem 以上 4 列・行は 1fr で並びの中で揃う）', () => {
    expect(NO_SUB, '@supports not (subgrid) がある').toBeGreaterThanOrEqual(0);
    expect(NO_SUB, '読めない側の宣言は読める側より前（読める側が後で上書きしない形にしておく）').toBeLessThan(SUB);
    const list = block('.method-list', NO_SUB);
    expect(list).toMatch(/grid-template-columns:\s*repeat\(2,/);
    expect(list).toMatch(/grid-auto-rows:\s*1fr/);
    expect(block('.method-list', css.indexOf('@media (width >= 40rem) {', NO_SUB))).toMatch(/grid-template-columns:\s*repeat\(4,/);
    expect(block('.method-group', NO_SUB)).toMatch(/flex-direction:\s*column/);
  });

  it('Given 小見出しの行 / Then 入りきらなければランダムを次の行へ回す（題を 1 字ずつ折らない）', () => {
    expect(block('.method-group-head', SUB + 1 + css.slice(SUB).indexOf('\n}\n'))).toMatch(/flex-wrap:\s*wrap/);
  });

  it('Given 64rem 以上 / Then 札の中身（扇）を大きくする', () => {
    const media = css.indexOf('@media (width >= 64rem) {', css.indexOf('.method-list {'));
    expect(block('.method-list', media)).toMatch(/--fan-w:\s*3\.4rem/);
  });

  it('Given 札 / Then 縦に積み、タップ領域は --tap-target 以上', () => {
    const opt = block('.method-option');
    expect(opt).toMatch(/flex-direction:\s*column/);
    expect(opt).toMatch(/min-block-size:\s*var\(--tap-target\)/);
  });

  it('Given 見出しの行 / Then 戻るの右寄せは checkin の見出しの行の規則で持つ（部品は変えない）', () => {
    const back = block('.method-picker-head .ui-page-header-back');
    expect(back).toMatch(/margin-inline-start:\s*auto/);
    expect(back).toMatch(/white-space:\s*nowrap/);
  });
});
