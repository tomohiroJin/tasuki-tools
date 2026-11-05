/**
 * audit-assembly-wiring.mjs の 0 件ガードの配線を見るテスト（#135・ADR-0014 決定 8）。
 *
 * `scan-target-wiring.test.mjs`（1 回 約 3.5 分）を検査スクリプトごとに分けた 1 つ（#544）。
 * 変異の `tests` を関係するファイルだけにして、変異ごとの対照実行・検出の実行を短くし、
 * 変異検査のシャードの偏りを小さくする。手段・理由は `lib/script-copy-harness.mjs` と元のファイルの先頭に同じ。
 * 複製の接頭辞は `.wiring-assembly-`（他のファイルと重ならない。`script-copy-harness.test.mjs` が見る）。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createScriptCopyHarness, countOf } from "./lib/script-copy-harness.mjs";

const { runScriptCopy } = createScriptCopyHarness(".wiring-assembly-");

describe("0 件ガードの配線: scripts/audit-assembly-wiring.mjs", () => {
  test("対照実行: 書き換えない複製は exit 0 で走査量を出す", () => {
    // Given: 複製するだけで中身は変えない
    // When
    const r = runScriptCopy("audit-assembly-wiring.mjs", (s) => s);
    // Then
    assert.equal(r.status, 0, `対照実行が緑になりません:\n${r.stderr}`);
    assert.match(r.stdout, /\[audit-assembly-wiring\] 走査対象: \d+ 組 \/ \d+ ファイル/);
  });

  test("宣言を空にすると非ゼロで終了する（検査が丸ごと空振りする経路）", () => {
    // Given: ASSEMBLY_TARGETS の中身を消す。宣言が空なら「問題 0 件」で緑になってしまう
    const mutate = (s) =>
      s.replace(/export const ASSEMBLY_TARGETS = \[[\s\S]*?\n\];/, "export const ASSEMBLY_TARGETS = [];");
    // When
    const r = runScriptCopy("audit-assembly-wiring.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "export const ASSEMBLY_TARGETS = [];"), 1, "宣言を空にできていません");
    assert.equal(countOf(r.source, 'entry: "apps/'), 0, "宣言の中身が残っています");
    // Then: 0 件ガードが落とす
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /検査する組が 0 件です/);
  });

  test("エントリの経由が切れると非ゼロで終了する（判定が main へ配線されている）", () => {
    // Given: 判定の呼び出しを消す。純粋関数の単体テストだけでは、main から
    //        findAssemblyProblems を呼ばなくなった状態を検知できない
    const mutate = (s) =>
      s.replace(
        "const problems = ASSEMBLY_TARGETS.flatMap((t) => findAssemblyProblems(t, sources));",
        "const problems = ASSEMBLY_TARGETS.flatMap((t) => [`配線が消えた: ${t.entry}`]);",
      );
    // When
    const r = runScriptCopy("audit-assembly-wiring.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "findAssemblyProblems(t, sources)"), 0, "判定の呼び出しを壊せていません");
    // Then: 差し込んだ問題がそのまま赤として出る（＝main が problems を見て終了コードを決めている）
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /配線が消えた: apps\/tasuki-sync\/src\/server\.ts/);
  });
});
