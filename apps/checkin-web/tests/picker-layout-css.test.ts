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
  it('Given 札の並び / Then 行の高さを 1fr で揃え、既定は 2 列', () => {
    const list = block('.method-list');
    expect(list).toMatch(/grid-auto-rows:\s*1fr/);
    expect(list).toMatch(/grid-template-columns:\s*repeat\(2,/);
  });

  it('Given 40rem 以上 / Then 4 列になる', () => {
    const media = css.indexOf('@media (width >= 40rem) {', css.indexOf('.method-list {'));
    expect(block('.method-list', media)).toMatch(/grid-template-columns:\s*repeat\(4,/);
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
