import { describe, expect, it } from "bun:test";
import { RAW_TOOL_IDS, type RawToolId } from "../../src/adapters/ws/raw-tools.js";
import { TOOL_IDS } from "../../src/application/tool-id.js";

/** 期待値は一覧から導かず、リテラルで固定する（導くと恒真になる）。 */
const EXPECTED: readonly RawToolId[] = ["hub", "topic", "roulette", "agenda", "checkin"];

describe("生テキストを受けるツールの表（raw-tools）", () => {
  it("ハブと、一覧から timer・poker を除いたもの全部を、一覧の順に並べる", () => {
    expect([...RAW_TOOL_IDS]).toEqual([...EXPECTED]);
  });

  it("一覧（TOOL_IDS）の道具は、timer・poker を除いてすべて表に載る（足し忘れの見張り）", () => {
    for (const id of TOOL_IDS) {
      if (id === "timer" || id === "poker") expect(RAW_TOOL_IDS).not.toContain(id as never);
      else expect(RAW_TOOL_IDS).toContain(id);
    }
  });

  it("チェックインの送る口は、実行時にも broadcast を持たない（受け手ごとに中身が違う）", async () => {
    const { newTestWsAdapter } = await import("../support/test-ws-adapter.js");
    const adapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      timer: { handleMessage: async () => {} },
      onDisconnect: () => {},
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
    try {
      expect("broadcast" in adapter.to.checkin).toBe(false);
      expect(typeof adapter.to.topic.broadcast).toBe("function");
    } finally {
      await adapter.close();
    }
  });
});
