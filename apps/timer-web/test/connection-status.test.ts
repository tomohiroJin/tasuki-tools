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
  /**
   * #292 のレビュー。**まだ一度も確立していない状態を `online` へ畳まない。**
   * 畳むと、ソケットが `CONNECTING` のまま滞留している人にも「接続中」と出る。
   */
  it("connecting は connecting（online へ畳まない）", () => {
    expect(deriveConnectionStatus(false, "connecting", false)).toBe("connecting");
  });
  it("セッション喪失は connecting より優先する", () => {
    expect(deriveConnectionStatus(true, "connecting", false)).toBe("lost");
  });
  it("確立前は stale にしない（古くなる画面をまだ受け取っていない）", () => {
    expect(deriveConnectionStatus(false, "connecting", true)).toBe("connecting");
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
