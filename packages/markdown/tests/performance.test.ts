import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../src/index';

/**
 * 病的な入力でも解析が入力の長さにほぼ比例する時間で終わる。
 *
 * **上限は両側に同じくらいの余裕を取る。** 線形の実装と O(N²) の実装の差は入力の長さに比例して開くので、
 * 差が上限を挟んで十分に開く長さを選ぶ。`[` の羅列 20 万字は、手元で線形なら約 0.13 秒・O(N²)（変異 m106）なら
 * 約 23 秒かかる。CI は全パッケージのテストを並行して流すため手元より 10 倍以上遅く、10 万字・上限 1 秒では
 * 線形の実装でも上限を超えた（#320 PR 3 の CI・1.06 秒）。上限 7 秒は、CI の線形（推計 約 2 秒）にも
 * 手元の O(N²)（約 23 秒）にも約 3 倍の余裕がある。
 *
 * ほかの 2 つは線形なら手元で数 ms で、長さを変えていない。
 *
 * @requirements #91 spec §5.4（PR #311 の申し送り: `INLINE_RE` の O(N²)）
 */
const LIMIT_MS = 7_000;

describe('病的な入力でも解析が詰まらない', () => {
  it.each([
    ['[ の羅列', '['.repeat(200_000)],
    ['閉じない URL の羅列', 'http://'.repeat(15_000)],
    ['閉じない太字の羅列', '**a'.repeat(30_000)],
  ])(
    'Given %s / When 解析する / Then 上限の時間内に終わる',
    (_label, src) => {
      // Given
      const started = performance.now();
      // When
      parseMarkdown(src);
      // Then
      expect(performance.now() - started).toBeLessThan(LIMIT_MS);
    },
    // 打ち切りは上限より長くする（vitest の既定 5 秒で打ち切ると、上限を測る前に落ちる）
    60_000,
  );
});
