/**
 * 上端の帯の高さを `--top-band-height` に書くフック（#427・設計 B）
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import React, { useRef } from "react";
import { useTopBandHeight } from "../../src/ui/use-top-band-height.js";

const VAR = "--top-band-height";
const read = () => document.documentElement.style.getPropertyValue(VAR);

type Cb = (entries: unknown[]) => void;
let callbacks: Cb[] = [];
let height = 0;

class FakeResizeObserver {
  constructor(cb: Cb) {
    callbacks.push(cb);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function Band({ on = true }: { on?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useTopBandHeight(ref);
  return <div ref={on ? ref : undefined} data-testid="band" />;
}

function fire() {
  for (const cb of callbacks) cb([]);
}

describe("useTopBandHeight", () => {
  beforeEach(() => {
    callbacks = [];
    height = 95;
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => ({ height, top: 0, bottom: height, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
    );
    document.documentElement.style.removeProperty(VAR);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("帯の高さが変わると --top-band-height が変わる", () => {
    // Given
    render(<Band />);
    expect(read()).toBe("95px");
    // When
    height = 140;
    fire();
    // Then
    expect(read()).toBe("140px");
  });

  it("スクロールで帯の位置が変わると追従する（帯は sticky で、先頭では下がった位置にある）", () => {
    // Given
    render(<Band />);
    expect(read()).toBe("95px");
    // When
    height = 95 - 40;
    window.dispatchEvent(new Event("scroll"));
    // Then
    expect(read()).toBe("55px");
  });

  it("アンマウントで変数を消す", () => {
    // Given
    const { unmount } = render(<Band />);
    expect(read()).toBe("95px");
    // When
    unmount();
    // Then
    expect(read()).toBe("");
  });

  it("要素が無い（休憩の外で ref を付けない）間は変数を持たない", () => {
    // When
    render(<Band on={false} />);
    // Then
    expect(read()).toBe("");
  });
});
