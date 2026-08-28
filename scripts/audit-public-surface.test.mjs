import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { findWildcardReexports } from "./audit-public-surface.mjs";

describe("findWildcardReexports: export * を見つける", () => {
  test("export * があれば行番号つきで報告する", () => {
    // Given
    const sources = new Map([["packages/x/src/index.ts", "export * from './a';\n"]]);
    // When
    const problems = findWildcardReexports(sources);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /packages\/x\/src\/index\.ts:1/);
  });

  test("明示列挙は問題にしない", () => {
    // Given
    const sources = new Map([
      ["packages/x/src/index.ts", "export { a, b } from './a';\nexport type { C } from './a';\n"],
    ]);
    // When
    const problems = findWildcardReexports(sources);
    // Then
    assert.deepEqual(problems, []);
  });

  test("ブロックコメントの中の export * は誤検出しない", () => {
    // Given（timer-core の index.ts が実際にこの形の docstring を持つ）
    const sources = new Map([
      ["packages/x/src/index.ts", "/**\n * `export *` を明示列挙に置換したもの。\n */\nexport { a } from './a';\n"],
    ]);
    // When
    const problems = findWildcardReexports(sources);
    // Then
    assert.deepEqual(problems, []);
  });

  test("行コメントの中の export * も誤検出しない", () => {
    // Given
    const sources = new Map([["packages/x/src/index.ts", "// export * from './a';\n"]]);
    // When
    const problems = findWildcardReexports(sources);
    // Then
    assert.deepEqual(problems, []);
  });

  test("名前つきの再エクスポート（export * as ns）も報告する", () => {
    // Given
    const sources = new Map([["packages/x/src/index.ts", "export * as ns from './a';\n"]]);
    // When
    const problems = findWildcardReexports(sources);
    // Then
    assert.equal(problems.length, 1);
  });

  test("複数行にまたがって複数あればすべて報告する", () => {
    // Given
    const sources = new Map([
      ["packages/x/src/index.ts", "export * from './a';\nexport { b } from './b';\nexport * from './c';\n"],
    ]);
    // When
    const problems = findWildcardReexports(sources);
    // Then
    assert.equal(problems.length, 2);
  });
});

describe("findWildcardReexports: 剥がしすぎで緑に倒れない（#184）", () => {
  test("正規表現リテラルの後ろの export * も報告する", () => {
    // Given（`/it's/` のアポストロフィを文字列開始と誤読すると以降が消える形）
    const sources = new Map([
      ["packages/x/src/index.ts", "const re = /it's/;\nexport * from './a';\n"],
    ]);
    // When
    const problems = findWildcardReexports(sources);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /packages\/x\/src\/index\.ts:2/);
  });

  test("アポストロフィを含まない同じ形でも報告する（対照）", () => {
    // Given
    const sources = new Map([
      ["packages/x/src/index.ts", "const re = /its/;\nexport * from './a';\n"],
    ]);
    // When
    const problems = findWildcardReexports(sources);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /packages\/x\/src\/index\.ts:2/);
  });

  test("行頭以外の export * も報告する", () => {
    // Given
    const sources = new Map([
      ["packages/x/src/index.ts", "const x = 1; export * from './a';\n"],
    ]);
    // When
    const problems = findWildcardReexports(sources);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /packages\/x\/src\/index\.ts:1/);
  });

  test("ブロックコメントの後ろでも報告する行番号が元ファイルと一致する", () => {
    // Given（ブロックコメントは 5 行。export * は 6 行目にある）
    const sources = new Map([
      ["packages/x/src/index.ts", "/*\n * a\n * b\n * c\n */\nexport * from './a';\n"],
    ]);
    // When
    const problems = findWildcardReexports(sources);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /packages\/x\/src\/index\.ts:6/);
  });

  test("文字列リテラルの中の export * も報告する（過剰報告＝安全側に倒す）", () => {
    // Given（コメント行ではないので、中身が文字列でも赤に倒す）
    const sources = new Map([
      ["packages/x/src/index.ts", 'const s = "export * は使わない";\n'],
    ]);
    // When
    const problems = findWildcardReexports(sources);
    // Then
    assert.equal(problems.length, 1);
  });
});
