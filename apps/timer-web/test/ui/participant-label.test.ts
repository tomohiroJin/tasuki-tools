/**
 * 呼び名の判定対象プール（`labelPool`）。
 *
 * 呼び分けの規則（`participantLabel` など）のテストは `@tasuki/room-core` へ移した（#419）。
 * ここに残すのは timer 固有の `Seat` に依存する部分だけ。
 */

import { describe, it, expect } from "vitest";
import type { Seat } from "@tasuki/timer-core";
import { labelPool } from "../../src/ui/participant-label.js";

const p = (participantId: string, displayName: string) => ({ participantId, displayName });
const seat = (id: string, displayName: string): Seat => ({
  id,
  displayName,
  isProxy: false,
  skipReason: null,
});

describe("labelPool", () => {
  it("seats と participants の和集合を id で重複排除する", () => {
    const pool = labelPool([seat("a", "A")], [p("a", "A2"), p("b", "B")]);
    expect(pool.map((x) => x.participantId).sort()).toEqual(["a", "b"]);
  });

  it("同じ id は seats の表示名を優先する", () => {
    const pool = labelPool([seat("a", "席の名前")], [p("a", "在席の名前")]);
    expect(pool).toEqual([p("a", "席の名前")]);
  });
});

/**
 * かつてここには `canTransferHostTo` / `canRemoveParticipant` / `canReorderRotation` の
 * 可否判定テストがあった（FR-107・Issue #28 T067/T068）。#95 S3 で役割とホストが消え、
 * どれも「管理権限を持つか」の項が恒真になったため、関数ごと呼び出し側へ畳んだ。
 *
 * **残った性質は消していない。** 描画側のテストが同じことを見ている:
 * 「自分の行には退出を出さない」「rotation 外の行には並べ替えを出さない」
 * 「ドライバーが1人だけなら並べ替えを出さない」は `test/ui/RosterPanel.test.tsx` と
 * `test/ui/RosterPanel.all-equal.test.tsx` にある。
 */
