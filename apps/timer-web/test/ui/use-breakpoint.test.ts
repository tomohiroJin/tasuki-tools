import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIsWide } from "../../src/ui/use-breakpoint.js";

/** `matchMedia` の差し替え。渡した問い合わせを記録し、change を後から送れるようにする。 */
function stubMatchMedia(initial: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = [];
  const queries: string[] = [];
  const added: Array<(e: { matches: boolean }) => void> = [];
  const removeEventListener = vi.fn();
  vi.stubGlobal("matchMedia", (q: string) => {
    queries.push(q);
    return {
      matches: initial, media: q, onchange: null,
      addEventListener: (_: string, l: (e: { matches: boolean }) => void) => { listeners.push(l); added.push(l); },
      removeEventListener, addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    };
  });
  return { queries, added, removeEventListener, fire: (matches: boolean) => listeners.forEach((l) => l({ matches })) };
}

describe("useIsWide（#316 D1: CSS と同じ 64rem の問い合わせで判定する）", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("matchMedia に (width >= 64rem) を問い合わせ、その答えを返す（jsdom の innerWidth は 1024 なので、false の答えで px 判定と見分ける）", () => {
    const mm = stubMatchMedia(false);
    const { result } = renderHook(() => useIsWide());
    expect(result.current).toBe(false);
    expect(mm.queries).toContain("(width >= 64rem)");
  });

  it("change を受けると答えが変わる", () => {
    const mm = stubMatchMedia(true);
    const { result } = renderHook(() => useIsWide());
    act(() => mm.fire(false));
    expect(result.current).toBe(false);
  });

  it("アンマウントすると、登録したのと同じ関数で change の購読を外す", () => {
    const mm = stubMatchMedia(true);
    const { unmount } = renderHook(() => useIsWide());
    expect(mm.added).toHaveLength(1);
    unmount();
    expect(mm.removeEventListener).toHaveBeenCalledWith("change", mm.added[0]);
  });
});
