/**
 * 検査スクリプト全体を**導出で**見る配線のテスト（#135・ADR-0014 決定 8）。
 *
 * 0 件ガードが**検査本体へ配線されているか**を、検査スクリプトごとに見るテストは
 * `wiring-*.test.mjs` へ分けた（#544。もとは 1 ファイルで 1 回 約 3.5 分かかり、これを `tests` に持つ変異が
 * 変異検査のシャードの偏りを作った）。ここに残すのは、`git ls-files 'scripts/audit-*.mjs'` から
 * 導出して**全件を同じ形で**見る 2 つだけである。
 *
 * 純粋関数（`hasZeroScanTargets` / `findEmptyScanDimensions`）の単体テストだけでは、
 * `main()` からガードを丸ごと削除しても全件緑のままになる。**配線が消えたら落ちる**テストを置く。
 *
 * 手段: 検査スクリプトを**書き換えた複製**を作り、子プロセスで実行して終了コードを見る
 * （補助は `lib/script-copy-harness.mjs`）。追加依存は禁止のため `node:child_process` の `spawnSync` だけを使う。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { listTrackedFiles } from "./lib/scan-targets.mjs";
import { REPO_ROOT, createScriptCopyHarness } from "./lib/script-copy-harness.mjs";

const { runScriptCopy } = createScriptCopyHarness(".scan-target-wiring-");

/**
 * **列挙ではなく導出で見るガード**（#166 / #72 E3）。
 *
 * 検査スクリプトごとの配線のテストは `wiring-*.test.mjs` に手書きで列挙している。列挙は腐るので、
 * 「すべての検査が走査量を名乗る」ことだけは導出で押さえる。新しい検査を足した人が
 * 登録を漏らしても、ここが赤くなる。
 *
 * 権威は `git ls-files`。`fs.readdirSync` は未追跡ファイルを拾い、ローカルと CI で
 * 見えるものが食い違う（`docs/adr/0014` 決定 5）。
 *
 * **`scripts/list-scan-targets.mjs` の KINDS には足していない。** 同モジュールの除外は
 * `rel.startsWith(prefix)` の前方一致しか持たず、`.test.mjs` の後方一致を表現できない。
 * `git ls-files 'scripts/audit-*.mjs'` は自己テストを含む 10 件に一致する（2026-08-18 実測）。
 *
 * `runScriptCopy` が作る複製は `.scan-target-wiring-` 接頭辞なので、追跡下にも `audit-*` の一致にも
 * 入らない。複製が自分自身を走査対象として拾う経路は無い。
 */
describe("走査量の出力: すべての audit-*.mjs が名乗る（導出で見る）", () => {
  const AUDITS = listTrackedFiles(REPO_ROOT, ["scripts/audit-*.mjs"])
    .map((rel) => path.basename(rel))
    .filter((name) => !name.endsWith(".test.mjs"));

  test("走査対象の検査スクリプトが 0 件でない（このガード自身の空振り検出）", () => {
    // 下限は「非空」だけにする。`>= 5` のような固定値は ADR-0014 決定 8 の MUST NOT。
    assert.ok(AUDITS.length > 0, "audit-*.mjs が 0 件（このガードが空振りしている）");
  });

  for (const name of AUDITS) {
    test(`${name} は走査量を出力する（ADR-0014 決定 6）`, () => {
      // Given / When（恒等関数なので対照実行）
      const r = runScriptCopy(name, (s) => s);
      // Then
      assert.match(r.stdout, /走査対象: /, `${name} が走査量を名乗っていない`);
    });
  }
});

/**
 * CI への配線: すべての `audit-*.mjs` が ci.yml から呼ばれる（#320・設計正本 D12）。
 *
 * 上の「走査量の出力」は検査が**走れば**名乗ることを見るが、**CI が走らせているか**は見ない。
 * ci.yml の行は 1 本ずつ手で足しており、書き忘れると自己テストだけが CI で緑になって、実リポジトリの
 * 走査は一度も走らない。列挙ではなく導出で見る。
 */
describe("CI への配線: すべての audit-*.mjs が ci.yml から呼ばれる（導出で見る）", () => {
  const audits = listTrackedFiles(REPO_ROOT, ["scripts/audit-*.mjs"])
    .map((rel) => path.basename(rel))
    .filter((name) => !name.endsWith(".test.mjs"));
  const ci = fs.readFileSync(path.join(REPO_ROOT, ".github/workflows/ci.yml"), "utf8");

  test("検査スクリプトが 0 件でない（このガード自身の空振り検出）", () => {
    assert.ok(audits.length > 0, "audit-*.mjs が 0 件（このガードが空振りしている）");
  });

  for (const name of audits) {
    test(`${name} を ci.yml が呼ぶ`, () => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(ci, new RegExp(`^\\s*- run: node scripts/${escaped}\\s*$`, "m"), `${name} が ci.yml から呼ばれていない`);
    });
  }
});
