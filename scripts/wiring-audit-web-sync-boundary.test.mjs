/**
 * audit-web-sync-boundary.mjs の 0 件ガード・実在確認の配線を見るテスト（#135・ADR-0014 決定 8）。
 *
 * `scan-target-wiring.test.mjs`（1 回 約 3.5 分）を検査スクリプトごとに分けた 1 つ（#544）。
 * 変異の `tests` を関係するファイルだけにして、変異ごとの対照実行・検出の実行を短くし、
 * 変異検査のシャードの偏りを小さくする。手段・理由は `lib/script-copy-harness.mjs` と元のファイルの先頭に同じ。
 * 複製の接頭辞は `.wiring-websync-`（他のファイルと重ならない。`script-copy-harness.test.mjs` が見る）。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { REPO_ROOT, createScriptCopyHarness, countOf } from "./lib/script-copy-harness.mjs";

const { runScriptCopy } = createScriptCopyHarness(".wiring-websync-");

describe("0 件ガードの配線: scripts/audit-web-sync-boundary.mjs", () => {
  test("素のままなら成功し、走査量を名乗る", () => {
    const r = runScriptCopy("audit-web-sync-boundary.mjs", (s) => s);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\[audit-web-sync-boundary\] 走査対象: /);
  });

  test("宣言を空にすると 0 件ガードで落ちる", () => {
    const mutate = (s) => s.replace(/export const WEB_APPS = \[/, "export const WEB_APPS = []; const UNUSED = [");
    const r = runScriptCopy("audit-web-sync-boundary.mjs", mutate);
    // まず「壊れたこと自体」を確かめる（verify-the-break-itself）。
    assert.equal(countOf(r.source, "export const WEB_APPS = []; const UNUSED = ["), 1, "宣言を壊せていません");
    assert.notEqual(r.status, 0, "宣言が空でも通ってしまう");
    assert.match(r.stderr, /走査対象が 0 件/);
  });

  test("走査するディレクトリ名を潰すと 0 件ガードで落ちる（行数ではなく中身を見ている）", () => {
    // 宣言の配列長は変わらないので、行数を見るガードではこの変異を検出できない。
    const mutate = (s) => s.replace(/\/src\/\*\.ts/g, "/does-not-exist/*.ts");
    const r = runScriptCopy("audit-web-sync-boundary.mjs", mutate);
    // まず「壊れたこと自体」を確かめる（verify-the-break-itself）。
    assert.equal(countOf(r.source, "/src/*.ts"), 0, "走査先を壊せていません（/src/*.ts が残っています）");
    assert.equal(countOf(r.source, "/does-not-exist/*.ts"), 2, "置換が想定件数と違います");
    assert.notEqual(r.status, 0, "走査先を失っても通ってしまう");
    // status が非ゼロなだけでは、変異が構文エラーを起こしただけでも緑（誤って赤）になる
    // （2026-08-19 レビュー M6）。0 件ガード自身の文言まで見て、意図した経路で
    // 落ちていることを確かめる。
    assert.match(r.stderr, /走査対象が 0 件/);
  });

  test("許可リストの判定を main が読んでいない状態にすると非ゼロで終了しない（判定が main へ配線されている）", () => {
    // Given: findDisallowedImporters の呼び出しを、常に固定の偽問題を返す版へすり替える。
    // 純粋関数の単体テストだけでは、main が importerProblems を problems へ積まなくなった
    // 状態を検知できない（#158 と同型。2026-08-19 レビュー C1）。
    const mutate = (s) =>
      s.replace(
        /const importerProblems = WEB_APPS\.flatMap\(\(app\) =>\n {4}findDisallowedImporters\(filesByApp\.get\(app\.app\), app\)\.map\(\n {6}\(hit\) =>[\s\S]*?\n {4}\),\n {2}\);/,
        "const importerProblems = WEB_APPS.flatMap((app) => [`配線が消えた: importer ${app.app}`]);",
      );
    const r = runScriptCopy("audit-web-sync-boundary.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(
      countOf(r.source, "const importerProblems = WEB_APPS.flatMap((app) => [`配線が消えた: importer ${app.app}`]);"),
      1,
      "判定の呼び出しを壊せていません",
    );
    assert.equal(countOf(r.source, "findDisallowedImporters(filesByApp.get(app.app), app)"), 0, "元の呼び出しが残っています");
    // Then: 差し込んだ問題がそのまま赤として出る（＝main が importerProblems を見て終了コードを決めている）
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /配線が消えた: importer apps\/timer-web/);
  });

  test("WS 保持先の判定を main が読んでいない状態にすると非ゼロで終了しない（判定が main へ配線されている）", () => {
    // 同上（#167 レビュー C1）。findDisallowedWsHolders 側。
    const mutate = (s) =>
      s.replace(
        /const wsHolderProblems = WEB_APPS\.flatMap\(\(app\) =>\n {4}findDisallowedWsHolders\(filesByApp\.get\(app\.app\), app\)\.map\(\n {6}\(hit\) =>[\s\S]*?\n {4}\),\n {2}\);/,
        "const wsHolderProblems = WEB_APPS.flatMap((app) => [`配線が消えた: wsHolder ${app.app}`]);",
      );
    const r = runScriptCopy("audit-web-sync-boundary.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(
      countOf(r.source, "const wsHolderProblems = WEB_APPS.flatMap((app) => [`配線が消えた: wsHolder ${app.app}`]);"),
      1,
      "判定の呼び出しを壊せていません",
    );
    assert.equal(countOf(r.source, "findDisallowedWsHolders(filesByApp.get(app.app), app)"), 0, "元の呼び出しが残っています");
    // Then
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /配線が消えた: wsHolder apps\/timer-web/);
  });
});

describe("実在確認の配線: scripts/audit-web-sync-boundary.mjs", () => {
  // 宣言と実体の一致は audit-web-sync-boundary.test.mjs も見ているが、あちらは
  // declaredPathsOf の出力（findMissingPaths への入力の形）しか見ておらず、
  // findMissingPaths を実際に main が呼び、その結果を報告しているかは見ていない
  // （2026-08-19 レビュー C2）。ここでは検査そのものを走らせて、落ちることを見る。

  test("宣言の実在確認を main が読んでいない状態にすると非ゼロで終了しない（判定が main へ配線されている）", () => {
    // Given: findMissingPaths の呼び出しを、常に固定の偽の「見つからないパス」を
    // 返す版へすり替える。現在の宣言は実在するものしか無いため、呼び出しを
    // 単に削除しただけでは対照実行と結果が変わらず検知できない。
    const mutate = (s) =>
      s.replace(
        "const missingDeclared = findMissingPaths(REPO_ROOT, WEB_APPS.flatMap(declaredPathsOf));",
        'const missingDeclared = ["配線が消えた/実在確認"];',
      );
    const r = runScriptCopy("audit-web-sync-boundary.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, 'const missingDeclared = ["配線が消えた/実在確認"];'), 1, "判定の呼び出しを壊せていません");
    assert.equal(
      countOf(r.source, "findMissingPaths(REPO_ROOT, WEB_APPS.flatMap(declaredPathsOf))"),
      0,
      "元の呼び出しが残っています",
    );
    // Then: 差し込んだ偽のパスがそのまま名指しで赤に出る（＝main が missingDeclared を見て終了コードを決めている）
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /宣言したパスが見つかりません: 配線が消えた\/実在確認/);
  });

  test("全単射照合（diffTargets）を main が読んでいない状態にすると非ゼロで終了しない（判定が main へ配線されている）", () => {
    // Given: diffTargets の呼び出しを、常に固定の偽の「宣言に無い web アプリ」を
    // 返す版へすり替える。現在は宣言と実体が一致しているため、呼び出しを単に
    // 削除しただけでは対照実行と結果が変わらず検知できない
    // （2026-08-19 再レビュー。I1 で足した検査 0 だけが C1・C2 の規範の外に
    // 置かれていた）。
    const mutate = (s) =>
      s.replace(
        "const appDrift = diffTargets(WEB_APPS.map((a) => a.app), listWebAppDirs());",
        'const appDrift = { missing: [], unexpected: ["配線が消えた/apps-web"] };',
      );
    const r = runScriptCopy("audit-web-sync-boundary.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(
      countOf(r.source, 'const appDrift = { missing: [], unexpected: ["配線が消えた/apps-web"] };'),
      1,
      "判定の呼び出しを壊せていません",
    );
    assert.equal(
      countOf(r.source, "diffTargets(WEB_APPS.map((a) => a.app), listWebAppDirs())"),
      0,
      "元の呼び出しが残っています",
    );
    // Then: 差し込んだ偽のずれがそのまま名指しで赤に出る（＝main が appDrift を見て終了コードを決めている）
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /実在する web アプリが WEB_APPS に宣言されていません: 配線が消えた\/apps-web/);
  });
});
