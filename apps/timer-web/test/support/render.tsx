/**
 * renderWith() — apps/web の汎用 render ラッパ（新設6・G2-c・T028）
 *
 * `@testing-library/react` の render をコンポーネント・props 付きで呼ぶだけの薄いラッパ。
 * コンポーネント固有のラッパ（`renderSession()` 等）は、必要になったバッチで初めて足す
 * （先回りして作らない・FR-118）。
 *
 * @requirements FR-097, FR-118, US2
 */

import type { ComponentType } from "react";
import React from "react";
import { render, type RenderResult } from "@testing-library/react";

/** 指定した Component を props 付きで render する。 */
export function renderWith<P extends object>(Component: ComponentType<P>, props?: P): RenderResult {
  return render(<Component {...(props as P)} />);
}
