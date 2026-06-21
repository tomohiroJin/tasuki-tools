import { describe, it, expect } from "vitest";
import { shouldAutoJoinRotation } from "../../src/ui/join-driver-intent.js";

describe("shouldAutoJoinRotation", () => {
  it("driver 宣言があり、自分がまだ rotation 外なら true", () => {
    expect(shouldAutoJoinRotation({ pendingName: "Bob", rotation: ["Alice"] })).toBe(true);
  });
  it("既に rotation 内なら false（二重 add しない）", () => {
    expect(shouldAutoJoinRotation({ pendingName: "Bob", rotation: ["Alice", "Bob"] })).toBe(false);
  });
  it("pendingName が無ければ false", () => {
    expect(shouldAutoJoinRotation({ pendingName: null, rotation: ["Alice"] })).toBe(false);
  });
});
