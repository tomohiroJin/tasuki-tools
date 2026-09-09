/**
 * removalNotificationFor のテスト（Issue #32: 自己退出した本人に退出を伝える）。
 *
 * 退出させられた本人へ送る通知の種類は「誰の操作か」で分かれる。
 * 自分で自分を退出させた場合と、他者に退出させられた場合を混同してはならない
 * （spec.md FR-125）。#95 S3 で役割・ホストを廃止した際、この判定自体は
 * 役割とは無関係なので `participants.ts` から `removal-notification.ts` へ
 * 移設した（実装は1文字も変えていない）。
 *
 * @requirements FR-125, US1-3
 */

import { describe, it, expect } from "vitest";
import { removalNotificationFor } from "../src/removal-notification.js";

describe("removalNotificationFor", () => {
  it("実行者と対象が同一なら自分の意思による退出として扱う", () => {
    expect(removalNotificationFor("p1", "p1")).toBe("LEFT_ROOM");
  });

  it("実行者と対象が異なるなら他者の操作による退出として扱う", () => {
    expect(removalNotificationFor("p1", "p2")).toBe("REMOVED_FROM_ROOM");
  });
});
