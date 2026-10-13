/**
 * アプリケーション層は大域の時計・乱数を直接呼ばない（#367 Task 3）。
 *
 * 時計と乱数はポート（`WallClock`・`MonotonicClock`・`RandomSource`）を通して受け取る。直接呼ぶと、
 * テストで差し替えられず、振る舞いを時刻や乱数に頼って固定するしかなくなる（`docs/adr/0004`）。
 *
 * 見るのは字面である（コメントの中の語も拾う。`audit-domain-side-effects` と同じ作法）。
 * **タイマー（`setTimeout` / `setInterval`）は見ない。** 差し替えるテストは bun の偽のタイマーで
 * 書けていて、ポートを足す条件（`docs/adr/0007` 追記 2026-08-17）を満たさないため。
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";

const APPLICATION_DIR = join(import.meta.dir, "..", "src", "application");
const FORBIDDEN = ["performance.now(", "Math.random(", "Date.now("] as const;

/** 禁じた語の出現（`ファイル:行  語`）。 */
export function findGlobalCalls(text: string, file: string): string[] {
  return text.split("\n").flatMap((line, i) =>
    FORBIDDEN.filter((token) => line.includes(token)).map((token) => `${file}:${i + 1}  ${token}`),
  );
}

describe("アプリケーション層の大域の時計・乱数", () => {
  it("Given 禁じた語を含む行 / When 探す / Then それぞれ拾う（検出が空振りしないことの確かめ）", () => {
    // Given
    const text = ["const a = performance.now();", "const b = Math.random();", "const c = Date.now();"].join("\n");
    // When
    const found = findGlobalCalls(text, "x.ts");
    // Then
    expect(found).toEqual(["x.ts:1  performance.now(", "x.ts:2  Math.random(", "x.ts:3  Date.now("]);
  });

  it("Given src/application の全ファイル / When 禁じた語を探す / Then 0 件", () => {
    // Given
    const files = [...new Glob("**/*.ts").scanSync(APPLICATION_DIR)];
    // When
    const found = files.flatMap((f) => findGlobalCalls(readFileSync(join(APPLICATION_DIR, f), "utf8"), f));
    // Then
    expect(found).toEqual([]);
  });
});
