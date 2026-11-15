/**
 * 「表示名の正規化は `display-name-rule.ts` の 1 か所から呼ぶ」を守るテスト（#596）。
 *
 * 契約（`packages/room-core/src/display-name.ts` の `normalizeDisplayName` の docstring）:
 * **正規化の結果は空文字になりうる。空の可否は呼び出し側で判定する。** 戻り値の型は `string` で、
 * 空を型で表せない（`NonEmptyString` の型を作ると、全入口の書き換えが要る）。代わりに、
 * 判定を持つ `applyDisplayNameRule`（空・字面の無い名前・上限を判定する）を**唯一の呼び出し元**にして、
 * 入口が直接 `normalizeDisplayName` を呼んで空の判定を忘れる形を止める。
 *
 * 実害の例（`display-name-rule.ts` の docstring）: S5a のハブの入口は `normalizeDisplayName(raw) === null` を
 * 見ていたが、この関数は `string` しか返さないので、空文字も 1000 文字も素通りしていた。
 *
 * 見るのは字面である: `normalizeDisplayName` という語が、`src` のどのファイルに現れるか。
 * **見逃す書き方**: 別名の import（`import { normalizeDisplayName as n }` は語として現れるので拾う）・
 * 再エクスポート経由・文字列で組み立てた参照。書く理由が無いので追わない。
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { Glob } from "bun";

const SRC_DIR = join(import.meta.dir, "..", "src");
const CANONICAL = "application/display-name-rule.ts";

/** コメント行を除いた行から、語の出現位置（`ファイル:行`）を返す。 */
export function findNormalizerUses(text: string, file: string): string[] {
  return text
    .split("\n")
    .flatMap((line, i) =>
      /^\s*(\/\/|\*|\/\*)/.test(line) || !/\bnormalizeDisplayName\b/.test(line) ? [] : [`${file}:${i + 1}`],
    );
}

describe("表示名の正規化の呼び出し元", () => {
  it("Given 検出の書き方 / When コードとコメントを見る / Then コードの行だけを拾う（検出が空振りしないことの確かめ）", () => {
    // Given
    const text = ["// normalizeDisplayName の説明", " * normalizeDisplayName も", "const n = normalizeDisplayName(raw);"].join("\n");
    // When / Then
    expect(findNormalizerUses(text, "x.ts")).toEqual(["x.ts:3"]);
  });

  it("WHEN src のコードが normalizeDisplayName を呼ぶ THE 呼び出し元 SHALL display-name-rule.ts だけである（空の可否はそこで判定する）", () => {
    // Given
    const files = [...new Glob("**/*.ts").scanSync(SRC_DIR)];
    // When
    const uses = files.flatMap((f) => findNormalizerUses(readFileSync(join(SRC_DIR, f), "utf8"), relative(SRC_DIR, join(SRC_DIR, f))));
    // Then: 前提の確認（唯一の呼び出し元が見えている＝走査が空振りしていない）と、外が 0 件であること
    expect(uses.some((u) => u.startsWith(`${CANONICAL}:`))).toBe(true);
    expect(uses.filter((u) => !u.startsWith(`${CANONICAL}:`))).toEqual([]);
  });
});
