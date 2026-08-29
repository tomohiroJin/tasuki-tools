import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
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
 * 3. **エントリポイントの判定の配線** — 直接実行のときだけ `main()` を呼ぶ判定が、
 *    symlink 経由の起動でも成立すること。ここが壊れると検査は何も実行せず
 *    exit 0 で終わる（憲法 VII が最も嫌う失敗の型）。判定そのものの単体テストは
 *    共有ヘルパ側（`scripts/lib/direct-run.test.mjs`）にある。このスクリプトは
 *    起動に数分かかるため `entry-point-wiring.test.mjs` の実起動から外してあり、
 *    **symlink 経由で走ることを見るのはここだけ**である（#197）。
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


/**
 * mutation-check.mjs の複製だけを置いた使い捨てのリポジトリを作る。
 *
 * **なぜ本物の `scripts/mutation-check.mjs` を直接起動しないか。** `main()` の先頭は
 * `recoverFromCrashedRun()` であり、適用中マーカー（`scripts/mutations/.applied`）が
 * あれば `git checkout --` で作業ツリーを復元する。`mutation-check --full` は
 * `scripts/` 全体のテストを走らせるので、その中からここが本物を起動すると、
 * 実行中の変異を横から戻して検査そのものを壊す。複製を置いた別リポジトリなら、
 * マーカーも変異も存在しないのでその経路に触れない。
 *
 * 複製した `main()` は `assertMutationTestsExist()` で必ず落ちる（対応表のテストが
 * 1 件も無いため）。**「main() が走ったこと」の観測点はこの出力である。**
 */
function makeMutationCheckSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mutation-check-entry-"));
  fs.mkdirSync(path.join(root, "scripts", "lib"), { recursive: true });
  // lib は**列挙せずディレクトリごと**写す。名前を並べると、取り込みを 1 本足した
  // だけで足場が壊れ、原因が「解決できないモジュール」として遠くに出る（#197）。
  const libFiles = fs
    .readdirSync(path.join(SCRIPTS_DIR, "lib"))
    .filter((n) => n.endsWith(".mjs") && !n.endsWith(".test.mjs"))
    .map((n) => path.join("lib", n));
  for (const rel of ["mutation-check.mjs", ...libFiles]) {
    fs.copyFileSync(path.join(SCRIPTS_DIR, rel), path.join(root, "scripts", rel));
  }
  // 複製先でも `git rev-parse --show-toplevel` が解決できるようにする。
  execFileSync("git", ["init", "-q", root]);
  return root;
}

/** main() が走ったことを示す出力（assertMutationTestsExist の第一声）。 */
const MAIN_RAN = /検出を期待するテストファイルが見つかりません/;

describe("エントリポイントの判定", () => {
  test("symlink 経由で起動しても main() が走る（#191 の回帰）", () => {
    // Given: 複製リポジトリと、その複製を指す symlink
    const root = makeMutationCheckSandbox();
    const linkDir = fs.mkdtempSync(path.join(os.tmpdir(), "mutation-check-link-"));
    const real = path.join(root, "scripts", "mutation-check.mjs");
    const link = path.join(linkDir, "linked-mutation-check.mjs");
    fs.symlinkSync(real, link);
    try {
      // 対照: 実体パスで起動したとき、この足場から本当に出力が出ることを先に見る。
      const control = spawnSync(process.execPath, [real], { encoding: "utf8" });
      assert.match(control.stderr, MAIN_RAN, "対照（実体パス起動）で main() が走っていません。足場が壊れています");
      assert.equal(control.status, 1, "対照の exit code");

      // When: symlink 経由で起動する
      const viaLink = spawnSync(process.execPath, [link], { encoding: "utf8" });

      // Then: 無出力・exit 0 で素通りしてはならない
      assert.match(
        viaLink.stderr,
        MAIN_RAN,
        `symlink 経由で main() が走っていません（exit ${viaLink.status} / stdout ${JSON.stringify(viaLink.stdout)} / stderr ${JSON.stringify(viaLink.stderr)}）`,
      );
      assert.equal(viaLink.status, 1, "symlink 経由の exit code");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(linkDir, { recursive: true, force: true });
    }
  });
});
