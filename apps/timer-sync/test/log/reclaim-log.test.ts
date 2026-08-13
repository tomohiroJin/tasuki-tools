import { describe, it, expect } from "bun:test";
import { createLogger, type LogLevel } from "../../src/application/log/logger.js";
import { createRefEncoder } from "../../src/application/log/ref-encoder.js";

/**
 * 回収ログが「grep できる」ことと「ルームコードを含まない」ことを同時に固定する。
 * 片方だけを見ると、運用が壊れる変更か情報が漏れる変更のどちらかが通る。
 */
describe("回収ログ", () => {
  it("イベント名 reclaimed で grep でき、ルームコードを含まない", () => {
    // Given
    const lines: string[] = [];
    const logger = createLogger((_level: LogLevel, line: string) => lines.push(line));
    const enc = createRefEncoder(Buffer.from("salt-for-test"));
    const code = "MORNING-MOB-7F3K";
    // When
    logger.info("reclaimed", { room: enc.room(code), idleMs: 1800207 });
    // Then
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("reclaimed");
    expect(lines[0]).toContain("idleMs=1800207");
    expect(lines[0]).not.toContain(code);
    expect(lines[0]).not.toContain("7F3K");
  });
});
