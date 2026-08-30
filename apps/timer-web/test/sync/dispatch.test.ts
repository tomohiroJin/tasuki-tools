/**
 * サーバーメッセージ振り分けのテスト
 */

import { describe, it, expect, vi } from "vitest";
import { dispatchServerMessage } from "../../src/sync/dispatch.js";
import { aRoomView } from "../support/room-view.js";

/**
 * @requirements T055, FR-025, FR-026
 */
describe("dispatchServerMessage", () => {
  it("snapshot は room を onRoom へ渡す", () => {
    // Given: 契約（RoomSchema）を満たすルーム。**部分的な偽物では通らない**（#181）
    const onRoom = vi.fn();
    const room = aRoomView({ code: "X" });
    // When
    dispatchServerMessage(JSON.stringify({ type: "snapshot", room }), { onRoom });
    // Then
    expect(onRoom).toHaveBeenCalledWith(room);
  });

  it("room.created は identity 情報を onIdentity へ渡す", () => {
    // Given
    const onIdentity = vi.fn();
    // When
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
    // Then
    expect(onIdentity).toHaveBeenCalledWith({
      participantId: "p",
      resumeToken: "r",
      hostToken: "h",
    });
  });

  it("error は code とメッセージを onError へ渡す", () => {
    // Given
    const onError = vi.fn();
    // When
    dispatchServerMessage(
      JSON.stringify({ type: "error", code: "E", message: "m" }),
      { onError },
    );
    // Then
    expect(onError).toHaveBeenCalledWith("E", "m");
  });

  /**
   * @requirements Issue #22 G4, FR-077
   */
  it("signal notice は実行者・対象つきで onNotice へ渡る（破壊的操作の実行者を全員へ伝える）", () => {
    // Given
    const onNotice = vi.fn();
    // When
    dispatchServerMessage(
      JSON.stringify({
        type: "signal",
        signal: "notice",
        action: "participant-removed",
        actorName: "Bob",
        actorParticipantId: "pid-bob",
        targetName: "Carol",
        targetParticipantId: "pid-carol",
      }),
      { onNotice },
    );
    // Then
    expect(onNotice).toHaveBeenCalledWith({
      action: "participant-removed",
      actorName: "Bob",
      actorParticipantId: "pid-bob",
      targetName: "Carol",
      targetParticipantId: "pid-carol",
    });
  });

  it("signal notice は target 系が無くても onNotice へ渡る（中断・リセット・完成）", () => {
    // Given
    const onNotice = vi.fn();
    // When
    dispatchServerMessage(
      JSON.stringify({
        type: "signal",
        signal: "notice",
        action: "session-aborted",
        actorName: "Bob",
        actorParticipantId: "pid-bob",
      }),
      { onNotice },
    );
    // Then
    expect(onNotice).toHaveBeenCalledWith({
      action: "session-aborted",
      actorName: "Bob",
      actorParticipantId: "pid-bob",
      targetName: undefined,
      targetParticipantId: undefined,
    });
  });

  it("signal need-problem は requestId と deadlineMs を onNeedProblem へ渡す", () => {
    // Given
    const onNeedProblem = vi.fn();
    // When
    dispatchServerMessage(
      JSON.stringify({
        type: "signal",
        signal: "need-problem",
        requestId: "req-1",
        deadlineMs: 20000,
      }),
      { onNeedProblem },
    );
    // Then
    expect(onNeedProblem).toHaveBeenCalledWith("req-1", 20000);
  });

  it("signal switch では onNeedProblem を発火しない", () => {
    // Given
    const onNeedProblem = vi.fn();
    // When
    dispatchServerMessage(
      JSON.stringify({ type: "signal", signal: "switch", nextDriverName: "Bob" }),
      { onNeedProblem },
    );
    // Then
    expect(onNeedProblem).not.toHaveBeenCalled();
  });

  it("time.pong は serverTime を onTimePong へ渡す", () => {
    // Given
    const onTimePong = vi.fn();
    // When
    dispatchServerMessage(
      JSON.stringify({ type: "time.pong", serverTime: 123 }),
      { onTimePong },
    );
    // Then
    expect(onTimePong).toHaveBeenCalledWith(123);
  });

  it("不正な JSON はどのハンドラも実行せず無視する", () => {
    // Given
    const onRoom = vi.fn();
    const onError = vi.fn();
    // When / Then
    expect(() =>
      dispatchServerMessage("{ broken", { onRoom, onError }),
    ).not.toThrow();
    expect(onRoom).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});

/**
 * 契約（`ServerMsgSchema`）を満たさないフレームは画面へ届けない（#181）。
 *
 * **JSON として読めることと、契約を満たすことは別である。** ここまでの防御は
 * `JSON.parse` の例外だけで、形の違う JSON は素通りしていた。素通りすると
 * 壊れた値がそのまま画面の状態になる（`snapshot` の `room` が典型）。
 */
describe("dispatchServerMessage: 契約を満たさないフレーム", () => {
  it("room の形が契約から外れた snapshot は画面へ届かない", () => {
    // Given: JSON としては読めるが、RoomSchema の必須項目を欠く
    const onRoom = vi.fn();
    // When
    dispatchServerMessage(JSON.stringify({ type: "snapshot", room: { code: "X" } }), {
      onRoom,
    });
    // Then
    expect(onRoom).not.toHaveBeenCalled();
  });

  it("必須項目を欠く error フレームは画面へ届かない", () => {
    // Given: message が無い（ErrorMsg の必須項目）
    const onError = vi.fn();
    // When
    dispatchServerMessage(JSON.stringify({ type: "error", code: "E" }), { onError });
    // Then
    expect(onError).not.toHaveBeenCalled();
  });

  it("知らない種別のフレームは画面へ届かない", () => {
    // Given
    const onRoom = vi.fn();
    const onError = vi.fn();
    // When
    dispatchServerMessage(JSON.stringify({ type: "unknown-kind" }), { onRoom, onError });
    // Then
    expect(onRoom).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
