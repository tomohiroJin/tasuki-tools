/**
 * `scripts/audit-test-focus.mjs`（テストの `.only` と理由の無い `.skip`）の自己テスト（#523）。
 *
 * 判定そのものは `lib/focused-skipped-tests.test.mjs`。ここは 2 つを見る:
 * 1. 走査対象の型と組み立て（純粋）
 * 2. **検査本体への配線**。純粋関数だけでは、`main()` から違反時の終了や 0 件ガードを消しても
 *    全件緑のままになる。`scan-target-wiring.test.mjs` と同じ手段（検査スクリプトを書き換えた複製を
 *    `scripts/` 直下へ置いて子プロセスで走らせ、終了コードを見る）で、配線が消えたら落ちるようにする。
 *
 * **複製の接頭辞を `scan-target-wiring.test.mjs` と分けている。** あちらは起動時に自分の接頭辞の
 * 残り物を消す。同じ接頭辞だと、並列に走る別のファイルの複製を消してしまう。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { listRepoFiles } from "./lib/scan-targets.mjs";
import { TEST_FOCUS_FILE_PATTERNS, buildTestFocusFiles } from "./audit-test-focus.mjs";

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = "audit-test-focus.mjs";
const COPY_PREFIX = ".test-focus-wiring-";

let copyCounter = 0;

// 前回の異常終了で残った自分の複製だけを消す（接頭辞で限定）
for (const name of fs.readdirSync(SCRIPTS_DIR)) {
  if (name.startsWith(COPY_PREFIX)) fs.rmSync(path.join(SCRIPTS_DIR, name), { force: true });
}

function countOf(source, needle) {
  return source.split(needle).length - 1;
}

/** 書き換えた複製を `scripts/` 直下で走らせる（`__dirname/..` をリポジトリルートとみなすため同じ場所に置く）。 */
function runScriptCopy(mutate) {
  const mutated = mutate(fs.readFileSync(path.join(SCRIPTS_DIR, SCRIPT), "utf8"));
  const copyPath = path.join(SCRIPTS_DIR, `${COPY_PREFIX}${process.pid}-${copyCounter++}-${SCRIPT}`);
  fs.writeFileSync(copyPath, mutated);
  try {
    const r = spawnSync(process.execPath, [copyPath], { encoding: "utf8" });
    return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", source: mutated };
  } finally {
    fs.rmSync(copyPath, { force: true });
  }
}

/** 書き換える対象が実装に 1 つだけあり、書き換え後に消えていること（no-op の書き換えで偽の緑にしない）。 */
function assertRewritten(source, needle, label) {
  assert.equal(countOf(fs.readFileSync(path.join(SCRIPTS_DIR, SCRIPT), "utf8"), needle), 1, `${label}: 書き換える対象が実装にありません`);
  assert.equal(countOf(source, needle), 0, `${label}: 書き換えられていません`);
}

describe("走査対象の型と組み立て（#523）", () => {
  const REPO = path.resolve(SCRIPTS_DIR, "..");

  test("各パッケージの test ディレクトリの外にあるテスト（e2e の spec・scripts と ui の node --test）も走査対象に入る", () => {
    // Given / When
    const named = listRepoFiles(REPO, TEST_FOCUS_FILE_PATTERNS);
    // Then
    assert.ok(named.some((f) => /^e2e\/specs\/.+\.spec\.ts$/.test(f)), "e2e/specs の *.spec.ts が入っていません");
    assert.ok(named.some((f) => /^scripts\/.+\.test\.mjs$/.test(f)), "scripts の *.test.mjs が入っていません");
    assert.ok(named.some((f) => /^packages\/ui\/tests\/.+\.test\.mjs$/.test(f)), "packages/ui の *.test.mjs が入っていません");
    assert.ok(named.some((f) => f.endsWith(".test.tsx")), "*.test.tsx が入っていません");
  });

  test("型はランナーの既定に合わせる（vitest の .test.js・.test.mts と bun の *_test.ts など）", () => {
    // Given: 実リポジトリではなく、型だけを git の pathspec と同じ規則（* は / を跨ぐ）で当てる
    const toRe = (p) => new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    const matches = (f) => TEST_FOCUS_FILE_PATTERNS.some((p) => toRe(p).test(f));
    // When / Then
    for (const f of [
      "packages/x/test/a.test.js",
      "packages/x/test/a.test.mts",
      "packages/x/test/a.spec.cjs",
      "packages/x/test/a.test.jsx",
      "apps/y/src/z_test.ts",
      "apps/y/src/z_spec.tsx",
    ]) {
      assert.ok(matches(f), `${f} が型に入っていません`);
    }
    assert.ok(!matches("apps/y/src/z.ts"), "テストでないファイルが入っています");
  });

  test("buildTestFocusFiles は test ディレクトリの全ファイルと名前で分かるファイルの和を返し、重なりは読み直さない", () => {
    // Given
    const testDirFiles = new Map([
      ["a/tests/x.test.ts", "X"],
      ["a/tests/setup.ts", "S"],
    ]);
    const read = [];
    // When
    const files = buildTestFocusFiles(testDirFiles, ["a/tests/x.test.ts", "e2e/specs/y.spec.ts"], (rel) => {
      read.push(rel);
      return "Y";
    });
    // Then
    assert.deepEqual([...files.keys()].sort(), ["a/tests/setup.ts", "a/tests/x.test.ts", "e2e/specs/y.spec.ts"]);
    assert.deepEqual(read, ["e2e/specs/y.spec.ts"]);
    assert.equal(files.get("a/tests/x.test.ts"), "X");
  });
});

