import { describe, it, expect } from "vitest";
import { deriveConnectionStatus } from "../src/ui/connection-status.js";

describe("deriveConnectionStatus", () => {
  it("セッション喪失が最優先で lost", () => {
    expect(deriveConnectionStatus(true, "online", false)).toBe("lost");
    expect(deriveConnectionStatus(true, "reconnecting", false)).toBe("lost");
  });
  it("online は online", () => {
    expect(deriveConnectionStatus(false, "online", false)).toBe("online");
  });
  it("reconnecting は reconnecting", () => {
    expect(deriveConnectionStatus(false, "reconnecting", false)).toBe("reconnecting");
  });

  // #209: 契約に合わない同期フレームを捨て続けると、接続は生きたまま画面だけが
  // 古い状態で固まる。**接続表示と同じ場所で、それが分かるようにする。**
  it("同期が古いままなら stale", () => {
    expect(deriveConnectionStatus(false, "online", true)).toBe("stale");
  });
  it("セッション喪失は stale より優先する（喪失のほうが強い事実）", () => {
    expect(deriveConnectionStatus(true, "online", true)).toBe("lost");
  });
  it("再接続中は stale より優先する（再接続すれば新しい snapshot で解消しうる）", () => {
    expect(deriveConnectionStatus(false, "reconnecting", true)).toBe("reconnecting");
  });
});
