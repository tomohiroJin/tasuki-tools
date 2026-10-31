/**
 * 接続の告知の文は書体の常用の層（base）に収める（`packages/ui/README.md`）。
 *
 * 文言の正本は `room/connection-notice.ts` の 1 か所。アプリに写しを書かないので、ここが全部を見る。
 */
import { describe, expect, it } from 'vitest';
import { connectionNotice } from '../src/room/index.js';
import { baseFaces, outsideBase } from './support/font-base.js';

/**
 * @requirements #471（文言は書体の base 層に収める）
 */
describe('接続の告知の文は書体の常用の層に収まる', () => {
  it('Given fonts.css / When 常用の層の面を読む / Then 3 つの太さが見つかる', () => {
    expect([...baseFaces().keys()].sort()).toEqual(['zkgn-400-base.woff2', 'zkgn-500-base.woff2', 'zkgn-700-base.woff2']);
  });

  it('Given 3 つの告知の文 / When 常用の層の範囲に当てる / Then 外れる字は無く、件数は 3', () => {
    const texts = (['reconnecting', 'unreachable', 'stale'] as const).map((kind) => {
      const notice = connectionNotice(kind);
      return notice.kind === 'none' ? '' : notice.text;
    });
    expect(outsideBase(texts)).toEqual([]);
    expect(texts.filter((t) => t !== '').length).toBe(3);
  });
});
