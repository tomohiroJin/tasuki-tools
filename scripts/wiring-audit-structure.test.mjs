/**
 * audit-structure.mjs の 0 件ガード・実在確認の配線を見るテスト（#135・ADR-0014 決定 8）。
 *
 * `scan-target-wiring.test.mjs` を検査スクリプトごとに分けた 1 つ（#544。経緯と補助は `lib/script-copy-harness.mjs`）。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SCRIPTS_DIR, createScriptCopyHarness, countOf } from "./lib/script-copy-harness.mjs";

const { runScriptCopy } = createScriptCopyHarness(".wiring-struct-");

describe("0 件ガードの配線: scripts/audit-structure.mjs", () => {
  test("対照実行: 書き換えない複製は exit 0 で走査量を出す", () => {
    // Given: 複製するだけで中身は変えない
    // When
    const r = runScriptCopy("audit-structure.mjs", (s) => s);
    // Then: 複製して子プロセスで走らせる仕組み自体は緑になれる
    //       （これが無いと、下の赤が「複製の失敗」でも通ってしまう）
    assert.equal(r.status, 0, `対照実行が緑になりません:\n${r.stderr}`);
    assert.match(r.stdout, /\[audit-structure\] 走査対象: src \d+ パッケージ \/ \d+ 件、test \d+ パッケージ \/ \d+ 件/);
  });

  test("宣言の src / test を null にすると非ゼロで終了する（走査 0 件・全指標 PASS の経路）", () => {
    // Given: SCANNED_PACKAGES の行数は 10 のまま、走査するディレクトリだけを消す
    const mutate = (s) =>
      s.replace(/src: "src"/g, "src: null").replace(/test: "tests?"/g, "test: null");
    // When
    const r = runScriptCopy("audit-structure.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる（壊せていなければ以下の判定は無意味）
    assert.equal(countOf(r.source, 'src: "src"'), 0, "src の宣言を壊せていません");
    assert.equal(countOf(r.source, 'test: "test"'), 0, "test の宣言を壊せていません");
    assert.ok(countOf(r.source, "src: null") >= 9, "src: null へ書き換わっていません");
    // Then: 宣言の行数は変わっていない（行数を見るガードでは検知できない状態）
    assert.equal(countOf(r.source, "{ pkg: "), countOf(fs.readFileSync(path.join(SCRIPTS_DIR, "audit-structure.mjs"), "utf8"), "{ pkg: "));
    // Then: それでも検査は落ちる
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /走査対象が 0 件です/);
  });

  test("宣言の src / test を空文字列にすると非ゼロで終了する（数え方と走査が割れる経路）", () => {
    // Given: null ではなく "" にする。`d.src !== null` で数え `d.src ? … : …` で読む
    //        書き方だと、ガードは「走査した」と数えるのに実際には走査しない
    const mutate = (s) => s.replace(/test: "tests?"/g, 'test: ""');
    // When
    const r = runScriptCopy("audit-structure.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, 'test: "test"'), 0, "test の宣言を壊せていません");
    assert.equal(countOf(r.source, 'test: "tests"'), 0, "test の宣言を壊せていません");
    assert.ok(countOf(r.source, 'test: ""') >= 10, '空文字列へ書き換わっていません');
    // Then: null ではないので「宣言の行数」でも「null かどうか」でも検知できない
    assert.equal(countOf(r.source, "test: null"), 0, "null にはなっていないこと");
    // Then: それでも検査は落ちる
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /走査対象の宣言が不正です/);
  });

  test("例外表の健全性の判定が切れると非ゼロで終了する（判定が main へ配線されている）", () => {
    // Given: findStaleSymbolExceptions の呼び出しを、認識できる偽の問題を返す式へすり替える。
    //        audit-structure.test.mjs の単体テストは純粋関数だけを見ているので、
    //        main がこの判定を呼ばなくなった状態を 1 件も検知できない（#158 と同型。
    //        2026-08-19 Task 4 レビュー Important 1）。
    //
    //        **「消す」のではなく「差し込む」**のは、main が結果を読んで終了コードを
    //        決めていることまで見るためである。`const staleExceptions = []` へ置き換えて
    //        赤を確認するだけだと、main が結果を無視していても気づけない。
    const mutate = (s) =>
      s.replace(
        /const staleExceptions = findStaleSymbolExceptions\([\s\S]*?\);/,
        "const staleExceptions = SC039C_EXCEPTIONS.map((e) => `配線が消えた: ${e.name}`);",
      );
    // When
    const r = runScriptCopy("audit-structure.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる。
    //       **`findStaleSymbolExceptions(` そのものは数えない** — 同名の関数定義が
    //       同じファイルにあるため、呼び出しを消しても 1 件残る（素の状態で 2 件）。
    //       呼び出し側にしか現れない綴りで数える。
    assert.equal(
      countOf(r.source, "const staleExceptions = findStaleSymbolExceptions("),
      0,
      "判定の呼び出しを壊せていません",
    );
    assert.equal(
      countOf(r.source, "const staleExceptions = SC039C_EXCEPTIONS.map((e) => `配線が消えた: ${e.name}`);"),
      1,
      "偽の問題を差し込めていません",
    );
    assert.equal(countOf(r.source, "findStaleSymbolExceptions("), 1, "残るのは関数定義の 1 件だけ");
    // Then: 差し込んだ問題がそのまま赤として出る（＝main が staleExceptions を見て終了コードを決めている）
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /配線が消えた: SYNC_ERROR_CODES/);
    // Then: 指標の表は 1 行も出ていない（ガードが指標より前にある）
    assert.equal(countOf(r.stdout, "SC039 |"), 0, "指標の表が出てしまっています");
  });

  test("SC-032 の例外表の判定が切れると非ゼロで終了する（判定が main へ配線されている）", () => {
    // Given: findStaleTestExceptions の呼び出しを、認識できる偽の問題を返す式へすり替える。
    //        audit-structure.test.mjs の単体テストは純粋関数だけを見ているので、
    //        main がこの判定を呼ばなくなった状態を 1 件も検知できない（#158 と同型）。
    //
    //        **「消す」のではなく「差し込む」**のは、main が結果を読んで終了コードを
    //        決めていることまで見るためである。`const staleTestExceptions = []` へ置き換えて
    //        赤を確認するだけだと、main が結果を無視していても気づけない。
    const mutate = (s) =>
      s.replace(
        /const staleTestExceptions = findStaleTestExceptions\([\s\S]*?\);/,
        "const staleTestExceptions = SC032_EXCEPTIONS.map((e) => `配線が消えた: ${e.testName}`);",
      );
    // When
    const r = runScriptCopy("audit-structure.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる。
    //       **`findStaleTestExceptions(` そのものは数えない** — 同名の関数定義が
    //       同じファイルにあるため、呼び出しを消しても 1 件残る（素の状態で 2 件）。
    //       呼び出し側にしか現れない綴りで数える。
    assert.equal(
      countOf(r.source, "const staleTestExceptions = findStaleTestExceptions("),
      0,
      "判定の呼び出しを壊せていません",
    );
    assert.equal(
      countOf(r.source, "const staleTestExceptions = SC032_EXCEPTIONS.map((e) => `配線が消えた: ${e.testName}`);"),
      1,
      "偽の問題を差し込めていません",
    );
    assert.equal(countOf(r.source, "findStaleTestExceptions("), 1, "残るのは関数定義の 1 件だけ");
    // Then: 差し込んだ問題がそのまま赤として出る
    //       （＝main が staleTestExceptions を見て終了コードを決めている）
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /配線が消えた: フィボナッチ10種を順序どおりに含む/);
    // Then: 指標の表は 1 行も出ていない（ガードが指標より前にある）
    assert.equal(countOf(r.stdout, "SC032 |"), 0, "指標の表が出てしまっています");
  });
});

describe("実在確認の配線: scripts/audit-structure.mjs", () => {
  // 宣言と実体の一致は `audit-structure.test.mjs` も見ているが、あちらは検査と同じ
  // 判定をテスト側で書き直しているため、**スクリプトから実在確認が消えても緑のまま**に
  // なる。ここでは検査そのものを走らせて、落ちることと名指しの内容を見る（#158）。

  test("宣言したテストディレクトリが実在しないと非ゼロで終了し、名指しする", () => {
    // Given: 1 パッケージの test だけを実在しない名前へ変える（全単射照合は
    //        パッケージ名しか見ないので素通りする）
    const mutate = (s) =>
      s.replace(
        '{ pkg: "packages/protocol", src: "src", test: "tests", entry: "index.ts" }',
        '{ pkg: "packages/protocol", src: "src", test: "tests-moved", entry: "index.ts" }',
      );
    // When
    const r = runScriptCopy("audit-structure.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "tests-moved"), 1, "宣言を壊せていません");
    // Then
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /宣言にあるが実在しない: packages\/protocol\/tests-moved/);
  });

  test("宣言したエントリポイントが実在しないと非ゼロで終了し、名指しする", () => {
    // Given: SC-027 の到達性測定の起点だけを実在しないファイル名へ変える
    const mutate = (s) =>
      s.replace(
        '{ pkg: "apps/tasuki-sync", src: "src", test: "test", entry: "server.ts" }',
        '{ pkg: "apps/tasuki-sync", src: "src", test: "test", entry: "server-gone.ts" }',
      );
    // When
    const r = runScriptCopy("audit-structure.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "server-gone.ts"), 1, "宣言を壊せていません");
    // Then
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /宣言にあるが実在しない: apps\/tasuki-sync\/src\/server-gone\.ts/);
  });

  test("名指しで参照するファイルピンが実在しないと非ゼロで終了し、名指しする", () => {
    // Given: SC-035 が突合対象として名指しするファイルのパスを実在しないものへ変える
    const mutate = (s) =>
      s.replace('path: "apps/timer-web/src/App.tsx"', 'path: "apps/timer-web/src/App-gone.tsx"');
    // When
    const r = runScriptCopy("audit-structure.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "App-gone.tsx"), 1, "宣言を壊せていません");
    // Then
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /宣言にあるが実在しない: apps\/timer-web\/src\/App-gone\.tsx/);
  });
});
