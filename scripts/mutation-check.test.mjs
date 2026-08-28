import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectRunner, buildCommand, MUTATIONS } from "./mutation-check.mjs";

/**
 * `scripts/mutation-check.mjs` の自己テスト（#174）。
 *
 * 主題は**ランナーの決め方**である。`detectRunner` が `<pkg>/package.json` の
 * `scripts.test` だけを手がかりにしていたため、`package.json` を持たない
 * `scripts/` は変異対象にできなかった（例外で落ちた）。
 *
 * ここでは次の 2 つを分けて見る。
 *
 * 1. **既定の規則そのもの** — 「`package.json` が無いディレクトリは `node --test`」。
 *    設定を持たないディレクトリで設定なしに動く唯一のランナーだからこう決めた。
 *    `pkgDir` の名前を見て `scripts` なら node、という特別扱いではないことを、
 *    実在しない一時ディレクトリでも同じ結果になることで示す。
 * 2. **宣言から実行コマンドまでの配線** — 宣言（`MUTATIONS`）に並ぶすべての対象で
 *    ランナーが決まり、絞り込み・全体の両モードでコマンドが組めること。対象を
 *    足したときに落ちるのはここである。**件数は書かない**（宣言そのものを回す）。
 */

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(SCRIPTS_DIR, "..");

/** package.json の中身を指定した一時ディレクトリを作る。null なら置かない。 */
function makePkgDir(pkgJsonText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mutation-check-test-"));
  if (pkgJsonText !== null) fs.writeFileSync(path.join(dir, "package.json"), pkgJsonText, "utf8");
  return dir;
}

describe("detectRunner: ランナーの決め方", () => {
  test("package.json を持たないディレクトリは node を既定にする", () => {
    // Given: package.json を置かない一時ディレクトリ（名前に scripts を含まない）
    const dir = makePkgDir(null);
    try {
      // When / Then: 名前ではなく「設定が無いこと」で決まる
      assert.equal(detectRunner(dir), "node");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("scripts/ 自身が node と判定される（#174 の回帰）", () => {
    // Given: まず前提を確かめる。scripts/package.json は実在しない
    assert.equal(
      fs.existsSync(path.join(SCRIPTS_DIR, "package.json")),
      false,
      "scripts/package.json が生えています。この前提が崩れるとこのテストは意味を失います",
    );
    // When / Then
    assert.equal(detectRunner(SCRIPTS_DIR), "node");
  });

  test("scripts.test から bun / node / vitest を判定する（既存の規則は変えない）", () => {
    // Given / When / Then
    for (const [testScript, expected] of [
      ["bun test", "bun"],
      ["node --test tests/*.test.mjs", "node"],
      ["vitest run", "vitest"],
    ]) {
      const dir = makePkgDir(JSON.stringify({ scripts: { test: testScript } }));
      try {
        assert.equal(detectRunner(dir), expected, `"${testScript}" の判定`);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  test("package.json はあるが判定できないときは例外（既定へ倒さない）", () => {
    // Given: 未知のランナー
    const dir = makePkgDir(JSON.stringify({ scripts: { test: "jest" } }));
    try {
      // When / Then: 黙って node で走らせると「テストを 1 件も実行せずに検出」になる
      assert.throws(() => detectRunner(dir), /未知のテストランナー/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("package.json が壊れているときは例外（『無い』と『読めない』を混ぜない）", () => {
    // Given: JSON として壊れた package.json
    const dir = makePkgDir("{ this is not json");
    try {
      // When / Then: 既定へ倒れると、読めない設定を黙って無視することになる
      assert.throws(() => detectRunner(dir), /package.json の読み込みに失敗しました/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("宣言から実行コマンドまでの配線", () => {
  // 件数は書かない。宣言（MUTATIONS）そのものを回すので、対象を足せば自動で増える。
  test("宣言したすべての変異でランナーが決まる", () => {
    // Given / When / Then
    for (const m of MUTATIONS) {
      const pkgDir = path.join(WORKSPACE_ROOT, m.pkg);
      assert.doesNotThrow(() => detectRunner(pkgDir), `変異 #${m.id}（${m.pkg}）`);
    }
  });

  test("宣言したすべての変異で絞り込み実行のコマンドが組め、対応表のテストを引数に持つ", () => {
    // Given / When / Then
    for (const m of MUTATIONS) {
      const runner = detectRunner(path.join(WORKSPACE_ROOT, m.pkg));
      const { cmd, args } = buildCommand(runner, m, false);
      assert.ok(cmd, `変異 #${m.id} のコマンドが空`);
      for (const t of m.tests) {
        assert.ok(args.includes(t), `変異 #${m.id} の引数に ${t} が無い（args: ${args.join(" ")}）`);
      }
    }
  });

  test("宣言したすべての変異でパッケージ全体実行のコマンドが組める", () => {
    // Given / When / Then
    for (const m of MUTATIONS) {
      const runner = detectRunner(path.join(WORKSPACE_ROOT, m.pkg));
      assert.doesNotThrow(() => buildCommand(runner, m, true), `変異 #${m.id}（${m.pkg}）`);
    }
  });

  test("package.json を持たない対象の --full は node --test をファイル指定なしで走らせる", () => {
    // Given: scripts/ を対象にした変異（scripts.test が無いので読み出せない）
    const mutation = { id: 0, pkg: "scripts", tests: ["list-scan-targets.test.mjs"] };
    // When
    const { cmd, args } = buildCommand("node", mutation, true);
    // Then: node 自身の探索に任せる（対象の列挙をここへ持ち込まない）
    assert.equal(cmd, "node");
    assert.deepEqual(args, ["--test"]);
  });
});
