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
import { join } from "node:path";
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

/** 走査した 1 ファイル（`dir` からの相対パスと中身）。 */
interface ScannedFile {
  readonly rel: string;
  readonly source: string;
}

/**
 * `dir` の下の対象ファイルを読んで返す。**走査量は成否によらず出す**（0 件なら検査が空振りしている。ADR-0014 決定 6・9）。
 * 下の 2 つの検査は、どちらもこれで走査する。
 */
function scanFiles(label: string, dir: string, pattern: string): ScannedFile[] {
  const files = [...new Glob(pattern).scanSync(dir)].map((rel) => rel.split("\\").join("/")).sort();
  console.log(`[connection-error-text-sources] 走査対象（${label}）: ${files.length} ファイル`);
  expect(files.length).toBeGreaterThan(0);
  return files.map((rel) => ({ rel, source: readFileSync(join(dir, rel), "utf8") }));
}

/** `source` に、`text` が引用符で囲まれた文字列リテラルとして書かれているか。 */
function hasLiteral(source: string, text: string): string | undefined {
  return [`"`, `'`, "`"].find((quote) => source.includes(`${quote}${text}${quote}`));
}

/**
 * 廃した旧い文。**走査する場所のどこにも直書きしてはならない**（正本の中にも置かない）。
 * 正本の文の写しを探す検査（下）は、正本から消えた文を知らないので、廃した文はここに残す。
 * - 「内部エラーが発生しました」: かつて timer だけが返していた内部エラーの文（#381 でそろえた）
 *
 * 走査するのは、wire の文を作る同期サーバーに加え、timer の系統の受け側（timer-core・timer-web）の src。
 * 画面側へ旧い文を書き戻されても気づけるようにする。
 */
const RETIRED_TEXTS = ["内部エラーが発生しました"];
const REPO_ROOT = join(SRC_DIR, "..", "..", "..");
const RETIRED_SCOPES = [
  { label: "tasuki-sync/src", dir: SRC_DIR, pattern: "**/*.ts" },
  { label: "timer-core/src", dir: join(REPO_ROOT, "packages", "timer-core", "src"), pattern: "**/*.ts" },
  { label: "timer-web/src", dir: join(REPO_ROOT, "apps", "timer-web", "src"), pattern: "**/*.{ts,tsx}" },
];

describe("廃した文が src に残っていない", () => {
  it("Given 同期サーバーと timer の受け側の src / When 廃した文の文字列リテラルを探す / Then 0 件", () => {
    // Given
    const scanned = RETIRED_SCOPES.map((scope) => ({ scope, files: scanFiles(scope.label, scope.dir, scope.pattern) }));
    // When
    const found: string[] = [];
    for (const { scope, files } of scanned) {
      for (const { rel, source } of files) {
        for (const text of RETIRED_TEXTS) {
          const quote = hasLiteral(source, text);
          if (quote) found.push(`${scope.label}/${rel}: ${quote}${text}${quote}`);
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
    const files = scanFiles("tasuki-sync/src", SRC_DIR, "**/*.ts");
    const names = files.map((f) => f.rel);
    for (const { file } of CANONICALS) expect(names).toContain(file);

    // When
    const copies: string[] = [];
    for (const { file, texts } of CANONICALS) {
      for (const { rel, source } of files) {
        if (rel === file) continue;
        for (const text of texts) {
          const quote = hasLiteral(source, text);
          if (quote) copies.push(`src/${rel}: ${quote}${text}${quote}`);
        }
      }
    }

    // Then
    expect(copies).toEqual([]);
  });
});
