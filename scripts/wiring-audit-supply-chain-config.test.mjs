/**
 * audit-supply-chain-config.mjs の 0 件ガードと判定の配線（#154）を見るテスト（#135・ADR-0014 決定 8）。
 *
 * `scan-target-wiring.test.mjs`（1 回 約 3.5 分）を検査スクリプトごとに分けた 1 つ（#544）。
 * 変異の `tests` を関係するファイルだけにして、変異ごとの対照実行・検出の実行を短くし、
 * 変異検査のシャードの偏りを小さくする。手段・理由は `lib/script-copy-harness.mjs` と元のファイルの先頭に同じ。
 * 複製の接頭辞は `.wiring-supply-`（他のファイルと重ならない。`script-copy-harness.test.mjs` が見る）。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { REPO_ROOT, createScriptCopyHarness, countOf } from "./lib/script-copy-harness.mjs";

const { runScriptCopy } = createScriptCopyHarness(".wiring-supply-");

describe("0 件ガードと判定の配線: scripts/audit-supply-chain-config.mjs（#154）", () => {
  test("対照実行: 書き換えない複製は exit 0 で走査量を出す", () => {
    // Given: 複製するだけで中身は変えない
    // When
    const r = runScriptCopy("audit-supply-chain-config.mjs", (s) => s);
    // Then
    assert.equal(r.status, 0, `対照実行が緑になりません:\n${r.stderr}`);
    assert.match(
      r.stdout,
      /\[audit-supply-chain-config\] 走査対象: 設定キー \d+ 件 \/ 除外 \d+ 件 \/ overrides \d+ 件/,
    );
  });

  test("設定キーを 0 件にすると非ゼロで終了する（検査が丸ごと空振りする経路）", () => {
    // Given: 導出の結果を空にする。キーが 0 件なら未知も欠落も見つからず「問題 0 件」で
    //        緑になってしまう（走査 0 件のまま OK を出す経路）
    const mutate = (s) =>
      s.replace("const keys = deriveOwnKeys(config, readAmbientConfig(REPO_ROOT));", "const keys = [];");
    // When
    const r = runScriptCopy("audit-supply-chain-config.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "const keys = [];"), 1, "導出を空にできていません");
    // Then: 0 件ガードが落とす
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /走査対象が 0 件です/);
  });

  test("除外が 0 件でも緑になる（除外に 0 件ガードを掛けていない）", () => {
    // Given: 除外リストを空にする。#126 は minimumReleaseAgeExclude を、#199 は overrides を
    //        キーごと消した。**そこへ 0 件ガードを掛けると、規範が認めた「不要になったら
    //        消す」が赤くなる。** 上の 0 件ガードを除外側へ広げる変更をここで止める
    const mutate = (s) => s.replace("Array.isArray(config[key]) ? config[key] : []", "[]");
    // When
    const r = runScriptCopy("audit-supply-chain-config.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.match(r.stdout, /除外 0 件/, "除外を空にできていません");
    // Then: 空でも落ちない
    assert.equal(r.status, 0, `除外 0 件で落ちています:\n${r.stderr}`);
  });

  test("キーの帰属判定の呼び出しが切れると非ゼロで終了する", () => {
    // Given: 判定の呼び出しを消す。純粋関数の単体テストだけでは、main から
    //        checkKeyMembership を呼ばなくなった状態を検知できない
    const mutate = (s) =>
      s.replace(
        "...checkKeyMembership(keys, Object.keys(config)),",
        '{ key: "配線が消えた", message: "キーの帰属" },',
      );
    // When
    const r = runScriptCopy("audit-supply-chain-config.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(
      countOf(r.source, "checkKeyMembership(keys, Object.keys(config))"),
      0,
      "呼び出しを壊せていません",
    );
    // Then: 差し込んだ問題がそのまま赤として出る（＝main が problems を見て終了コードを決めている）
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /配線が消えた: キーの帰属/);
  });

  test("除外の書式判定の呼び出しが切れると非ゼロで終了する（経路⑤の配線）", () => {
    // Given
    const mutate = (s) =>
      s.replace(
        "problems.push(...checkExclusionFormat(key, entries));",
        'problems.push({ key, message: "配線が消えた: 除外の書式" });',
      );
    // When
    const r = runScriptCopy("audit-supply-chain-config.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    // **関数定義と同じ字面なので、呼び出しの行ごと数える。** `checkExclusionFormat(key, entries)`
    // だけを数えると `export function` の側に一致して、壊せていなくても 1 件残る
    assert.equal(
      countOf(r.source, "problems.push(...checkExclusionFormat(key, entries));"),
      0,
      "呼び出しを壊せていません",
    );
    // Then
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /配線が消えた: 除外の書式/);
  });

  test("死んだ除外の判定の呼び出しが切れると非ゼロで終了する（経路⑥の配線）", () => {
    // Given
    const mutate = (s) =>
      s.replace(
        "problems.push(...findDeadExclusions(key, entries, resolvedVersions));",
        'problems.push({ key, message: "配線が消えた: 死んだ除外" });',
      );
    // When
    const r = runScriptCopy("audit-supply-chain-config.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    // 上と同じ理由で、呼び出しの行ごと数える（関数定義と字面が同じ）
    assert.equal(
      countOf(r.source, "problems.push(...findDeadExclusions(key, entries, resolvedVersions));"),
      0,
      "呼び出しを壊せていません",
    );
    // Then
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /配線が消えた: 死んだ除外/);
  });
});
