// apps/web/test/ui/components/PresenceDot.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { PresenceDot } from "../../../src/ui/components/PresenceDot.js";
import { presenceDotClass, type Presence } from "../../../src/ui/presence.js";

describe("PresenceDot", () => {
  /**
   * @requirements FR-176, FR-178, US1
   */
  describe("在席状態ごとの表示", () => {
    const cases: Presence[] = ["online", "idle", "offline"];

    cases.forEach((presence) => {
      it(`presence が ${presence} のとき、状態に対応するクラスを持つドットが描画される`, () => {
        // Given / When
        const { container } = render(<PresenceDot presence={presence} />);
        // Then
        const dot = container.querySelector("span");
        expect(dot).not.toBeNull();
        expect(dot?.className).toContain(presenceDotClass(presence));
      });
    });

    it("在席ドットは装飾要素として aria-hidden になっている", () => {
      const { container } = render(<PresenceDot presence="online" />);
      const dot = container.querySelector("span");
      expect(dot?.getAttribute("aria-hidden")).toBe("true");
    });
  });
});
