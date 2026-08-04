/**
 * SpyBroadcaster（test/support 共有ヘルパ）のテスト
 *
 * 既存 29 ファイルに散在していた `SpyBroadcaster` のローカル定義の和集合を
 * 満たすことを検証する。加えて、位置依存の検証（`spy.sent[0]` のような添字アクセス。
 * 現在 61 箇所ある）の置き換え先となる問い合わせメソッドの振る舞いを検証する。
 *
 * @requirements FR-097, FR-118, US2
 */

import { describe, it, expect } from "vitest";
import type { ServerMsg, Room } from "@tasuki/timer-core";
import { SpyBroadcaster } from "./spy-broadcaster.js";

/** テスト用の最小限の Room。broadcastSnapshot が受け取る room を模す。 */
function fakeRoom(code: string): Room {
  return { code } as unknown as Room;
}

describe("SpyBroadcaster", () => {
  describe("記録（既存ローカル定義の和集合）", () => {
    it("sendTo の呼び出しを { connId, msg } として sent に記録する", () => {
      // Given
      const spy = new SpyBroadcaster();
      const msg: ServerMsg = { type: "error", code: "not-found", message: "見つかりません" };

      // When
      spy.sendTo("conn-1", msg);

      // Then
      expect(spy.sent).toEqual([{ connId: "conn-1", msg }]);
    });

    it("broadcastSnapshot の呼び出しを roomCode と room の両方を保ったまま記録する", () => {
      // Given
      const spy = new SpyBroadcaster();
      const room = fakeRoom("ROOM01");

      // When
      spy.broadcastSnapshot("ROOM01", room);

      // Then
      expect(spy.snapshots).toEqual([{ roomCode: "ROOM01", room }]);
    });

    it("broadcastSignal の呼び出しを { roomCode, msg } として signals に記録する", () => {
      // Given
      const spy = new SpyBroadcaster();
      const msg: ServerMsg = { type: "signal", signal: "celebration" };

      // When
      spy.broadcastSignal("ROOM01", msg);

      // Then
      expect(spy.signals).toEqual([{ roomCode: "ROOM01", msg }]);
    });
  });

  describe("latestSnapshot()", () => {
    it("最後に配信されたルームを返す", () => {
      // Given
      const spy = new SpyBroadcaster();

      // When
      spy.broadcastSnapshot("ROOM01", fakeRoom("first"));
      spy.broadcastSnapshot("ROOM01", fakeRoom("second"));

      // Then
      expect(spy.latestSnapshot()).toEqual(fakeRoom("second"));
    });

    it("一度も配信されていない場合は undefined を返す", () => {
      const spy = new SpyBroadcaster();

      expect(spy.latestSnapshot()).toBeUndefined();
    });
  });

  describe("errorsTo(connId)", () => {
    it("指定した接続へ送られたエラーだけを一覧で返す", () => {
      // Given
      const spy = new SpyBroadcaster();
      const errA: ServerMsg = { type: "error", code: "forbidden", message: "権限がありません" };
      const errB: ServerMsg = { type: "error", code: "not-found", message: "見つかりません" };
      const notice: ServerMsg = {
        type: "signal",
        signal: "notice",
        action: "session-aborted",
        actorName: "Alice",
        actorParticipantId: "p1",
      };

      // When
      spy.sendTo("conn-1", errA);
      spy.sendTo("conn-2", errB);
      spy.sendTo("conn-1", notice);

      // Then
      expect(spy.errorsTo("conn-1")).toEqual([errA]);
    });

    it("該当する送信がなければ空配列を返す", () => {
      const spy = new SpyBroadcaster();

      expect(spy.errorsTo("conn-nobody")).toEqual([]);
    });
  });

  describe("hasErrorCode(connId, code)", () => {
    it("特定の接続へ特定のエラーコードが送られていれば true", () => {
      // Given
      const spy = new SpyBroadcaster();
      spy.sendTo("conn-1", { type: "error", code: "forbidden", message: "権限がありません" });

      // When
      const result = spy.hasErrorCode("conn-1", "forbidden");

      // Then
      expect(result).toBe(true);
    });

    it("コードが一致しなければ false", () => {
      // Given
      const spy = new SpyBroadcaster();
      spy.sendTo("conn-1", { type: "error", code: "forbidden", message: "権限がありません" });

      // When
      const result = spy.hasErrorCode("conn-1", "not-found");

      // Then
      expect(result).toBe(false);
    });

    it("接続が一致しなければ false", () => {
      // Given
      const spy = new SpyBroadcaster();
      spy.sendTo("conn-1", { type: "error", code: "forbidden", message: "権限がありません" });

      // When
      const result = spy.hasErrorCode("conn-2", "forbidden");

      // Then
      expect(result).toBe(false);
    });
  });

  describe("signalsOf(signal)", () => {
    it("特定種別のシグナル一覧を返す", () => {
      // Given
      const spy = new SpyBroadcaster();
      const celebration: ServerMsg = { type: "signal", signal: "celebration" };
      const suggestBreak: ServerMsg = { type: "signal", signal: "suggest-break", rounds: 3 };

      // When
      spy.broadcastSignal("ROOM01", celebration);
      spy.broadcastSignal("ROOM01", suggestBreak);
      spy.broadcastSignal("ROOM01", celebration);

      // Then
      expect(spy.signalsOf("celebration")).toEqual([celebration, celebration]);
    });

    it("該当するシグナルがなければ空配列を返す", () => {
      const spy = new SpyBroadcaster();

      expect(spy.signalsOf("switch")).toEqual([]);
    });
  });
});
