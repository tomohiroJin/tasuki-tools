/**
 * 時刻整形ユーティリティのテスト。
 * 特に残り時間は ceil（最後の1秒は 00:01、真の 0 のみ 00:00）を恒久的に保証する。
 */

import { describe, it, expect } from "vitest";
import { formatRemaining, formatElapsed } from "../../src/ui/format-time.js";

describe("formatRemaining（残り時間・ceil）", () => {
  it("満了直前の端数は切り上げる（00:01 据え置きで 00:00 ラグを出さない）", () => {
    expect(formatRemaining(0.9)).toBe("00:01");
    expect(formatRemaining(0.01)).toBe("00:01");
  });

  it("ちょうど 0 と負値は 00:00", () => {
    expect(formatRemaining(0)).toBe("00:00");
    expect(formatRemaining(-5)).toBe("00:00");
  });

  it("分と秒を mm:ss でゼロ埋めする", () => {
    expect(formatRemaining(300)).toBe("05:00");
    expect(formatRemaining(59)).toBe("00:59");
    expect(formatRemaining(61)).toBe("01:01");
  });
});

describe("formatElapsed（経過・floor）", () => {
  it("ミリ秒を秒に切り捨てて mm:ss にする", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(1999)).toBe("00:01");
    expect(formatElapsed(65_000)).toBe("01:05");
  });
});
