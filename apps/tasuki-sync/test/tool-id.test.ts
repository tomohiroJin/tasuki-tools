import { describe, it, expect } from "bun:test";
import type { Protocol } from "../src/adapters/ws/connection-gate.js";
import { TOOL_IDS, isKnownToolId, type KnownToolId } from "../src/application/tool-id.js";

/**
 * 道具の一覧（`TOOL_IDS`）の契約。
 *
 * **綴りの固定（wire 互換の見張り）はここのリテラルと `test/ws/connection-gate.test.ts` の表が担う。**
 * 一覧から期待値を導くと恒真になるので、綴りは必ずリテラルで書く。
 * 道具を足してもこのテストは変えない（`toContain` で見る。等値にしない）。
 */
const WIRE_SPELLINGS = ["timer", "poker", "topic", "roulette", "agenda", "checkin"] as const;

describe("TOOL_IDS", () => {
  it.each(WIRE_SPELLINGS)("wire の綴り %s を含む", (spelling) => {
    expect(TOOL_IDS).toContain(spelling);
  });

  it("重複が無い", () => {
    expect(new Set(TOOL_IDS).size).toBe(TOOL_IDS.length);
  });
});

describe("isKnownToolId", () => {
  it.each(WIRE_SPELLINGS)("一覧の綴り %s は true", (spelling) => {
    expect(isKnownToolId(spelling)).toBe(true);
  });

  it.each(["hub", "Timer", "", "unknown"])("%p は false（大文字小文字を区別し、hub・unknown は道具ではない）", (value) => {
    expect(isKnownToolId(value)).toBe(false);
  });
});

describe("型の壁", () => {
  it("一覧に無い綴りは Protocol に代入できない", () => {
    // @ts-expect-error 一覧にも hub・unknown にも無い綴りは Protocol ではない
    const bad: Protocol = "not-a-tool";
    const asString: string = bad;
    expect(asString).toBe("not-a-tool");
  });

  it("Record<KnownToolId, …> は 1 つ欠けると型エラーになる", () => {
    // @ts-expect-error checkin が欠けている（道具を足して表を足し忘れると tsc が落ちる）
    const incomplete: Record<KnownToolId, true> = { timer: true, poker: true, topic: true, roulette: true, agenda: true };
    expect(Object.keys(incomplete)).toHaveLength(5);
  });
});
