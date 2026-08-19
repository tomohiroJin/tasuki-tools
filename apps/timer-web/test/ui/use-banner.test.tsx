/**
 * useBanner（#167 E4）。
 *
 * バナーの文言と自動消去タイマーを 1 箇所へまとめたもの。App.tsx では
 * 6 箇所が bannerTimerRef の解除と張り直しを手書きしており、退出バナーだけが
 * 「自動消去しない」という例外を持っていた（Issue #32 の狙い＝退出が分からない
 * 問題の再発防止）。その例外をここで型として表す。
 *
 * @requirements #167（#72 E4）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBanner } from "../../src/ui/use-banner.js";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useBanner", () => {
  it("初期状態は null", () => {
    const { result } = renderHook(() => useBanner());
    expect(result.current.banner).toBeNull();
  });

  it("show した文言と種別を保持する", () => {
    const { result } = renderHook(() => useBanner());
    act(() => result.current.show("こんにちは", "warn"));
    expect(result.current.banner).toEqual({ text: "こんにちは", kind: "warn" });
  });

  it("既定では 4 秒で自動消去する", () => {
    const { result } = renderHook(() => useBanner());
    act(() => result.current.show("一時エラー", "warn"));
    act(() => void vi.advanceTimersByTime(3999));
    expect(result.current.banner).not.toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current.banner).toBeNull();
  });

  it("autoDismiss: false なら時間が経っても消えない", () => {
    const { result } = renderHook(() => useBanner());
    act(() => result.current.show("ルームから退出しました", "warn", { autoDismiss: false }));
    act(() => void vi.advanceTimersByTime(60_000));
    expect(result.current.banner).toEqual({ text: "ルームから退出しました", kind: "warn" });
  });

  it("消えないバナーを出したら、直前の自動消去タイマーは解除される", () => {
    // 現行 App.tsx の handleError（leave-room）が明示的に解除している性質。
    // これが無いと、直前の一時エラーの 4 秒タイマーが退出バナーを消してしまう。
    const { result } = renderHook(() => useBanner());
    act(() => result.current.show("一時エラー", "warn"));
    act(() => void vi.advanceTimersByTime(2000));
    act(() => result.current.show("ルームから退出しました", "warn", { autoDismiss: false }));
    act(() => void vi.advanceTimersByTime(10_000));
    expect(result.current.banner?.text).toBe("ルームから退出しました");
  });

  it("clear で即座に消える", () => {
    const { result } = renderHook(() => useBanner());
    act(() => result.current.show("接続が切れました", "warn"));
    act(() => result.current.clear());
    expect(result.current.banner).toBeNull();
  });

  it("unmount でタイマーを掃除する（setState-on-unmounted を出さない）", () => {
    const { result, unmount } = renderHook(() => useBanner());
    act(() => result.current.show("一時エラー", "warn"));
    unmount();
    expect(() => vi.advanceTimersByTime(10_000)).not.toThrow();
  });
});
