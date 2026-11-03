/**
 * `vi.fn()` の呼び出しの記録は、テストの間で漏れない（#499）。
 *
 * `restoreMocks: true` は `vi.spyOn` の復元だけで、`vi.mock` の工場で作った `vi.fn()` の記録は消さない。
 * 記録を消すのは `clearMocks: true`（vitest.config.ts）。これが外れると、ランダムな順で
 * 「前のテストの呼び出しが残って落ちる」テストが出る（App.session-lost の「やり直す導線がある」）。
 *
 * 2 つのテストは宣言の順に走る前提（既定の順）。1 本目が記録を作り、2 本目がそれの消えていることを見る。
 * ランダムな順では 2 本目が先に走って通る（見逃す）が、変異検査は既定の順で流れるので、設定を外せば落ちる。
 */
import { describe, it, expect, vi } from "vitest";

const recorded = vi.fn();
const withImpl = vi.fn().mockReturnValue("工場の既定");

describe("vi.fn() の記録はテストごとに消える（#499）", () => {
  it("1 本目: 記録を作る", () => {
    recorded("a");
    withImpl();
    expect(recorded).toHaveBeenCalledTimes(1);
  });

  it("2 本目: 前のテストの呼び出しは残らない", () => {
    expect(recorded).not.toHaveBeenCalled();
  });

  it("3 本目: 記録だけが消え、実装（工場の既定）は残る", () => {
    expect(withImpl).toHaveBeenCalledTimes(0);
    expect(withImpl()).toBe("工場の既定");
  });
});
