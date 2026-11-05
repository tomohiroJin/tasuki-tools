/**
 * audit-public-surface.mjs の 0 件ガードの配線を見るテスト（#135・ADR-0014 決定 8）。
 *
 * `scan-target-wiring.test.mjs`（1 回 約 3.5 分）を検査スクリプトごとに分けた 1 つ（#544）。
 * 変異の `tests` を関係するファイルだけにして、変異ごとの対照実行・検出の実行を短くし、
 * 変異検査のシャードの偏りを小さくする。手段・理由は `lib/script-copy-harness.mjs` と元のファイルの先頭に同じ。
 * 複製の接頭辞は `.wiring-pubsurf-`（他のファイルと重ならない。`script-copy-harness.test.mjs` が見る）。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createScriptCopyHarness, countOf } from "./lib/script-copy-harness.mjs";

const { runScriptCopy } = createScriptCopyHarness(".wiring-pubsurf-");

describe("0 件ガードの配線: scripts/audit-public-surface.mjs", () => {
  test("対照実行: 書き換えない複製は exit 0 で走査量を出す", () => {
    // Given: 複製するだけで中身は変えない
    // When
    const r = runScriptCopy("audit-public-surface.mjs", (s) => s);
    // Then
    assert.equal(r.status, 0, `対照実行が緑になりません:\n${r.stderr}`);
    assert.match(r.stdout, /\[audit-public-surface\] 走査対象: エントリ \d+ 件/);
  });

  test("走査対象のエントリが 0 件になると非ゼロで終了する（検査が丸ごと空振りする経路）", () => {
    // Given: SCANNED_PACKAGES の走査ループそのものを空にする。中身が空なら
    //        「問題 0 件」で緑になってしまう
    const mutate = (s) => s.replace("for (const d of SCANNED_PACKAGES) {", "for (const d of []) {");
    // When
    const r = runScriptCopy("audit-public-surface.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "for (const d of SCANNED_PACKAGES) {"), 0, "走査ループを壊せていません");
    assert.equal(countOf(r.source, "for (const d of []) {"), 1, "書き換えが 1 か所に入っていません");
    // Then: 0 件ガードが落とす
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /走査するエントリが 0 件です/);
  });

  test("判定の呼び出しが切れると非ゼロで終了する（判定が main へ配線されている）", () => {
    // Given: findWildcardReexports の呼び出しを消し、認識できる偽の問題を差し込む。
    //        `findWildcardReexports(` は関数定義（引数名は entrySources）にも現れるため、
    //        呼び出し行にしか現れない綴り `findWildcardReexports(sources)` で数える
    const mutate = (s) =>
      s.replace(
        "const problems = findWildcardReexports(sources);",
        'const problems = ["配線が消えた: 偽の問題"];',
      );
    // When
    const r = runScriptCopy("audit-public-surface.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "findWildcardReexports(sources)"), 0, "判定の呼び出しを壊せていません");
    assert.equal(
      countOf(r.source, 'const problems = ["配線が消えた: 偽の問題"];'),
      1,
      "書き換えが 1 か所に入っていません",
    );
    // Then: 差し込んだ問題がそのまま赤として出る（＝main が problems を見て終了コードを決めている）
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /配線が消えた: 偽の問題/);
  });
});
