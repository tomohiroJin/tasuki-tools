import { describe, it, expect } from "vitest";
import { removalNotificationFor } from "../src/removal-notification.js";

describe("removalNotificationFor", () => {
  it("実行者と対象が同一なら自分の意思による退出として扱う", () => {
    expect(removalNotificationFor("p1", "p1")).toBe("LEFT_ROOM");
  });

  it("実行者と対象が異なるなら他者の操作による退出として扱う", () => {
    expect(removalNotificationFor("p1", "p2")).toBe("REMOVED_FROM_ROOM");
  });
});
