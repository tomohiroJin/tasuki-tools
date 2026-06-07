/**
 * サーバーメッセージ振り分けのテスト
 * T055(フロント): FR-025, FR-026 — need-problem 受信の配線
 */

import { describe, it, expect, vi } from "vitest";
import { dispatchServerMessage } from "../../src/sync/dispatch.js";

describe("dispatchServerMessage", () => {
  it("snapshot は onRoom を呼ぶ", () => {
    const onRoom = vi.fn();
    dispatchServerMessage(
      JSON.stringify({ type: "snapshot", room: { code: "X" } }),
      { onRoom },
    );
    expect(onRoom).toHaveBeenCalledWith({ code: "X" });
  });

  it("room.created は onIdentity を呼ぶ", () => {
    const onIdentity = vi.fn();
    dispatchServerMessage(
      JSON.stringify({
        type: "room.created",
        code: "X",
        hostToken: "h",
        resumeToken: "r",
        participantId: "p",
      }),
      { onIdentity },
    );
    expect(onIdentity).toHaveBeenCalledWith({
      participantId: "p",
      resumeToken: "r",
      hostToken: "h",
    });
  });

  it("error は onError を呼ぶ", () => {
    const onError = vi.fn();
    dispatchServerMessage(
      JSON.stringify({ type: "error", code: "E", message: "m" }),
      { onError },
    );
    expect(onError).toHaveBeenCalledWith("E", "m");
  });

  it("signal need-problem は onNeedProblem を requestId と deadlineMs で呼ぶ", () => {
    const onNeedProblem = vi.fn();
    dispatchServerMessage(
      JSON.stringify({
        type: "signal",
        signal: "need-problem",
        requestId: "req-1",
        deadlineMs: 20000,
      }),
      { onNeedProblem },
    );
    expect(onNeedProblem).toHaveBeenCalledWith("req-1", 20000);
  });

  it("signal switch は onNeedProblem を呼ばない", () => {
    const onNeedProblem = vi.fn();
    dispatchServerMessage(
      JSON.stringify({ type: "signal", signal: "switch", nextDriverName: "Bob" }),
      { onNeedProblem },
    );
    expect(onNeedProblem).not.toHaveBeenCalled();
  });

  it("signal suggest-break は onSuggestBreak を rounds で呼ぶ", () => {
    const onSuggestBreak = vi.fn();
    dispatchServerMessage(
      JSON.stringify({ type: "signal", signal: "suggest-break", rounds: 4 }),
      { onSuggestBreak },
    );
    expect(onSuggestBreak).toHaveBeenCalledWith(4);
  });

  it("time.pong は onTimePong を serverTime で呼ぶ", () => {
    const onTimePong = vi.fn();
    dispatchServerMessage(
      JSON.stringify({ type: "time.pong", serverTime: 123 }),
      { onTimePong },
    );
    expect(onTimePong).toHaveBeenCalledWith(123);
  });

  it("不正な JSON は何も呼ばずに無視する", () => {
    const onRoom = vi.fn();
    const onError = vi.fn();
    expect(() =>
      dispatchServerMessage("{ broken", { onRoom, onError }),
    ).not.toThrow();
    expect(onRoom).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
