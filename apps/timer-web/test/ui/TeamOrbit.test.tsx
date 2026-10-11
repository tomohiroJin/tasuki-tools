import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import type { SeatSkipReason } from "@tasuki/timer-core";
import { TeamOrbit } from "../../src/ui/components/TeamOrbit.js";

describe("TeamOrbit", () => {
  const mk = (id: string, name: string, skipReason: SeatSkipReason | null = null) => ({
    participantId: id, displayName: name, label: name, skipReason,
  });

  it("番が回らない席のアバターだけが data-skipped=\"true\" を持つ", () => {
    // Given（Bob だけが番が回らない席）。reason の語は SKIP_TEXT 側にあるので、型の許す値を 1 つ借りる
    const skipped: SeatSkipReason = "stood-down";
    const members = [mk("p1", "Alice"), mk("p2", "Bob", skipped), mk("p3", "Carol")];
    // When
    const { container } = render(<TeamOrbit members={members} currentIndex={0} nextIndex={2} />);
    // Then
    const avatars = container.querySelectorAll(".team-orbit-avatar");
    expect(avatars).toHaveLength(3);
    expect(avatars[0]!.getAttribute("data-skipped")).toBeNull();
    expect(avatars[1]!.getAttribute("data-skipped")).toBe("true");
    expect(avatars[2]!.getAttribute("data-skipped")).toBeNull();
  });
});
