/**
 * audit-domain-error-shape.mjs の 0 件ガードの配線を見るテスト（#135・ADR-0014 決定 8）。
 *
 * `scan-target-wiring.test.mjs`（1 回 約 3.5 分）を検査スクリプトごとに分けた 1 つ（#544）。
 * 変異の `tests` を関係するファイルだけにして、変異ごとの対照実行・検出の実行を短くし、
 * 変異検査のシャードの偏りを小さくする。手段・理由は `lib/script-copy-harness.mjs` と元のファイルの先頭に同じ。
 * 複製の接頭辞は `.wiring-errshape-`（他のファイルと重ならない。`script-copy-harness.test.mjs` が見る）。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createScriptCopyHarness, countOf } from "./lib/script-copy-harness.mjs";

const { runScriptCopy } = createScriptCopyHarness(".wiring-errshape-");

describe("0 件ガードの配線: scripts/audit-domain-error-shape.mjs", () => {
  test("対照実行: 書き換えない複製は exit 0 で走査量を出す", () => {
    // Given: 複製するだけで中身は変えない
    // When
    const r = runScriptCopy("audit-domain-error-shape.mjs", (s) => s);
    // Then
    assert.equal(r.status, 0, `対照実行が緑になりません:\n${r.stderr}`);
    assert.match(r.stdout, /\[audit-domain-error-shape\] 走査対象: \d+ 型 \/ \d+ ファイル/);
  });

  test("宣言を空にすると非ゼロで終了する（検査が丸ごと空振りする経路）", () => {
    // Given: DOMAIN_ERROR_TARGETS の中身を消す。宣言が空なら「問題 0 件」で緑になってしまう
    const mutate = (s) =>
      s.replace(
        /export const DOMAIN_ERROR_TARGETS = \[[\s\S]*?\n\];/,
        "export const DOMAIN_ERROR_TARGETS = [];",
      );
    // When
    const r = runScriptCopy("audit-domain-error-shape.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(
      countOf(r.source, "export const DOMAIN_ERROR_TARGETS = [];"),
      1,
      "宣言を空にできていません",
    );
    assert.equal(countOf(r.source, 'type: "RoundError"'), 0, "宣言の中身が残っています");
    // Then: 0 件ガードが落とす
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /検査する型が 0 件です/);
  });

  test("判定の呼び出しが切れると非ゼロで終了する（判定が main へ配線されている）", () => {
    // Given: 判定の呼び出しを消す。純粋関数の単体テストだけでは、main から
    //        findDomainErrorProblems を呼ばなくなった状態を検知できない（#158）
    const mutate = (s) =>
      s.replace(
        "const problems = DOMAIN_ERROR_TARGETS.flatMap((t) => findDomainErrorProblems(t, sources));",
        "const problems = DOMAIN_ERROR_TARGETS.flatMap((t) => [`配線が消えた: ${t.type}`]);",
      );
    // When
    const r = runScriptCopy("audit-domain-error-shape.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(
      countOf(r.source, "findDomainErrorProblems(t, sources)"),
      0,
      "判定の呼び出しを壊せていません",
    );
    // Then: 差し込んだ問題がそのまま赤として出る（＝main が problems を見て終了コードを決めている）
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /配線が消えた: RoundError/);
  });

  test("宣言した型が実在しなくなると非ゼロで終了し、名指しする（改名で空振りする経路）", () => {
    // Given: 実装は変えず、宣言の型名だけを実在しないものへ変える。
    //        型名の書き換えだけでは件数もファイル数も動かないので、0 件ガードにも
    //        実在確認にも掛からない（件数は対照実行と突き合わせて確かめる。ハード
    //        コードした数は DOMAIN_ERROR_TARGETS の増減で腐るため使わない）
    const mutate = (s) => s.replace('type: "RoundError"', 'type: "RoundFailure"');
    // When
    const before = runScriptCopy("audit-domain-error-shape.mjs", (s) => s);
    const r = runScriptCopy("audit-domain-error-shape.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "RoundFailure"), 1, "宣言を壊せていません");
    // Then: 走査対象の行が対照実行と同じであることを確かめる（型名の書き換えだけで件数は動かない）
    const scanLine = (stdout) => {
      const m = stdout.match(/走査対象: \d+ 型 \/ \d+ ファイル/);
      assert.ok(m, `走査対象の行を読めません:\n${stdout}`);
      return m[0];
    };
    assert.equal(scanLine(r.stdout), scanLine(before.stdout));
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /RoundFailure の型宣言が見つかりません/);
  });
});
