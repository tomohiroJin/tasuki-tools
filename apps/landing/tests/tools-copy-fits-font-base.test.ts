/**
 * 玄関の札の文言は書体の常用の層（base）に収める（`packages/ui/README.md`）。
 *
 * 札の `pip`・`name`・`summary` は `src/tools.ts` が正本。base に無い字が 1 つあると、
 * その字が出た瞬間に拡張の層（約 210KB）を取りに行き、代替字形が一瞬見える（#406）。
 */
import { describe, expect, it } from 'vitest';
import { TOOLS } from '../src/tools';
import { baseFaces, outsideBase } from './support/font-base';

/**
 * @requirements #406 玄関の札（UI 文言は書体の base 層に収める）
 */
describe('玄関の札の文言は書体の常用の層に収まる', () => {
  it('Given fonts.css / When 常用の層の面を読む / Then 3 つの太さが見つかる', () => {
    // 0 面のまま下の判定が走ると、どの字も「外れない」ことになって緑に倒れる
    expect([...baseFaces().keys()].sort()).toEqual([
      'zkgn-400-base.woff2',
      'zkgn-500-base.woff2',
      'zkgn-700-base.woff2',
    ]);
  });

  it('Given 全ての札の pip・name・summary / When 常用の層の範囲に当てる / Then 外れる字は無い', () => {
    const texts = TOOLS.flatMap((tool) => [tool.pip, tool.name, tool.summary]);
    expect(outsideBase(texts)).toEqual([]);
    // 札を足したら文言も増える。列挙が空振りしても緑にしない
    expect(texts.length).toBe(TOOLS.length * 3);
    expect(texts.length).toBeGreaterThanOrEqual(18);
  });
});
