/**
 * 接続層のエラーの文言が、正本 1 つから出ていることを守るテスト（#362 Task 3）。
 *
 * 正本は `src/application/connection-errors.ts`。守るのは次の 3 つ:
 *
 * 1. **core の写しが正本と一致する。** topic-core・roulette-core の文言の表は全域なので、
 *    接続層のコードの文も持つ。core は `@tasuki/*` に依存しない（`ALLOWED`・`docs/adr/0017`）ため
 *    正本を取り込めない。以前は「ws-adapter と同じ文にする」というコメントで揃えていた。
 *    決まりをコメントでなくテストで守る（#360 設計正本 §2）
 * 2. **NOT_IN_ROOM の文が 3 つの core でそろう。** 同期サーバーは各 core の表から引いて送る
 * 3. **同期サーバーの中に写しが残っていない。** 正本の文の文字列リテラルが、正本の外の
 *    `src/**\/*.ts` に 0 件である
 *
 * 置き場を同期サーバーにするのは、ここが全部の core に依存してよい唯一の場所だから。
 */
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { Glob } from "bun";
import { topicErrorMessageFor } from "@tasuki/topic-core";
import { rouletteErrorMessageFor } from "@tasuki/roulette-core";
import { errorMessageFor } from "@tasuki/timer-core";
import {
  CONNECTION_ERROR_TEXT,
  TIMER_INTERNAL_ERROR_TEXT,
  type ConnectionErrorCode,
} from "../src/application/connection-errors.js";

const CODES = Object.keys(CONNECTION_ERROR_TEXT) as ConnectionErrorCode[];
const SRC_DIR = join(import.meta.dir, "..", "src");
const CANONICAL = "application/connection-errors.ts";

describe("core の写しが正本と一致する", () => {
  for (const code of CODES) {
    it(`Given 接続層のコード ${code} / When core の表から文を引く / Then topic-core・roulette-core とも正本と同じ文`, () => {
      // Given
      const canonical = CONNECTION_ERROR_TEXT[code];
      // When
      const fromTopic = topicErrorMessageFor(code);
      const fromRoulette = rouletteErrorMessageFor(code);
      // Then
      expect(fromTopic).toBe(canonical);
      expect(fromRoulette).toBe(canonical);
    });
  }

  it("Given NOT_IN_ROOM / When 3 つの core から文を引く / Then 同じ文", () => {
    // Given
    const code = "NOT_IN_ROOM";
    // When
    const texts = [topicErrorMessageFor(code), rouletteErrorMessageFor(code), errorMessageFor(code)];
    // Then
    expect(new Set(texts).size).toBe(1);
  });
});

describe("同期サーバーの中に写しが残っていない", () => {
  it("Given src の全ソース / When 正本の文の文字列リテラルを探す / Then 正本の外に 0 件", () => {
    // Given
    const files = [...new Glob("**/*.ts").scanSync(SRC_DIR)].map((rel) => rel.split("\\").join("/"));
    // 走査量は成否によらず出す。0 件なら検査が空振りしている（ADR-0014 決定 6・8）
    console.log(`[connection-error-text-sources] 走査対象: ${files.length} ファイル`);
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain(CANONICAL);
    const texts = [...Object.values(CONNECTION_ERROR_TEXT), TIMER_INTERNAL_ERROR_TEXT];

    // When
    const copies: string[] = [];
    for (const rel of files) {
      if (rel === CANONICAL) continue;
      const source = readFileSync(join(SRC_DIR, rel), "utf8");
      for (const text of texts) {
        for (const quote of [`"`, `'`, "`"]) {
          if (source.includes(`${quote}${text}${quote}`)) {
            copies.push(`${relative(join(SRC_DIR, ".."), join(SRC_DIR, rel))}: ${quote}${text}${quote}`);
          }
        }
      }
    }

    // Then
    expect(copies).toEqual([]);
  });
});
