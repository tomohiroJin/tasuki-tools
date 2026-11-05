/**
 * 複製の補助（`lib/script-copy-harness.mjs`）のテスト（#544）。
 *
 * 検査スクリプトの複製を作って走らせるテストは、ファイルごとに分かれて**同時に走りうる**。
 * 起動時の掃除は接頭辞の一致で消すので、接頭辞が別のファイルの接頭辞の前方一致になっていると、
 * 片方の起動が他方の複製を消して、走行中のテストが原因の分かりにくい失敗になる。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SCRIPTS_DIR, createScriptCopyHarness } from "./lib/script-copy-harness.mjs";

const SELF = "script-copy-harness.test.mjs";

/** scripts/ 直下のテストが宣言している複製の接頭辞を、ファイルごとに集める（導出）。 */
function collectPrefixes() {
  const found = [];
  for (const name of fs.readdirSync(SCRIPTS_DIR).filter((n) => n.endsWith(".test.mjs") && n !== SELF)) {
    const source = fs.readFileSync(path.join(SCRIPTS_DIR, name), "utf8");
    for (const m of source.matchAll(/createScriptCopyHarness\("([^"]+)"\)|const COPY_PREFIX = "([^"]+)"/g)) {
      found.push({ file: name, prefix: m[1] ?? m[2] });
    }
  }
  return found;
}

describe("複製の接頭辞はファイルごとに分かれている", () => {
  const found = collectPrefixes();

  test("接頭辞を宣言しているテストが 0 件でない（この導出自身の空振り検出）", () => {
    assert.ok(found.length > 0, "接頭辞が 1 件も見つかりません");
    assert.ok(
      found.some((f) => f.file.startsWith("wiring-")),
      "wiring-*.test.mjs の接頭辞が見つかりません",
    );
  });

  test("どの接頭辞も、別のファイルの接頭辞と前方一致しない", () => {
    const clashes = [];
    for (const a of found) {
      for (const b of found) {
        if (a !== b && a.prefix.startsWith(b.prefix)) {
          clashes.push(`${a.file} の ${a.prefix} が ${b.file} の ${b.prefix} で始まる`);
        }
      }
    }
    assert.deepEqual(clashes, []);
  });
});

describe("createScriptCopyHarness", () => {
  test("起動時の掃除は自分の接頭辞の残骸だけを消し、別の接頭辞のものは消さない", () => {
    // Given: 自分の接頭辞と、別の接頭辞の残骸
    const mine = path.join(SCRIPTS_DIR, ".harness-selftest-a-leftover.mjs");
    const other = path.join(SCRIPTS_DIR, ".harness-selftest-b-leftover.mjs");
    fs.writeFileSync(mine, "");
    fs.writeFileSync(other, "");
    try {
      // When
      createScriptCopyHarness(".harness-selftest-a-");
      // Then
      assert.equal(fs.existsSync(mine), false, "自分の接頭辞の残骸が残っています");
      assert.equal(fs.existsSync(other), true, "別の接頭辞の複製を消しています");
    } finally {
      fs.rmSync(mine, { force: true });
      fs.rmSync(other, { force: true });
    }
  });

  test("複製を走らせて結果を返し、複製を残さない。書き換えが反映される", () => {
    const { runScriptCopy } = createScriptCopyHarness(".harness-selftest-c-");
    const r = runScriptCopy("check-links.mjs", () => "console.log('copied'); process.exitCode = 3;");
    assert.equal(r.status, 3);
    assert.equal(r.stdout.trim(), "copied");
    assert.deepEqual(
      fs.readdirSync(SCRIPTS_DIR).filter((n) => n.startsWith(".harness-selftest-c-")),
      [],
    );
  });

  test("形の不正な接頭辞（`.` で始まらない・`-` で終わらない）は受け付けない", () => {
    assert.throws(() => createScriptCopyHarness("wiring-"));
    assert.throws(() => createScriptCopyHarness(".wiring"));
  });
});
