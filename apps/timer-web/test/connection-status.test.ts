import { describe, it, expect } from "vitest";
import { deriveConnectionStatus } from "../src/ui/connection-status.js";

describe("deriveConnectionStatus", () => {
  it("セッション喪失が最優先で lost", () => {
    expect(deriveConnectionStatus(true, "online")).toBe("lost");
    expect(deriveConnectionStatus(true, "reconnecting")).toBe("lost");
  });
  it("online は online", () => { expect(deriveConnectionStatus(false, "online")).toBe("online"); });
  it("reconnecting は reconnecting", () => { expect(deriveConnectionStatus(false, "reconnecting")).toBe("reconnecting"); });
});
