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
 *    `src/**\/*.ts` に 0 件である。poker の正本（`poker-error-text.ts`・別の契約）も同じ形で見る
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
  type ConnectionErrorCode,
} from "../src/application/connection-errors.js";
import { POKER_ERROR_TEXT } from "../src/application/poker-error-text.js";

const CODES = Object.keys(CONNECTION_ERROR_TEXT) as ConnectionErrorCode[];
const SRC_DIR = join(import.meta.dir, "..", "src");
/** 正本のファイルと、そこにだけ文字列リテラルとして置いてよい文。 */
const CANONICALS = [
  {
    file: "application/connection-errors.ts",
    texts: Object.values(CONNECTION_ERROR_TEXT),
  },
  { file: "application/poker-error-text.ts", texts: Object.values(POKER_ERROR_TEXT) },
];

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

/**
 * 廃した旧い文。**src のどこにも直書きしてはならない**（正本の中にも置かない）。
 * 正本の文の写しを探す検査（下）は、正本から消えた文を知らないので、廃した文はここに残す。
 * - 「内部エラーが発生しました」: かつて timer だけが返していた内部エラーの文（#381 でそろえた）
 */
const RETIRED_TEXTS = ["内部エラーが発生しました"];

describe("廃した文が src に残っていない", () => {
  it("Given src の全ソース / When 廃した文の文字列リテラルを探す / Then 0 件", () => {
    // Given
    const files = [...new Glob("**/*.ts").scanSync(SRC_DIR)].map((rel) => rel.split("\\").join("/"));
    expect(files.length).toBeGreaterThan(0);
    // When
    const found: string[] = [];
    for (const rel of files) {
      const source = readFileSync(join(SRC_DIR, rel), "utf8");
      for (const text of RETIRED_TEXTS) {
        for (const quote of [`"`, `'`, "`"]) {
          if (source.includes(`${quote}${text}${quote}`)) found.push(`${rel}: ${quote}${text}${quote}`);
        }
      }
    }
    // Then
    expect(found).toEqual([]);
  });
});

describe("同期サーバーの中に写しが残っていない", () => {
  it("Given src の全ソース / When 正本の文の文字列リテラルを探す / Then 正本の外に 0 件", () => {
    // Given
    const files = [...new Glob("**/*.ts").scanSync(SRC_DIR)].map((rel) => rel.split("\\").join("/"));
    // 走査量は成否によらず出す。0 件なら検査が空振りしている（ADR-0014 決定 6・8）
    console.log(`[connection-error-text-sources] 走査対象: ${files.length} ファイル`);
    expect(files.length).toBeGreaterThan(0);
    for (const { file } of CANONICALS) expect(files).toContain(file);

    // When
    const copies: string[] = [];
    for (const { file, texts } of CANONICALS) {
      for (const rel of files) {
        if (rel === file) continue;
        const source = readFileSync(join(SRC_DIR, rel), "utf8");
        for (const text of texts) {
          for (const quote of [`"`, `'`, "`"]) {
            if (source.includes(`${quote}${text}${quote}`)) {
              copies.push(`${relative(join(SRC_DIR, ".."), join(SRC_DIR, rel))}: ${quote}${text}${quote}`);
            }
          }
        }
      }
    }

    // Then
    expect(copies).toEqual([]);
  });
});
