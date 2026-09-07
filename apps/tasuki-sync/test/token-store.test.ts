/**
 * createTokenStore() のテスト。
 *
 * `handlers.ts` の `hostTokens`/`resumeTokens`/`roomPassphrases` が
 * これまで担っていた挙動（発行・照合・ルーム単位の解放）をそのまま仕様として固定する。
 */

import { describe, it, expect } from "bun:test";
import { createTokenStore } from "../src/application/token-store.js";

describe("createTokenStore", () => {
  describe("ホストトークン", () => {
    /**
     * @requirements FR-157, US3
     */
    it("発行したホストトークンで照合すると一致する", () => {
      // Given
      const store = createTokenStore();

      // When
      store.issueHost("ROOM01", "host-tok-1");

      // Then
      expect(store.verifyHost("ROOM01", "host-tok-1")).toBe(true);
    });

    /**
     * @requirements FR-157, US3
     */
    it("異なるトークンで照合すると一致しない", () => {
      // Given
      const store = createTokenStore();
      store.issueHost("ROOM01", "host-tok-1");

      // When
      const matched = store.verifyHost("ROOM01", "wrong-token");

      // Then
      expect(matched).toBe(false);
    });

    /**
     * @requirements FR-157, US3
     */
    it("発行していないルームコードの照合は一致しない", () => {
      // Given
      const store = createTokenStore();

      // When
      const matched = store.verifyHost("NEVER-ISSUED", "anything");

      // Then
      expect(matched).toBe(false);
    });
  });

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
    it("ホストトークンが解放され、照合が失敗するようになる", () => {
      // Given
      const store = createTokenStore();
      store.issueHost("ROOM01", "host-tok-1");

      // When
      store.releaseRoom("ROOM01");

      // Then
      expect(store.verifyHost("ROOM01", "host-tok-1")).toBe(false);
    });

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
