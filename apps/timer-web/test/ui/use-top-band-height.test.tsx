/**
 * 上端の帯の下端を `--top-band-height` に書くフック（#427・設計 B）
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import React, { useRef } from "react";
import { useTopBandHeight } from "../../src/ui/use-top-band-height.js";

const VAR = "--top-band-height";
const read = () => document.documentElement.style.getPropertyValue(VAR);

type Cb = (entries: unknown[]) => void;
interface Fake {
  cb: Cb;
  observed: Element[];
  disconnected: boolean;
}
let observers: Fake[] = [];
let bottom = 0;
/** requestAnimationFrame の代わり。保留中のコールバックを id で持ち、flushFrame で 1 フレーム進める。 */
let frames = new Map<number, () => void>();
let nextFrameId = 1;

function flushFrame() {
  const pending = [...frames.values()];
  frames = new Map();
  for (const cb of pending) cb();
}

class FakeResizeObserver {
  private readonly state: Fake;
  constructor(cb: Cb) {
    this.state = { cb, observed: [], disconnected: false };
    observers.push(this.state);
  }
  observe(el: Element): void {
    this.state.observed.push(el);
  }
  unobserve(): void {}
  disconnect(): void {
    this.state.disconnected = true;
  }
}

function Band({ on = true, enabled = true }: { on?: boolean; enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useTopBandHeight(ref, enabled);
  return <div ref={on ? ref : undefined} data-testid="band" />;
}

/** 生きている（disconnect されていない）観測者だけに通知する。 */
function fire() {
  for (const o of observers) if (!o.disconnected) o.cb([]);
}

describe("useTopBandHeight", () => {
  beforeEach(() => {
    observers = [];
    bottom = 95;
    frames = new Map();
    nextFrameId = 1;
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
      const id = nextFrameId++;
      frames.set(id, cb);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      frames.delete(id);
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => ({ height: 0, top: 0, bottom, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
    );
    document.documentElement.style.removeProperty(VAR);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("帯の下端が変わると --top-band-height が変わる", () => {
    // Given
    render(<Band />);
    expect(read()).toBe("95px");
    // When
    bottom = 140;
    fire();
    // Then
    expect(read()).toBe("140px");
  });

  it("帯の要素を ResizeObserver に観測させる", () => {
    // When
    const { getByTestId } = render(<Band />);
    // Then
    expect(observers).toHaveLength(1);
    expect(observers[0]?.observed).toEqual([getByTestId("band")]);
  });

  it("スクロールで帯の位置が変わると追従する（帯は sticky で、先頭では下がった位置にある）", () => {
    // Given
    render(<Band />);
    // When
    bottom = 55;
    window.dispatchEvent(new Event("scroll"));
    flushFrame();
    // Then
    expect(read()).toBe("55px");
  });

  it("画面の幅が変わって位置だけ動いても追従する", () => {
    // Given
    render(<Band />);
    // When
    bottom = 70;
    window.dispatchEvent(new Event("resize"));
    flushFrame();
    // Then
    expect(read()).toBe("70px");
  });

  it("1 フレームに何度スクロールしても測るのは 1 回（フレーム単位でまとめる）", () => {
    // Given
    render(<Band />);
    const spy = vi.mocked(HTMLElement.prototype.getBoundingClientRect);
    spy.mockClear();
    // When
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    // Then
    expect(spy).not.toHaveBeenCalled();
    flushFrame();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("スクロール直後にアンマウントすると、保留中のフレームを取り消して変数を書き戻さない", () => {
    // Given
    const { unmount } = render(<Band />);
    bottom = 300;
    window.dispatchEvent(new Event("scroll"));
    expect(frames.size).toBe(1);
    // When
    unmount();
    flushFrame();
    // Then
    expect(frames.size).toBe(0);
    expect(read()).toBe("");
  });

  it("enabled が false の間は何も書かず、観測もしない", () => {
    // When
    render(<Band enabled={false} />);
    window.dispatchEvent(new Event("scroll"));
    flushFrame();
    // Then
    expect(read()).toBe("");
    expect(observers).toHaveLength(0);
  });

  it("enabled が true から false になると変数を消し、観測をやめる", () => {
    // Given
    const { rerender } = render(<Band enabled />);
    expect(read()).toBe("95px");
    // When
    rerender(<Band enabled={false} />);
    // Then
    expect(read()).toBe("");
    expect(observers[0]?.disconnected).toBe(true);
  });

  it("アンマウントで変数を消し、観測をやめ、以後のスクロール・リサイズで書き戻さない", () => {
    // Given
    const { unmount } = render(<Band />);
    expect(read()).toBe("95px");
    // When
    unmount();
    bottom = 200;
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    flushFrame();
    // Then
    expect(read()).toBe("");
    expect(observers[0]?.disconnected).toBe(true);
  });

  it("要素が無い（休憩の外で ref を付けない）間は変数を持たない", () => {
    // When
    render(<Band on={false} />);
    window.dispatchEvent(new Event("scroll"));
    // Then
    expect(read()).toBe("");
    expect(observers).toHaveLength(0);
  });
});
