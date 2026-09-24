import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../src/index';

/**
 * 病的な入力でも解析が入力の長さにほぼ比例する時間で終わる。
 *
 * **閾値は緩く取ってある。** 線形なら 10 万字でも数十 ms で、O(N²) なら 1 万倍以上かかる。
 * 1 秒は CI の揺れを吸収しつつ、O(N²) を確実に落とす値である。
 *
 * @requirements #91 spec §5.4（PR #311 の申し送り: `INLINE_RE` の O(N²)）
 */
describe('病的な入力でも解析が詰まらない', () => {
  it.each([
    ['[ の羅列', '['.repeat(100_000)],
    ['閉じない URL の羅列', 'http://'.repeat(15_000)],
    ['閉じない太字の羅列', '**a'.repeat(30_000)],
  ])('Given %s / When 解析する / Then 1 秒以内に終わる', (_label, src) => {
    // Given
    const started = performance.now();
    // When
    parseMarkdown(src);
    // Then
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
