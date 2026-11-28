/**
 * 呼びかけの知らせの文言（#677）は書体の常用の層（base）に収める（`packages/ui/README.md`）。
 * 道具の名前は表の 1 か所（`room/tool-destinations.ts`）から引く。
 */
import { describe, expect, it } from 'vitest';
import { TOOL_DESTINATIONS } from '../src/room/index.js';
import { outsideBase } from '@tasuki/test-css/font-base';

describe('呼びかけの知らせの文言は書体の常用の層に収まる', () => {
  it('Given 知らせの固定の字と 7 道具の名前 / When 常用の層の範囲に当てる / Then 外れる字は無い', () => {
    const texts = ['さんが', 'に呼んでいます', '移る', '閉じる', ...Object.values(TOOL_DESTINATIONS).map((d) => d.name)];
    expect(outsideBase(texts)).toEqual([]);
  });
});
