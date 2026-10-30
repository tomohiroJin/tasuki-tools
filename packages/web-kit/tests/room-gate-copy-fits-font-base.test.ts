/**
 * 入室の門の文は書体の常用の層（base）に収める（`packages/ui/README.md`）。
 * 文言の正本は `room/room-gate-copy.ts` の 1 か所（アプリに写しを書かない）。
 */
import { describe, expect, it } from 'vitest';
import { ROOM_GATE_TEXT } from '../src/room/index.js';
import { baseFaces, outsideBase } from './support/font-base.js';

/**
 * @requirements #472（文言は書体の base 層に収める）
 */
describe('入室の門の文は書体の常用の層に収まる', () => {
  it('Given fonts.css / When 常用の層の面を読む / Then 3 つの太さが見つかる', () => {
    expect([...baseFaces().keys()].sort()).toEqual(['zkgn-400-base.woff2', 'zkgn-500-base.woff2', 'zkgn-700-base.woff2']);
  });

  it('Given 入室の門の文 5 つ / When 常用の層の範囲に当てる / Then 外れる字は無く、件数は 5', () => {
    const texts = Object.values(ROOM_GATE_TEXT);
    expect(texts).toHaveLength(5);
    expect(outsideBase(texts)).toEqual([]);
  });
});
