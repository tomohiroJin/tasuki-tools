import { describe, it, expect } from "vitest";
import { errorMessageFor } from "@tasuki/timer-core";
import { baseFaces } from "../support/font-base.js";
import { BREAK_TEXT } from "../../src/ui/break-view.js";
import { buildNoticeMessage } from "../../src/sync/notice-message.js";

/**
 * 休憩の文言に許す base 層外の字（設計 D9・§5.7）。これ以外が混ざったら赤。
 *
 * @requirements #402 spec §5.7
 */
const ALLOWED_OUTSIDE = new Set(["休", "憩"]);

const ERROR_CODES = ["OnBreak", "NotOnBreak", "NOT_IN_SESSION", "CONFIG_LOCKED_IN_SESSION"];

/** 項目が増えても自動で測られるよう、`BREAK_TEXT` は全項目を走査する（関数の文言は名前・数の両方で呼ぶ） */
function allBreakTexts(): string[] {
  const fromTable = Object.values(BREAK_TEXT).flatMap((t) =>
    typeof t === "function" ? [(t as (a: unknown) => string)("名前"), (t as (a: unknown) => string)(12)] : [t],
  );
  const notices = (["break-started", "break-ended"] as const).map((action) =>
    buildNoticeMessage(
      { action, actorName: "名前", actorParticipantId: "p-other" },
      { selfParticipantId: "p-self", participants: [{ participantId: "p-other", displayName: "名前" }] },
    ),
  );
  const selfNotices = (["break-started", "break-ended"] as const).map((action) =>
    buildNoticeMessage(
      { action, actorName: "名前", actorParticipantId: "p-self" },
      { selfParticipantId: "p-self", participants: [] },
    ),
  );
  return [...fromTable, ...notices, ...selfNotices, ...ERROR_CODES.map(errorMessageFor)];
}

describe("休憩の文言は書体の常用の層に収まる（#402）", () => {
  it("Given 常用の層の面 / When 読む / Then 3 つの太さが見つかる（0 面だと下が緑に倒れる）", () => {
    expect([...baseFaces().keys()].sort()).toEqual(["zkgn-400-base.woff2", "zkgn-500-base.woff2", "zkgn-700-base.woff2"]);
  });

  it("Given 休憩の文言のすべて / When 常用の層の範囲に当てる / Then 外れる字は休・憩だけ", () => {
    const outside = new Set<string>();
    for (const [, ranges] of baseFaces()) {
      for (const text of allBreakTexts()) {
        for (const ch of text) {
          const cp = ch.codePointAt(0) ?? 0;
          if (cp > 0x7e && !ranges.some(([a, b]) => cp >= a && cp <= b)) outside.add(ch);
        }
      }
    }
    expect([...outside].filter((ch) => !ALLOWED_OUTSIDE.has(ch))).toEqual([]);
  });

  it("Given エラーの文言 / When 引く / Then 既定の文言に落ちていない（落ちると測っていない）", () => {
    for (const code of ERROR_CODES) {
      expect(errorMessageFor(code)).not.toBe(errorMessageFor("__unknown__"));
    }
  });

  it("Given 文言の一覧 / When 集める / Then 「休」「憩」が実際に測られている（空振りでない）", () => {
    expect(allBreakTexts().join("")).toMatch(/[休憩]/);
  });
});
