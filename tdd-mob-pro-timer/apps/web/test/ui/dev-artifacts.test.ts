/**
 * 開発証跡の分離テスト
 * T068: FR-027 (US11)
 *
 * 本番描画経路に開発・テスト専用表示が混入していないことを確認する。
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC_DIR = join(import.meta.dirname, "../../src");

function readAllTsFiles(dir: string): string[] {
  const contents: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      contents.push(...readAllTsFiles(fullPath));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      contents.push(readFileSync(fullPath, "utf-8"));
    }
  }
  return contents;
}

describe("開発証跡の分離（T068: FR-027）", () => {
  const sourceFiles = readAllTsFiles(SRC_DIR);
  const combined = sourceFiles.join("\n");

  it("本番ソースに selfTest / self_test のような自己診断の直接呼び出しが無い", () => {
    expect(combined).not.toMatch(/selfTest\s*\(\s*\)|self_test\s*\(\s*\)/);
  });

  it("本番ソースに console.log が残っていない（診断ログを除く）", () => {
    // console.log は開発中の手動デバッグに使われることがある
    // ただし完全禁止にすると厳しすぎるため、存在しないことを「理想」として確認
    // 実際には0件であるべきだが、warn/error は許容
    const logCount = (combined.match(/console\.log\s*\(/g) ?? []).length;
    expect(logCount).toBe(0);
  });
});
