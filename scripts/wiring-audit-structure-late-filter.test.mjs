/**
 * audit-structure.mjs の照合より後段での間引きを見るテスト（#135・ADR-0014 決定 8）。
 *
 * `scan-target-wiring.test.mjs`（1 回 約 3.5 分）を検査スクリプトごとに分けた 1 つ（#544）。
 * 変異の `tests` を関係するファイルだけにして、変異ごとの対照実行・検出の実行を短くし、
 * 変異検査のシャードの偏りを小さくする。手段・理由は `lib/script-copy-harness.mjs` と元のファイルの先頭に同じ。
 * 複製の接頭辞は `.wiring-late-`（他のファイルと重ならない。`script-copy-harness.test.mjs` が見る）。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createScriptCopyHarness, countOf } from "./lib/script-copy-harness.mjs";

const { runScriptCopy } = createScriptCopyHarness(".wiring-late-");

describe("照合より後段での間引き: scripts/audit-structure.mjs", () => {
  // 走査対象の照合は指標を出す前に終わっている。**その後で集合を間引く変更**は、
  // 全単射照合にも 0 件ガードにも例外表の健全性にも掛からない。#196 の時点では
  // 走査量の表示にすら痕跡が残らず、出力がバイト単位で同一のまま exit 0 だった
  // （#198。ADR-0014 決定 9 を「呼び出し箇所の数」では満たすが「同一性」では
  // 満たしていなかったのが原因）。ここでは間引きが赤になることを見る。

  /**
   * 出力から走査量を読む。**件数はテストに直書きしない。**
   * 直書きすると、無関係なテストファイルを 1 本足しただけで
   * 「間引きを検知しない」ように見える形でこの配線テストが落ちる。
   */
  function readScanVolume(stdout) {
    const sc039 = stdout.match(/SC-039②③ の走査対象: 照合先 \d+ パッケージ \/ (\d+) ファイル/);
    const tests = stdout.match(/SC-032 の例外表: \d+ 件 \/ 照合先 (\d+) ファイル/);
    assert.ok(sc039, `SC-039 の走査量を読めません:\n${stdout}`);
    assert.ok(tests, `テスト集合の走査量を読めません:\n${stdout}`);
    return { sc039Compared: Number(sc039[1]), testFiles: Number(tests[1]) };
  }

  /** 対照実行の結果。以降のテストはここから実測値を取る。 */
  const control = (() => {
    const r = runScriptCopy("audit-structure.mjs", (s) => s);
    assert.equal(r.status, 0, `対照実行が緑になりません:\n${r.stderr}`);
    return { ...readScanVolume(r.stdout), status: r.status };
  })();

  test("対照実行: 書き換えない複製は exit 0 で走査量を出す", () => {
    // Given / When / Then: 以下の赤が「複製の失敗」ではないことを先に固定する
    assert.equal(control.status, 0);
    assert.ok(control.sc039Compared > 0 && control.testFiles > 0, "走査量が 0 件です");
  });

  test("読み込んだ走査対象そのものを痩せさせると非ゼロで終了する（派生集合を経ない経路）", () => {
    // Given: SC-027 は `loaded` を、SC-035 / SC-039① は個々の srcFiles を直接読む。
    //        派生集合 3 つだけを名乗ると、この経路が丸ごと素通りする（#198 の敵対的検証）
    const mutate = (s) => s.replace("  const sc027 = loaded", "  loaded.pop();\n  const sc027 = loaded");
    // When
    const r = runScriptCopy("audit-structure.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "  loaded.pop();"), 1, "間引きを差し込めていません");
    // Then
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /走査パッケージ: \d+ → \d+/);
  });

  test("パッケージの srcFiles を痩せさせると非ゼロで終了する（同上）", () => {
    // Given
    const mutate = (s) =>
      s.replace(
        "  const serverSources = [...sync.srcFiles.values()];",
        "  sync.srcFiles.delete([...sync.srcFiles.keys()][0]);\n  const serverSources = [...sync.srcFiles.values()];",
      );
    // When
    const r = runScriptCopy("audit-structure.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(
      countOf(r.source, "sync.srcFiles.delete([...sync.srcFiles.keys()][0]);"),
      1,
      "間引きを差し込めていません",
    );
    // Then
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /src ファイル: \d+ → \d+/);
  });

  test("例外表のガードのあとで間引いても非ゼロで終了する（控えの位置を固定する）", () => {
    // Given: 走査量の表示も例外表のガードも終わった位置で間引く。
    //        **控えを組み立て直後ではなくここより後ろへ置くと、間引いた後の値が
    //        そのまま基準値になり突き合わせが素通りする**（#198 の敵対的検証で実測）
    const mutate = (s) =>
      s.replace(
        "  const { results, measured } = runAudit",
        "  allTestFiles.delete([...allTestFiles.keys()][0]);\n  const { results, measured } = runAudit",
      );
    // When
    const r = runScriptCopy("audit-structure.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(
      countOf(r.source, "allTestFiles.delete([...allTestFiles.keys()][0]);"),
      1,
      "間引きを差し込めていません",
    );
    // Then: 表示は間引きの前なので変わらないが、控えは組み立て直後なので落ちる
    const scanned = readScanVolume(r.stdout);
    assert.equal(scanned.testFiles, control.testFiles, "表示が変わっています");
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, new RegExp(`テスト集合: ${control.testFiles} → ${control.testFiles - 1}`));
  });

  test("SC-039 の集合を指標の直前で間引くと非ゼロで終了する", () => {
    // Given: 照合も走査量の表示も終わったあとで、1 件だけ落とす
    const mutate = (s) =>
      s.replace(
        "  const sc039 = sc039UnreachableElements({",
        "  packageSrcFiles.delete([...packageSrcFiles.keys()][0]);\n  const sc039 = sc039UnreachableElements({",
      );
    // When
    const r = runScriptCopy("audit-structure.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(
      countOf(r.source, "packageSrcFiles.delete([...packageSrcFiles.keys()][0]);"),
      1,
      "間引きを差し込めていません",
    );
    // Then: 走査量の表示は間引きの前なので変わらない（数字では気づけない）
    const scanned = readScanVolume(r.stdout);
    assert.equal(scanned.sc039Compared, control.sc039Compared, "走査量の表示が変わっています");
    // Then: それでも落ちる
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /指標が測った走査対象が、照合した走査対象と食い違っています/);
    assert.match(
      r.stderr,
      new RegExp(`SC-039 照合先: ${control.sc039Compared} → ${control.sc039Compared - 1}`),
    );
  });

  test("テスト集合を指標の直前で間引くと非ゼロで終了する（SC-029 / SC-032 の同型経路）", () => {
    // Given: SC-029 / SC-032 の例外表ガードも走査量の表示も終わったあとで 1 件落とす。
    //        #198 の実測では exit 0 で、SC-032 の分母と SC-036 の件数だけが静かに動いた
    const mutate = (s) =>
      s.replace(
        "  const sc028 = sc028DuplicateTestDoubles(allTestFiles);",
        "  allTestFiles.delete([...allTestFiles.keys()][0]);\n  const sc028 = sc028DuplicateTestDoubles(allTestFiles);",
      );
    // When
    const r = runScriptCopy("audit-structure.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(
      countOf(r.source, "allTestFiles.delete([...allTestFiles.keys()][0]);"),
      1,
      "間引きを差し込めていません",
    );
    // Then: 例外表の照合先の表示は間引きの前なので変わらない
    const scanned = readScanVolume(r.stdout);
    assert.equal(scanned.testFiles, control.testFiles, "例外表の照合先の表示が変わっています");
    // Then: それでも落ちる
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /指標が測った走査対象が、照合した走査対象と食い違っています/);
    assert.match(r.stderr, new RegExp(`テスト集合: ${control.testFiles} → ${control.testFiles - 1}`));
  });

  test("突き合わせそのものを消すと、同じ間引きが素通りするようになる（配線の破壊検証）", () => {
    // Given: 突き合わせの判定を外したうえで、上と同じ間引きを入れる。
    //        **この検査が落としているのは確かにこの突き合わせである**ことを固定する
    const mutate = (s) =>
      s
        .replace(
          "  const sc039 = sc039UnreachableElements({",
          "  packageSrcFiles.delete([...packageSrcFiles.keys()][0]);\n  const sc039 = sc039UnreachableElements({",
        )
        .replace("  if (measuredDrift.length > 0) {", "  if (false) {");
    // When
    const r = runScriptCopy("audit-structure.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "  if (measuredDrift.length > 0) {"), 0, "判定を外せていません");
    assert.equal(countOf(r.source, "  if (false) {"), 1, "判定の分岐を外せていません");
    // Then: 突き合わせを外すと同じ間引きが素通りする（＝赤の理由はこの突き合わせだった）
    assert.equal(r.status, 0, `素通りしません。stderr:\n${r.stderr}`);
  });
});
