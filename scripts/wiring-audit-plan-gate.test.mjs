/**
 * audit-plan-gate.mjs の 0 件ガードと要求経路の配線（#155）を見るテスト（#135・ADR-0014 決定 8）。
 *
 * `scan-target-wiring.test.mjs`（1 回 約 3.5 分）を検査スクリプトごとに分けた 1 つ（#544）。
 * 変異の `tests` を関係するファイルだけにして、変異ごとの対照実行・検出の実行を短くし、
 * 変異検査のシャードの偏りを小さくする。手段・理由は `lib/script-copy-harness.mjs` と元のファイルの先頭に同じ。
 * 複製の接頭辞は `.wiring-plangate-`（他のファイルと重ならない。`script-copy-harness.test.mjs` が見る）。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createScriptCopyHarness, countOf } from "./lib/script-copy-harness.mjs";

const { runScriptCopy } = createScriptCopyHarness(".wiring-plangate-");

/**
 * `scripts/audit-plan-gate.mjs` の配線（#155）。
 *
 * **この検査の要求対象は現在 0 件である**（境界日以降の plan がまだ無い）。そのため
 * 「問題を差し込んで赤になるか」を素直に確かめられない —— 差し込む先が空だからである。
 * 代わりに**境界日を動かして**、要求の経路そのものが生きていることを見る。
 * 境界日を過去へずらせば既存 47 件が要求対象になり、44 件がゲートを持たないので赤くなる。
 */
describe("0 件ガードと要求経路の配線: scripts/audit-plan-gate.mjs（#155）", () => {
  test("対照実行: 書き換えない複製は exit 0 で走査量を出す", () => {
    // Given / When（恒等関数なので対照実行）
    const r = runScriptCopy("audit-plan-gate.mjs", (s) => s);
    // Then
    assert.equal(r.status, 0, `対照実行が緑になりません:\n${r.stderr}`);
    assert.match(
      r.stdout,
      /\[audit-plan-gate\] 走査対象: plan \d+ 件 \/ ゲート要求 \d+ 件（境界日 \d{4}-\d{2}-\d{2} 以降）/,
    );
  });

  test("境界日を過去へずらすと非ゼロで終了し、ゲートの無い plan を名指しする（要求経路が生きている）", () => {
    // Given: 境界日を憲法の批准より前へ。既存の実装計画がすべて要求対象になる
    const mutate = (s) =>
      s.replace('export const GATE_BOUNDARY_DATE = "2026-09-04";', 'export const GATE_BOUNDARY_DATE = "2000-01-01";');
    // When
    const r = runScriptCopy("audit-plan-gate.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, '"2000-01-01"'), 1, "境界日を動かせていません");
    // Then: 要求対象が非ゼロになり、実際に落ちる
    assert.doesNotMatch(r.stdout, /ゲート要求 0 件/, "要求対象が 0 件のままです");
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /docs\/superpowers\/plans\/.*Constitution Check の節がありません/);
  });

  test("宣言の境界日を過去へずらすと非ゼロで終了し、specs/ と plans/ の宣言の無い設計文書を名指しする（#506・宣言の要求経路が生きている）", () => {
    // Given: 既存の設計文書がすべて宣言の要求対象になる（現在の要求対象は 0 件なので、動かして見る）。
    //        specs/ だけ見ていても通るので、plans/ の側の列挙が外れていないかも同じ実行で見る
    const mutate = (s) =>
      s.replace('export const DECLARATION_BOUNDARY_DATE = "2026-11-03";', 'export const DECLARATION_BOUNDARY_DATE = "2000-01-01";');
    // When
    const r = runScriptCopy("audit-plan-gate.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, '"2000-01-01"'), 1, "境界日を動かせていません");
    // Then
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /docs\/superpowers\/specs\/[^\n]*「書き換えない節」の宣言がありません/);
    assert.match(r.stderr, /docs\/superpowers\/plans\/[^\n]*「書き換えない節」の宣言がありません/);
  });

  test("宣言のガイドが実在しないと非ゼロで終了する（ガイドの改名を宣言の側は検査できないので、ここで捕まえる）", () => {
    // Given: ガイドのパスを実在しない名前へ
    const from = 'const DECLARATION_GUIDE = "docs/guides/design-doc-revision.md";';
    const mutate = (s) => s.replace(from, 'const DECLARATION_GUIDE = "docs/guides/no-such-guide.md";');
    // When
    const r = runScriptCopy("audit-plan-gate.mjs", mutate);
    // Then
    assert.equal(countOf(r.source, "no-such-guide.md"), 1, "ガイドのパスを動かせていません");
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /宣言の正本のガイドが実在しません/);
  });

  test("設計文書の列挙が空になると非ゼロで終了する（#506・宣言の検査が空振りする経路）", () => {
    // Given
    const call = "const designDocs = listDesignDocs(tracked);";
    const mutate = (s) => s.replace(call, "const designDocs = [];");
    // When
    const r = runScriptCopy("audit-plan-gate.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "const designDocs = [];"), 1, "列挙を空にできていません");
    // Then
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /走査対象が 0 件です（設計文書）/);
  });

  test("plan の列挙が空になると非ゼロで終了する（検査が丸ごと空振りする経路）", () => {
    // Given: 走査対象そのものを失う
    const mutate = (s) =>
      s.replace("const plans = tracked.filter((rel) => rel.startsWith(PLANS_DIR));", "const plans = [];");
    // When
    const r = runScriptCopy("audit-plan-gate.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "const plans = [];"), 1, "列挙を空にできていません");
    // Then
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /走査対象が 0 件です/);
  });

  test("憲法から原則を導出できなくなると非ゼロで終了する（0 件を「全部満たした」と読ませない）", () => {
    // Given: 憲法の見出しを 1 本も拾えなくする。**このガードが無いと、原則 0 本を
    //        全部満たしたことになり、空のゲートが通る**（ADR-0014 決定 8 の自己適用）
    const mutate = (s) =>
      s.replace("const m = /^#{2,4}\\s+([IVXLC]+)\\.\\s+(.+?)\\s*$/.exec(line);", "const m = null;");
    // When
    const r = runScriptCopy("audit-plan-gate.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "const m = null;"), 1, "導出を壊せていません");
    // Then
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    // 選択（`|`）を挟むと優先順位で右辺だけでも満たせてしまうので、丸ごと 1 つの句で見る
    assert.match(r.stderr, /走査対象が 0 件です（憲法の原則）/);
  });

  test("日付を読めなくなると非ゼロで終了する（分類できないものを黙って対象外にしない）", () => {
    // Given: すべての plan が「日付を持たない」扱いになる
    const mutate = (s) =>
      s.replace("const m = /^(\\d{4}-\\d{2}-\\d{2})-/.exec(basename);", "const m = null;");
    // When
    const r = runScriptCopy("audit-plan-gate.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "const m = null;"), 1, "日付の読み取りを壊せていません");
    // Then
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /YYYY-MM-DD- で始まっていません/);
  });
});
