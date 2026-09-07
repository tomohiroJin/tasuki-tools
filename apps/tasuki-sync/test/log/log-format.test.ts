import { describe, it, expect } from "bun:test";
import { formatLine, createLogger, type LogLevel } from "../../src/application/log/logger.js";
import { publicText } from "../../src/application/log/log-safe.js";

describe("ログ行の整形", () => {
  it("フィールドが無ければイベント名だけを返す", () => {
    // Given / When
    const line = formatLine("listening");
    // Then
    expect(line).toBe("listening");
  });

  it("フィールドを key=value で並べる（grep で追える形を保つ）", () => {
    // Given
    const fields = { room: publicText("r_1a2b3c4d"), idleMs: 1800207 };
    // When
    const line = formatLine("reclaimed", fields);
    // Then
    expect(line).toBe("reclaimed room=r_1a2b3c4d idleMs=1800207");
  });

  it("真偽値をそのまま出す", () => {
    expect(formatLine("ai", { enabled: true })).toBe("ai enabled=true");
  });

  // ADR 0012 D12: requestId は境界に最大長も文字種の制限も無いため、
  // 制御文字を残すと journal に偽の行を作られる。
  it("値の改行・復帰・タブを除去する（ログ行への注入を防ぐ）", () => {
    // Given
    const injected = publicText("abc\ndef\rghi\tjkl");
    // When
    const line = formatLine("evt", { v: injected });
    // Then
    expect(line).toBe("evt v=abcdefghijkl");
  });

  it("イベント名の制御文字も除去する", () => {
    expect(formatLine("evt\nfake line")).toBe("evtfake line");
  });
});

describe("Logger", () => {
  it("レベルごとに sink へ整形済みの 1 行を渡す", () => {
    // Given
    const captured: Array<[LogLevel, string]> = [];
    const logger = createLogger((level, line) => captured.push([level, line]));
    // When
    logger.info("a", { n: 1 });
    logger.warn("b");
    logger.error("c", { ok: false });
    // Then
    expect(captured).toEqual([
      ["info", "a n=1"],
      ["warn", "b"],
      ["error", "c ok=false"],
    ]);
  });
});
