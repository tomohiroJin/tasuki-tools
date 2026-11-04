/**
 * `vi.fn()` の呼び出しの記録は、テストの前に消える（#499）。
 *
 * `restoreMocks: true` は `vi.spyOn` の復元だけで、`vi.mock` の工場で作った `vi.fn()` の記録は消さない。
 * 記録を消すのは `clearMocks: true`（vitest.config.ts）。これが外れると、ランダムな順で
 * 「前のテストの呼び出しが残って落ちる」テストが出る（App.session-lost の「やり直す導線がある」）。
 *
 * 記録は**ファイルの読み込み時（どのテストよりも前）**に作る。clearMocks は各テストの直前に効くので、
 * テストは「自分より前に付いた記録」を見る。テスト同士の順に頼らないため、ランダムな順でも、`-t` で
 * 1 本だけ流しても、`clearMocks` を外せば必ず落ちる。
 */
import { describe, it, expect, vi } from "vitest";

const recorded = vi.fn();
const withImpl = vi.fn().mockReturnValue("工場の既定");

// テストより前の呼び出し（前のテストの呼び出しと同じ立場）
recorded("a");
withImpl();

describe("vi.fn() の記録はテストの前に消える（#499）", () => {
  it("前の呼び出しは残らない", () => {
    expect(recorded).not.toHaveBeenCalled();
  });

  it("記録だけが消え、実装（工場の既定）は残る", () => {
    expect(withImpl).not.toHaveBeenCalled();
    expect(withImpl()).toBe("工場の既定");
  });
});
