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