describe("配線: scripts/audit-test-focus.mjs", () => {
  const CALL = "const problems = checkFocusedOrSkippedTests(files);";
  const INJECT = (code) =>
    `const problems = checkFocusedOrSkippedTests(new Map([...files, ["injected.test.ts", ${JSON.stringify(code)}]]));`;

  test("対照実行: 今のリポジトリは違反が 0 件で、走査量を出す", () => {
    // Given / When: 書き換えない複製
    const r = runScriptCopy((s) => s);
    // Then: 複製して走らせる仕組み自体は緑になれる（これが無いと下の赤が「複製の失敗」でも通る）
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\[audit-test-focus\] 走査対象: test ディレクトリのファイル \d+ \/ 名前で分かるテストファイル \d+ \/ 合計 \d+/);
    assert.match(r.stdout, /\[audit-test-focus\] OK/);
  });

  test("テストファイルに .only があれば、OK を出さずに非ゼロで終了する", () => {
    // Given: 走査対象へ .only を 1 件足した複製
    const r = runScriptCopy((s) => s.replace(CALL, INJECT("it.only('a', () => {});")));
    // Then
    assertRewritten(r.source, CALL, "差し込み");
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /injected\.test\.ts:1 \.only が残っています/);
    assert.doesNotMatch(r.stdout, /\[audit-test-focus\] OK/);
  });

  test("理由の無い .skip があれば非ゼロで終了する", () => {
    // Given: 走査対象へ理由の無い .skip を 1 件足した複製
    const r = runScriptCopy((s) => s.replace(CALL, INJECT("it.skip('a', () => {});")));
    // Then
    assertRewritten(r.source, CALL, "差し込み");
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /injected\.test\.ts:1 \.skip に理由がありません/);
  });

  test("テストファイルの名前の一覧が 0 件なら、走査が空振りしているとして非ゼロで終了する", () => {
    // Given: 名前で分かるテストの一覧を空にした複製
    const needle = "const namedTestPaths = listRepoFiles(REPO_ROOT, TEST_FOCUS_FILE_PATTERNS);";
    const r = runScriptCopy((s) => s.replace(needle, "const namedTestPaths = [];"));
    // Then
    assertRewritten(r.source, needle, "一覧の空化");
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /走査対象が 0 件です.*名前で分かるテストファイル/);
  });

  test("test ディレクトリから読む分が 0 件なら、合計が非ゼロでも非ゼロで終了する", () => {
    // Given: test ディレクトリの読み込みを空にした複製（名前で分かる分だけで合計は 0 にならない）
    const needle = "const testDirFiles = readTestDirFiles();";
    const r = runScriptCopy((s) => s.replace(needle, "const testDirFiles = new Map();"));
    // Then
    assertRewritten(r.source, needle, "test ディレクトリの空化");
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /走査対象が 0 件です.*test ディレクトリのファイル/);
  });
});
