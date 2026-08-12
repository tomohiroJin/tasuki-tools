import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decideScope, parseDiffOutput, formatOutputs } from "./ci-scope.mjs";

describe("decideScope", () => {
  test("文書だけの変更では code も deps も false", () => {
    // Given
    const files = ["docs/adr/0009-ci-scope-and-checks.md", "README.md"];
    // When / Then
    assert.deepEqual(decideScope(files), { code: false, deps: false });
  });

  test("コードが 1 行でも混ざれば code は true", () => {
    // Given
    const files = ["docs/README.md", "packages/timer-core/src/evolve.ts"];
    // When / Then
    assert.equal(decideScope(files).code, true);
  });

  test("lockfile の変更で deps が true", () => {
    assert.deepEqual(decideScope(["pnpm-lock.yaml"]), { code: true, deps: true });
  });

  test("どの階層の package.json でも deps が true", () => {
    assert.equal(decideScope(["apps/timer-web/package.json"]).deps, true);
    assert.equal(decideScope(["package.json"]).deps, true);
    assert.equal(decideScope(["pnpm-workspace.yaml"]).deps, true);
  });

  test("package.json に似た別名を deps と誤認しない", () => {
    // Given: package.json ではないファイル
    // When / Then
    assert.equal(decideScope(["docs/my-package.json.md"]).deps, false);
    assert.equal(decideScope(["scripts/not-package.json"]).deps, false);
  });

  test("未知の拡張子は走らせる側へ倒す", () => {
    // Given: 分類の付かないファイル
    // When / Then
    assert.equal(decideScope(["foo.txt"]).code, true);
    assert.equal(decideScope([".github/workflows/ci.yml"]).code, true);
    assert.equal(decideScope(["turbo.json"]).code, true);
  });

  test("差分が空なら全部走らせる（fail-open）", () => {
    assert.deepEqual(decideScope([]), { code: true, deps: true });
  });

  test("配列でない入力でも全部走らせる（fail-open）", () => {
    assert.deepEqual(decideScope(null), { code: true, deps: true });
    assert.deepEqual(decideScope(undefined), { code: true, deps: true });
  });
});

describe("parseDiffOutput", () => {
  test("改行区切りを配列にし、空行を落とす", () => {
    // Given: git diff --name-only の出力（末尾に改行）
    const stdout = "docs/a.md\npackages/timer-core/src/evolve.ts\n\n";
    // When / Then
    assert.deepEqual(parseDiffOutput(stdout), ["docs/a.md", "packages/timer-core/src/evolve.ts"]);
  });

  test("空の出力は空配列", () => {
    assert.deepEqual(parseDiffOutput(""), []);
    assert.deepEqual(parseDiffOutput("\n"), []);
  });
});

describe("formatOutputs", () => {
  test("GITHUB_OUTPUT の形式で書き出す", () => {
    // Given
    const scope = { code: true, deps: false };
    // When / Then
    assert.equal(formatOutputs(scope), "code=true\ndeps=false\n");
  });
});
