import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLastOneGuard } from "../../src/ui/use-last-one-guard.js";

function unloadPrevented(): boolean {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}

/** @requirements #402 */
describe("useLastOneGuard", () => {
  it("Given active=false / When beforeunload / Then 確認を出さない", () => {
    renderHook(() => useLastOneGuard(false));
    expect(unloadPrevented()).toBe(false);
  });

  it("Given active=true / When beforeunload / Then 確認を出す", () => {
    renderHook(() => useLastOneGuard(true));
    expect(unloadPrevented()).toBe(true);
  });

  it("Given active=true から false に変わる / When beforeunload / Then 解除されて確認は出ない", () => {
    // Given（前提は下の呼び出しの引数に込めている）
    // When
    const { rerender } = renderHook(({ a }) => useLastOneGuard(a), { initialProps: { a: true } });
    // Then
    expect(unloadPrevented()).toBe(true);
    rerender({ a: false });
    expect(unloadPrevented()).toBe(false);
  });

  it("Given active=true / When アンマウント / Then 解除される", () => {
    // Given
    const { unmount } = renderHook(() => useLastOneGuard(true));
    // When
    unmount();
    // Then
    expect(unloadPrevented()).toBe(false);
  });
});
