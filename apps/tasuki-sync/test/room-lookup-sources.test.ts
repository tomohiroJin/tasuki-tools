/**
 * 「接続からルームを引く走査は `room-lookup.ts` の 1 か所」を守るテスト（#366 Task 3）。
 *
 * 以前は同じ走査（`store.list()` の全ルームを、`findParticipantByConnId` で探す）が 7 か所に写されていた。
 * 写しがあると、引き方を直すとき（例えばツールで絞る）に 1 か所だけが取り残される。
 *
 * 見るのは字面である: `.list()` に続けて `find` / `some` / `filter` を呼び、その中で
 * `findParticipantByConnId(` を呼ぶ書き方（改行を挟んでもよい）。
 * **見逃す書き方**: 一覧を別の変数に受けてから回す・`for` で回す・関数を別名で受ける。
 * それらは書く理由が無いので、ここでは追わない（見つけたら、この検査を強めるより room-lookup.ts を使う）。
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { Glob } from "bun";

const SRC_DIR = join(import.meta.dir, "..", "src");
const CANONICAL = "application/room-lookup.ts";
const SCAN = /\.list\(\)\s*\.(?:find|some|filter)\(\s*\(?\s*\w+\s*\)?\s*=>\s*findParticipantByConnId\(/g;

/** 書き方を見つけた場所（`ファイル:行`。行は `.list()` の行）。 */
export function findLookupScans(text: string, file: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(SCAN)) {
    const line = text.slice(0, m.index).split("\n").length;
    found.push(`${file}:${line}`);
  }
  return found;
}

describe("接続からルームを引く走査", () => {
  it("Given 検出の正規表現 / When 改行を挟んだ書き方を見る / Then 拾う（検出が空振りしないことの確かめ）", () => {
    // Given
    const text = "const r = deps.store\n  .list()\n  .find((r) => findParticipantByConnId(r, connId));";
    // When
    const found = findLookupScans(text, "x.ts");
    // Then
    expect(found).toEqual(["x.ts:2"]); // 行は `.list()` の行
  });

  it("Given src の全ファイル / When 走査の書き方を探す / Then room-lookup.ts の外に 0 件", () => {
    // Given
    const files = [...new Glob("**/*.ts").scanSync(SRC_DIR)];
    // When
    const outside = files
      .filter((f) => f !== CANONICAL)
      .flatMap((f) => findLookupScans(readFileSync(join(SRC_DIR, f), "utf8"), relative(SRC_DIR, join(SRC_DIR, f))));
    // Then
    expect(outside).toEqual([]);
  });
});
