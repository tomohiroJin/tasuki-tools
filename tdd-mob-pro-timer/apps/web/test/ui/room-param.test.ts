/**
 * URL から room クエリパラメータを除去する純粋関数のテスト
 * @requirements FR-127, US2-2
 */

import { describe, it, expect } from "vitest";
import { stripRoomParam } from "../../src/ui/room-param.js";

describe("stripRoomParam", () => {
  it("room パラメータのみの URL からはパスだけが残る", () => {
    expect(stripRoomParam("http://x/?room=ABC")).toBe("http://x/");
  });

  it("他のパラメータと併存するとき、room だけが消え他は残る", () => {
    expect(stripRoomParam("http://x/?room=ABC&foo=1")).toBe("http://x/?foo=1");
  });

  it("room パラメータが無いとき、URL は変化しない", () => {
    expect(stripRoomParam("http://x/")).toBe("http://x/");
  });

  it("ハッシュ付きの URL では、room が無くてもハッシュが保たれる", () => {
    expect(stripRoomParam("http://x/?foo=1#hash")).toBe("http://x/?foo=1#hash");
  });

  it("room パラメータが複数あるとき、すべて消える", () => {
    expect(stripRoomParam("http://x/?room=A&room=B")).toBe("http://x/");
  });
});
