/**
 * 見出しの部品の文言は書体の常用の層（base）に収める（`packages/ui/README.md`）。
 *
 * 文言の正本は `room-header-copy.ts` の 1 か所。アプリに写しを書かないので、ここが全部を見る。
 */
import { describe, expect, it } from 'vitest';
import { ROOM_HEADER_TEXT } from '../src/index.js';
import { baseFaces, outsideBase } from './support/font-base.js';

/**
 * @requirements #447 設計 §3（文言は書体の base 層に収める・D6）
 */
describe('ルーム画面の共通の見出しの文言は書体の常用の層に収まる', () => {
  it('Given fonts.css / When 常用の層の面を読む / Then 3 つの太さが見つかる', () => {
    // Given / When
    const faces = [...baseFaces().keys()].sort();

    // Then: 0 面のまま下の判定が走ると、どの字も「外れない」ことになって緑に倒れる
    expect(faces).toEqual(['zkgn-400-base.woff2', 'zkgn-500-base.woff2', 'zkgn-700-base.woff2']);
  });

  it('Given 見出しの部品の文言 / When 常用の層の範囲に当てる / Then 外れる字は無く、件数は 11', () => {
    // Given
    const texts = Object.values(ROOM_HEADER_TEXT);

    // When
    const failures = outsideBase(texts);

    // Then（件数も固定する。import が空振りしても緑にしない）
    expect(failures).toEqual([]);
    expect(texts.length).toBe(11);
  });
});
