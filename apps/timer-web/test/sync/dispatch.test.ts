/**
 * サーバーメッセージ振り分けのテスト
 */

import { describe, it, expect, vi } from "vitest";
import { dispatchServerMessage } from "../../src/sync/dispatch.js";
import { aRoomView, aRecordWithUnresolvableName } from "../support/room-view.js";

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
        resumeToken: "r",
        participantId: "p",
      }),
      { onIdentity },
    );
    // Then
    expect(onIdentity).toHaveBeenCalledWith({
      participantId: "p",
      resumeToken: "r",
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
 * @requirements #91 E2 E15 E16（timer はお題を読んで表示するだけ・spec T3）
 */
describe("お題のフレームを振り分ける", () => {
  it("Given お題のフレーム / When 振り分ける / Then onTopic に状態が渡り、捨てたとは言わない", () => {
    // Given
    const state = { topic: { title: "FizzBuzz", body: "", source: "manual" }, generating: false, degraded: false, aiUnlocked: false };
    const onTopic = vi.fn();
    const onInvalidFrame = vi.fn();
    // When
    dispatchServerMessage(JSON.stringify({ type: "topic", state }), { onTopic, onInvalidFrame });
    // Then
    expect(onTopic).toHaveBeenCalledWith(state);
    expect(onInvalidFrame).not.toHaveBeenCalled();
  });

  it("Given 形の崩れたお題のフレーム / When 振り分ける / Then 捨てたことを知らせる", () => {
    // Given
    const onTopic = vi.fn();
    const onInvalidFrame = vi.fn();
    // When
    dispatchServerMessage(JSON.stringify({ type: "topic", state: { topic: 1 } }), { onTopic, onInvalidFrame });
    // Then
    expect(onTopic).not.toHaveBeenCalled();
    expect(onInvalidFrame).toHaveBeenCalled();
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

  it("捨てたことは、落ちた項目の経路つきで知らされる", () => {
    // Given: `snapshot` を捨てる状況は継続するので、知らせないと原因が分からない。
    //        名簿から引けない席の表示名が空文字で載る形を再現する（完成記録の経路。
    //        #294 で `config.members` が落ちた後、この投影がその役を引き継いだ）
    const onInvalidFrame = vi.fn();
    const base = aRoomView();
    const room = { ...base, sessionRecords: [aRecordWithUnresolvableName()] };
    // When
    dispatchServerMessage(JSON.stringify({ type: "snapshot", room }), { onInvalidFrame });
    // Then: どの項目で落ちたかは知らせるが、落ちた値そのものは渡さない
    expect(onInvalidFrame).toHaveBeenCalledWith(["room.sessionRecords.0.members.0"]);
  });

  /**
   * `session.seats` を必須にした（#276 D7）ことで、それを欠いた snapshot が
   * 実際に `room.session.seats` の経路で落ちることを固定する。
   *
   * `indicatesStaleRoom` がこの経路を「画面を古い側へ倒す」と扱うことは
   * Task 1（`stale-frame.test.ts`）で確認済みなので、ここでは重複させない。
   * ここで見るのは「検証器が本当にこの経路を出すか」だけである。
   */
  it("session.seats を欠いた snapshot は room.session.seats の経路で落ちる", () => {
    // Given: 妥当な wire ルームから seats だけを欠かす
    const onInvalidFrame = vi.fn();
    const base = aRoomView();
    const session = { ...base.session } as Record<string, unknown>;
    delete session["seats"];
    const room = { ...base, session };
    // When
    dispatchServerMessage(JSON.stringify({ type: "snapshot", room }), { onInvalidFrame });
    // Then
    expect(onInvalidFrame).toHaveBeenCalledWith(["room.session.seats"]);
  });

  /**
   * **JSON として読めない入力は「最も壊れている」場面である。** そこだけ無言だと、
   * 利用者への表出（#209）からその場面だけが丸ごと外れる。
   */
  it("JSON として読めないフレームでも、捨てたことは知らされる", () => {
    // Given
    const onInvalidFrame = vi.fn();
    // When
    dispatchServerMessage("{ broken", { onInvalidFrame });
    // Then
    expect(onInvalidFrame).toHaveBeenCalledWith(["<root>"]);
  });

  it.each([
    ["数値", "5"],
    ["null", "null"],
    ["文字列", '"hello"'],
  ])("オブジェクトですらない %s のフレームでも、形が違うことは知らされる", (_label, raw) => {
    // Given: 根で落ちる入力。valibot の flatten は nested を持たないため、
    //        素直に書くと**最も壊れている場面で診断が空配列になる**
    const onInvalidFrame = vi.fn();
    // When
    dispatchServerMessage(raw, { onInvalidFrame });
    // Then
    expect(onInvalidFrame).toHaveBeenCalledWith(["<root>"]);
  });

  it("契約を満たすフレームでは何も知らせない", () => {
    // Given
    const onInvalidFrame = vi.fn();
    // When
    dispatchServerMessage(JSON.stringify({ type: "time.pong", serverTime: 1 }), {
      onInvalidFrame,
    });
    // Then
    expect(onInvalidFrame).not.toHaveBeenCalled();
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
