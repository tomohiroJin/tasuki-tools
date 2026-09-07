/**
 * aRoom()（test/support 共有ルーム構築ビルダー）のテスト
 *
 * Given を 1〜2 行に圧縮するビルダーが、各段（withParticipants / withDriver /
 * started / build）で期待どおりのルームを作ることを検証する。
 * 加えて、前提の構築に失敗した場合は `throw` すること（`expect` を使わないこと）を
 * 検証する。これは検証の失敗と前提の失敗を区別するため（FR-096）。
 *
 * @requirements FR-096, FR-097, US2
 */

import { describe, it, expect } from "bun:test";
import { aRoom } from "./room-builder.js";

describe("aRoom()", () => {
  it("参加者を指定しない場合、host のみのルームができる", async () => {
    // Given（追加オプションを付けない aRoom() を対象にする）
    const builder = aRoom();
    // When
    const { store, code, ids } = await builder.build();

    // Then
    const room = store.get(code);
    expect(room?.participants).toHaveLength(1);
    expect(room?.participants[0]?.displayName).toBe("Host");
    expect(ids["Host"]).toBe(room?.participants[0]?.participantId);
  });

  it("withParticipants() で指定した名前が参加者として join する", async () => {
    // Given
    const builder = aRoom().withParticipants("Bob", "Carol");
    // When
    const { store, code, ids } = await builder.build();

    // Then
    const room = store.get(code);
    const names = room?.participants.map((p) => p.displayName);
    expect(names).toEqual(["Host", "Bob", "Carol"]);
    expect(ids["Bob"]).toBeTruthy();
    expect(ids["Carol"]).toBeTruthy();
  });

  it("withDriver() で指定した参加者が現ドライバーになる", async () => {
    // Given
    const builder = aRoom().withParticipants("Bob", "Carol").withDriver("Bob");
    // When
    const { store, code, ids } = await builder.build();

    // Then
    const room = store.get(code);
    const currentIndex = room?.session.currentIndex ?? -1;
    expect(room?.session.rotation[currentIndex]).toBe(ids["Bob"]);
  });

  it("started() でセッションが開始状態（phase: session）になる", async () => {
    // Given
    const builder = aRoom().withParticipants("Bob").started();
    // When
    const { store, code } = await builder.build();

    // Then
    const room = store.get(code);
    expect(room?.phase).toBe("session");
  });

  it("build() は { handlers, store, broadcaster, code, ids } を返す", async () => {
    // Given
    const builder = aRoom().withParticipants("Bob");
    // When
    const built = await builder.build();

    // Then
    expect(built.handlers).toBeTruthy();
    expect(built.store).toBeTruthy();
    expect(built.broadcaster).toBeTruthy();
    expect(typeof built.code).toBe("string");
    expect(built.ids["Bob"]).toBeTruthy();
  });

  describe("前提の構築に失敗した場合", () => {
    it("withDriver() が withParticipants に存在しない名前を指すと build() が throw する", async () => {
      await expect(aRoom().withDriver("誰も居ない").build()).rejects.toThrow();
    });
  });
});
