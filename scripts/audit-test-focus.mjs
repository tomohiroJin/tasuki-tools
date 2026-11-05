#!/usr/bin/env node
/**
 * テストの `.only` と、理由の無い `.skip` / `.skipIf` / `.runIf` / `.todo` / `.fixme` を止める（#523）。
 *
 * 規約は `docs/adr/0006`、機械で守れる規則は検査にする（`docs/adr/0030` 決定 2）。`.only` は 1 つ残ると
 * 同じファイルの他のテストが黙って流れなくなる（Playwright の `forbidOnly` は CI のときだけ効く）。
 * 理由のコメントの形・見るもの・見ないものは `docs/guides/development.md` の「検査系」と
 * `scripts/lib/focused-skipped-tests.mjs`。
 *
 * **構造監査（`audit-structure.mjs`）の外に置く理由。** ADR-0009 D2 は構造監査を「値を出すだけ」と定めており、
 * 測定値は落ちない。この検査は測定値ではなく規約の門（違反が 1 件でもあれば exit 1）なので、
 * D2 を変えずに済ませるため別のスクリプトにした。
 *
 * 走査対象（`Map<リポジトリ相対パス, ソース>`）は 2 つの和:
 * - 構造監査が宣言する各パッケージの test ディレクトリの全ファイル（`SCANNED_PACKAGES`）
 * - ランナー自身の既定が拾う名前（{@link TEST_FOCUS_FILE_PATTERNS}）。`e2e/specs`・`scripts/`・
 *   `packages/ui/tests`・`src` の中なども含む
 *
 * 走査量は成否によらず出す。0 件なら検査が空振りしているとして落とす（ADR-0014 決定 8）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCANNED_PACKAGES, hasScanTarget, readFilesRecursive } from "./audit-structure.mjs";
import { checkFocusedOrSkippedTests } from "./lib/focused-skipped-tests.mjs";
import { isDirectRun } from "./lib/direct-run.mjs";
import { findEmptyScanDimensions, listRepoFiles } from "./lib/scan-targets.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 読むテストファイルの名前（git の pathspec。`*` は `/` を跨ぐ）。
 *
 * **型はランナー自身の既定に合わせる**（ADR-0014 決定 3「実体の権威はツール自身」）:
 * vitest は `**\/*.{test,spec}.?(c|m)[jt]s?(x)`、bun test は `*.test.*` / `*_test.*` / `*.spec.*` / `*_spec.*`。
 * 両方の和を、拡張子 `js jsx ts tsx mjs cjs mts cts` で列挙する。
 *
 * 各パッケージの test ディレクトリの外にあるもの（`e2e/specs`・`scripts/`・`packages/ui/tests`・
 * `src` の中の `*_test.ts` など）をここで足す。test ディレクトリの全ファイルと和を取るので、重なっても害は無い。
 */
export const TEST_FOCUS_EXTENSIONS = ["js", "jsx", "ts", "tsx", "mjs", "cjs", "mts", "cts"];

export const TEST_FOCUS_FILE_PATTERNS = ["test", "spec"].flatMap((kind) =>
  TEST_FOCUS_EXTENSIONS.flatMap((ext) => [
    `*.${kind}.${ext}`,
    `*_${kind}.${ext}`,
  ]),
);

/**
 * 走査対象を組み立てる（`Map<リポジトリ相対パス, ソース>`）。
 * 各パッケージの test ディレクトリの全ファイルと、名前でテストと分かるファイルの和。
 */
export function buildTestFocusFiles(testDirFiles, namedTestPaths, readFile) {
  const files = new Map(testDirFiles);
  for (const rel of namedTestPaths) if (!files.has(rel)) files.set(rel, readFile(rel));
  return files;
}

/**
 * 構造監査が宣言する各パッケージの test ディレクトリの全ファイル（キーはリポジトリ相対パス）。
 * 読む拡張子は走査の型（{@link TEST_FOCUS_EXTENSIONS}）と同じ。補助ファイル（`.mjs`・`.mts` など）も、
 * `describe.only` を定義して取り込まれうる。
 */
export function readTestDirFiles(repoRoot = REPO_ROOT, packages = SCANNED_PACKAGES) {
  const files = new Map();
  for (const d of packages) {
    if (!hasScanTarget(d.test)) continue;
    const dir = `${d.pkg}/${d.test}`;
    for (const [k, v] of readFilesRecursive(path.join(repoRoot, dir), TEST_FOCUS_EXTENSIONS.map((e) => `.${e}`))) {
      files.set(`${dir}/${k}`, v);
    }
  }
  return files;
}

function main() {
  const testDirFiles = readTestDirFiles();
  // `git ls-files` は、作業ツリーで消して未ステージのファイルも返す。実在しないものは読まず、数えない。
  const listed = listRepoFiles(REPO_ROOT, TEST_FOCUS_FILE_PATTERNS);
  const namedTestPaths = listed.filter((rel) => fs.existsSync(path.join(REPO_ROOT, rel)));
  const files = buildTestFocusFiles(testDirFiles, namedTestPaths, (rel) =>
    fs.readFileSync(path.join(REPO_ROOT, rel), "utf8"),
  );
  // 走査量は内訳まで、成否によらず必ず出す（#135 D5・ADR-0014 決定 6）。
  const volume = [
    { label: "test ディレクトリのファイル", count: testDirFiles.size },
    { label: "名前で分かるテストファイル", count: namedTestPaths.length },
    { label: "合計", count: files.size },
  ];
  console.log(`[audit-test-focus] 走査対象: ${volume.map((v) => `${v.label} ${v.count}`).join(" / ")}`);
  // どの内訳も 0 件でないことを見る（ADR-0014 決定 8）。合計だけを見ると、片方が空になっても気づけない。
  const empty = findEmptyScanDimensions(volume);
  if (empty.length > 0) {
    console.error(`[audit-test-focus] 走査対象が 0 件です（検査が空振りします）: ${empty.join(" / ")}`);
    process.exitCode = 1;
    return;
  }
  const problems = checkFocusedOrSkippedTests(files);
  if (problems.length > 0) {
    for (const p of problems) console.error(`[audit-test-focus] ${p}`);
    process.exitCode = 1;
    return;
  }
  console.log("[audit-test-focus] OK（.only 0 件・理由の無い skip 0 件）");
}

// このファイルが直接実行された場合のみ走査する（テストからの import 時は実行しない）。
if (isDirectRun(import.meta.url, process.argv[1])) main();
