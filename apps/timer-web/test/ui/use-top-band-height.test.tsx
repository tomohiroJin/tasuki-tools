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

function Band({ on = true }: { on?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useTopBandHeight(ref);
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
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
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
    // Then
    expect(read()).toBe("55px");
  });

  it("画面の幅が変わって位置だけ動いても追従する", () => {
    // Given
    render(<Band />);
    // When
    bottom = 70;
    window.dispatchEvent(new Event("resize"));
    // Then
    expect(read()).toBe("70px");
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
