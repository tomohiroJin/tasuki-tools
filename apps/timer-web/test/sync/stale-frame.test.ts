/**
 * 捨てたフレームが「画面を古くするもの」かどうかの判定（#209）。
 *
 * @requirements #209
 */
import { describe, it, expect } from "vitest";
import { indicatesStaleRoom } from "../../src/sync/stale-frame.js";

describe("indicatesStaleRoom", () => {
  it("ルームの中身で落ちたものは画面を古くする", () => {
    expect(indicatesStaleRoom(["room.config.members.0"])).toBe(true);
  });

  it("room そのものが壊れていても画面を古くする", () => {
    expect(indicatesStaleRoom(["room"])).toBe(true);
  });

  it("読めないフレームは安全側へ倒す", () => {
    expect(indicatesStaleRoom(["<root>"])).toBe(true);
  });

  it("何のフレームか分からないものも安全側へ倒す", () => {
    expect(indicatesStaleRoom(["type"])).toBe(true);
  });

  it("落ちた項目が 1 つも分からないときも安全側へ倒す", () => {
    expect(indicatesStaleRoom([])).toBe(true);
  });

  it("交代シグナルの棄却は画面を古くしない", () => {
    expect(indicatesStaleRoom(["nextDriverName"])).toBe(false);
  });

  it("エラーフレームの棄却は画面を古くしない", () => {
    expect(indicatesStaleRoom(["message"])).toBe(false);
  });

  it("入室応答の棄却は画面を古くしない", () => {
    expect(indicatesStaleRoom(["resumeToken"])).toBe(false);
  });

  // **前方一致で雑に判定すると、無関係な項目まで巻き込む。**
  it("room で始まるだけの別項目は画面を古くしない", () => {
    expect(indicatesStaleRoom(["roomName"])).toBe(false);
  });

  it("1 つでも当てはまれば画面を古くする", () => {
    expect(indicatesStaleRoom(["message", "room.phase"])).toBe(true);
  });
});
