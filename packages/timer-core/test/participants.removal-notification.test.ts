/**
 * removalNotificationFor のテスト（Issue #32: 自己退出した本人に退出を伝える）。
 *
 * 退出させられた本人へ送る通知の種類は「誰の操作か」で分かれる。
 * 自分で自分を退出させた場合と、他者に退出させられた場合を混同してはならない
 * （spec.md FR-125）。
 *
 * @requirements FR-125, US1-3
 */

import { describe, it, expect } from "vitest";
import { removalNotificationFor } from "../src/participants.js";

describe("removalNotificationFor", () => {
  it("実行者と対象が同一のとき、本人自身の操作による退出として LEFT_ROOM を返す", () => {
    // Given
    const actorParticipantId = "p1";
    const targetParticipantId = "p1";
    // When
    const result = removalNotificationFor(actorParticipantId, targetParticipantId);
    // Then
    expect(result).toBe("LEFT_ROOM");
  });

  it("実行者と対象が異なるとき、他者の操作による退出として REMOVED_FROM_ROOM を返す", () => {
    // Given
    const actorParticipantId = "p1";
    const targetParticipantId = "p2";
    // When
    const result = removalNotificationFor(actorParticipantId, targetParticipantId);
    // Then
    expect(result).toBe("REMOVED_FROM_ROOM");
  });
});
