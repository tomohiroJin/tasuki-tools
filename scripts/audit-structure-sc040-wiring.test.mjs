/**
 * SC-040 が**検査本体へ配線されているか**を見るテスト（#523）。
 *
 * 純粋関数（`focused-skipped-tests.test.mjs`）だけでは、`main()` から違反時の終了や 0 件ガードを
 * 消しても全件緑のままになる。`scan-target-wiring.test.mjs` と同じ手段（検査スクリプトを書き換えた
 * 複製を `scripts/` 直下へ置いて子プロセスで走らせ、終了コードを見る）で、配線が消えたら落ちるようにする。
 *
 * **複製の接頭辞を `scan-target-wiring.test.mjs` と分けている。** あちらは起動時に自分の接頭辞の
 * 残り物を消す。同じ接頭辞だと、並列に走る別のファイルの複製を消してしまう。
 * 別ファイルに分けたのは、あちらが重く（全 audit の複製を走らせる）、変異検査（940 番台）が
 * SC-040 の配線だけを速く確かめられるようにするため。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = "audit-structure.mjs";
const COPY_PREFIX = ".sc040-wiring-";

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

describe("SC-040 の配線: scripts/audit-structure.mjs（#523）", () => {
  const CALL = "const sc040Problems = sc040FocusedOrSkippedTests(sc040Files);";
  const INJECT = (code) =>
    `const sc040Problems = sc040FocusedOrSkippedTests(new Map([...sc040Files, ["injected.test.ts", ${JSON.stringify(code)}]]));`;

  test("対照実行: 今のリポジトリは SC-040 が 0 件で、走査量と指標を出す", () => {
    // Given / When: 書き換えない複製
    const r = runScriptCopy((s) => s);
    // Then: 複製して走らせる仕組み自体は緑になれる（これが無いと下の赤が「複製の失敗」でも通る）
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\[audit-structure\] SC-040 の走査対象: \d+ ファイル/);
    assert.match(r.stdout, /^SC040 \| 0 \| 0 \| PASS$/m);
  });

  test("テストファイルに .only があれば、指標の表を出さずに非ゼロで終了する", () => {
    // Given: 走査対象へ .only を 1 件足した複製
    const r = runScriptCopy((s) => s.replace(CALL, INJECT("it.only('a', () => {});")));
    // Then
    assertRewritten(r.source, CALL, "差し込み");
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /SC-040 injected\.test\.ts:1 \.only が残っています/);
    assert.doesNotMatch(r.stdout, /^SC040 \|/m);
  });

  test("理由の無い .skip があれば非ゼロで終了する", () => {
    // Given: 走査対象へ理由の無い .skip を 1 件足した複製
    const r = runScriptCopy((s) => s.replace(CALL, INJECT("it.skip('a', () => {});")));
    // Then
    assertRewritten(r.source, CALL, "差し込み");
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /SC-040 injected\.test\.ts:1 \.skip に理由がありません/);
  });

  test("テストファイルの名前の一覧が 0 件なら、走査が空振りしているとして非ゼロで終了する", () => {
    // Given: 名前で分かるテストの一覧を空にした複製
    const needle = "const namedTestPaths = listRepoFiles(REPO_ROOT, SC040_TEST_FILE_PATTERNS);";
    const r = runScriptCopy((s) => s.replace(needle, "const namedTestPaths = [];"));
    // Then
    assertRewritten(r.source, needle, "一覧の空化");
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /SC-040 の走査対象が 0 件です/);
  });
});
