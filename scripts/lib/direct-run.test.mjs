import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDirectRun } from "./direct-run.mjs";

/**
 * 直接実行の判定（#197）。
 *
 * 判定対象の「モジュール」にはこのテストファイル自身を使う。専用の
 * フィクスチャを置くより、`import.meta.url` と実体パスの両方をその場で
 * 取れる分だけ前提が少ない。
 */

const SELF_URL = import.meta.url;
const SELF_PATH = fileURLToPath(SELF_URL);
const LIB_DIR = path.dirname(SELF_PATH);

/** 一時ディレクトリを作って渡し、後片付けする。 */
function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "direct-run-test-"));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("isDirectRun", () => {
  test("実体パスで起動されたときは真", () => {
    // Given / When / Then
    assert.equal(isDirectRun(SELF_URL, SELF_PATH), true);
  });

  test("symlink 経由で起動されたときも真（無出力・exit 0 で素通りする経路）", () => {
    // Given: 自分自身を指す symlink。文字列としては実体パスと一致しない
    withTempDir((dir) => {
      const link = path.join(dir, "linked-direct-run.test.mjs");
      fs.symlinkSync(SELF_PATH, link);
      assert.notEqual(link, SELF_PATH, "symlink と実体が同じパスでは、この前提が崩れます");
      // When / Then
      assert.equal(isDirectRun(SELF_URL, link), true);
    });
  });

  test("親ディレクトリが symlink のときも真（リンクされるのはファイルとは限らない）", () => {
    // Given: scripts/lib を指す symlink の下に自分自身がある形
    withTempDir((dir) => {
      const linkedDir = path.join(dir, "linked-lib");
      fs.symlinkSync(LIB_DIR, linkedDir);
      const viaDir = path.join(linkedDir, path.basename(SELF_PATH));
      // When / Then
      assert.equal(isDirectRun(SELF_URL, viaDir), true);
    });
  });

  test("相対パスで起動されたときも真（argv[1] は絶対パスとは限らない）", () => {
    // Given: 実行時の作業ディレクトリからの相対パス
    const relative = path.relative(process.cwd(), SELF_PATH);
    assert.ok(!path.isAbsolute(relative), "相対パスになっていません");
    // When / Then
    assert.equal(isDirectRun(SELF_URL, relative), true);
  });

  test("別のファイルから読み込まれたときは偽（import では main を呼ばない）", () => {
    // Given / When / Then
    assert.equal(isDirectRun(SELF_URL, path.join(LIB_DIR, "scan-targets.mjs")), false);
  });

  test("argv[1] が無い起動（node -e など）は偽", () => {
    // Given / When / Then
    assert.equal(isDirectRun(SELF_URL, undefined), false);
    assert.equal(isDirectRun(SELF_URL, ""), false);
  });

  test("実在しないパスは偽", () => {
    // Given / When / Then
    assert.equal(isDirectRun(SELF_URL, path.join(LIB_DIR, "does-not-exist.mjs")), false);
  });

  test("解決できない理由が「存在しない」以外なら投げる（静かな exit 0 に戻さない）", () => {
    // Given: 自分自身を指す symlink のループ。realpath は ELOOP で落ちる
    withTempDir((dir) => {
      const a = path.join(dir, "loop-a.mjs");
      const b = path.join(dir, "loop-b.mjs");
      fs.symlinkSync(b, a);
      fs.symlinkSync(a, b);
      assert.throws(
        // When / Then: 握り潰して偽を返すと、検査は何も実行せず exit 0 で終わる
        () => isDirectRun(SELF_URL, a),
        (e) => e.code === "ELOOP",
        "ELOOP を握り潰しています",
      );
    });
  });
});
