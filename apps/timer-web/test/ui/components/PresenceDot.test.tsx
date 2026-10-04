// apps/web/test/ui/components/PresenceDot.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { PresenceDot } from "../../../src/ui/components/PresenceDot.js";
import type { Presence } from "../../../src/ui/presence.js";

describe("PresenceDot", () => {
  /**
   * @requirements FR-176, FR-178, US1
   */
  describe("在席状態ごとの表示", () => {
    const cases: Presence[] = ["online", "idle", "offline"];

    cases.forEach((presence) => {
      it(`presence が ${presence} のとき、data-presence に ${presence} を持つ点が描画される`, () => {
        // Given
        const { container } = render(<PresenceDot presence={presence} />);
        // When
        const dot = container.querySelector("span");
        // Then
        expect(dot?.getAttribute("data-presence")).toBe(presence);
        expect(dot?.classList.contains("presence-dot")).toBe(true);
      });
    });

    it("在席ドットは装飾要素として aria-hidden になっている", () => {
      // Given
      const { container } = render(<PresenceDot presence="online" />);
      // When
      const dot = container.querySelector("span");
      // Then
      expect(dot?.getAttribute("aria-hidden")).toBe("true");
    });
  });
});
