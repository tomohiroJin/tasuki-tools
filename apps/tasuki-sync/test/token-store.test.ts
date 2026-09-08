/**
 * createTokenStore() のテスト。
 *
 * `handlers.ts` の `resumeTokens`/`roomPassphrases` が
 * これまで担っていた挙動（発行・照合・ルーム単位の解放）をそのまま仕様として固定する。
 * 3 個目の `hostTokens` は #95 S3 でホストの概念ごと廃止したため、
 * それを対象にしていた 4 件のテストも概念ごと消えている。
 */

import { describe, it, expect } from "bun:test";
import { createTokenStore } from "../src/application/token-store.js";

describe("createTokenStore", () => {
  describe("リジュームトークン", () => {
    /**
     * @requirements FR-157, US3
     */
    it("発行したリジュームトークンから再接続先を引ける", () => {
      // Given
      const store = createTokenStore();

      // When
      store.issueResume("resume-1", { participantId: "p1", roomCode: "ROOM01" });

      // Then
      expect(store.getResume("resume-1")).toEqual({
        participantId: "p1",
        roomCode: "ROOM01",
      });
    });

    /**
     * @requirements FR-157, US3
     */
    it("発行していないリジュームトークンは undefined を返す", () => {
      // Given
      const store = createTokenStore();

      // When
      const data = store.getResume("never-issued");

      // Then
      expect(data).toBeUndefined();
    });
  });

  describe("ルームパスフレーズ", () => {
    /**
     * @requirements FR-157, US3
     */
    it("設定したパスフレーズを引ける", () => {
      // Given
      const store = createTokenStore();

      // When
      store.setPassphrase("ROOM01", "秘密の合言葉");

      // Then
      expect(store.getPassphrase("ROOM01")).toBe("秘密の合言葉");
    });

    /**
     * @requirements FR-157, US3
     */
    it("解除すると undefined に戻る", () => {
      // Given
      const store = createTokenStore();
      store.setPassphrase("ROOM01", "秘密の合言葉");

      // When
      store.deletePassphrase("ROOM01");

      // Then
      expect(store.getPassphrase("ROOM01")).toBeUndefined();
    });

    /**
     * @requirements FR-157, US3
     */
    it("未設定のルームは undefined を返す", () => {
      // Given
      const store = createTokenStore();

      // When
      const passphrase = store.getPassphrase("ROOM99");

      // Then
      expect(passphrase).toBeUndefined();
    });
  });

  describe("releaseRoom によるルーム単位の解放", () => {
    /**
     * @requirements FR-157, US3
     */
    it("パスフレーズが解放される", () => {
      // Given
      const store = createTokenStore();
      store.setPassphrase("ROOM01", "秘密の合言葉");

      // When
      store.releaseRoom("ROOM01");

      // Then
      expect(store.getPassphrase("ROOM01")).toBeUndefined();
    });

    /**
     * @requirements FR-157, US3
     */
    it("当該ルームのリジュームトークンだけが解放され、他ルームは残る", () => {
      // Given
      const store = createTokenStore();
      store.issueResume("resume-room1", { participantId: "p1", roomCode: "ROOM01" });
      store.issueResume("resume-room2", { participantId: "p2", roomCode: "ROOM02" });

      // When
      store.releaseRoom("ROOM01");

      // Then
      expect(store.getResume("resume-room1")).toBeUndefined();
      expect(store.getResume("resume-room2")).toEqual({
        participantId: "p2",
        roomCode: "ROOM02",
      });
    });
  });
});
