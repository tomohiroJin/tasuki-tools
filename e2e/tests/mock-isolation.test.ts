/**
 * `vi.fn()` の呼び出しの記録は、テストの前に消える（#499）。
 *
 * 記録を消すのは vitest.config.ts の `clearMocks: true`。これが外れると、`vi.mock` の工場で作った
 * `vi.fn()` の記録が次のテストへ漏れ、ランダムな順で「前のテストの呼び出しが残って落ちる」テストが出る。
 *
 * 記録は**ファイルの読み込み時（どのテストよりも前）**に作る。clearMocks は各テストの直前に効くので、
 * テストは「自分より前に付いた記録」を見る。テスト同士の順に頼らないため、ランダムな順でも、`-t` で
 * 1 本だけ流しても、`clearMocks` を外せば必ず落ちる。
 * （apps/timer-web/test/config/mock-isolation.test.ts と同じ形。置き場が違うので写している）
 */
import { describe, it, expect, vi } from 'vitest';

const recorded = vi.fn();
const withImpl = vi.fn().mockReturnValue('工場の既定');

// テストより前の呼び出し（前のテストの呼び出しと同じ立場）
recorded('a');
withImpl();

describe('vi.fn() の記録はテストの前に消える（#499）', () => {
  it('前の呼び出しは残らない', () => {
    expect(recorded).not.toHaveBeenCalled();
  });

  it('記録だけが消え、実装（工場の既定）は残る', () => {
    expect(withImpl).not.toHaveBeenCalled();
    expect(withImpl()).toBe('工場の既定');
  });
});
