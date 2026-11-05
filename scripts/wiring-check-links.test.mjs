/**
 * check-links.mjs の 0 件ガードの配線を見るテスト（#135・ADR-0014 決定 8）。
 *
 * `scan-target-wiring.test.mjs` を検査スクリプトごとに分けた 1 つ（#544。経緯と補助は `lib/script-copy-harness.mjs`）。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createScriptCopyHarness, countOf } from "./lib/script-copy-harness.mjs";

const { runScriptCopy } = createScriptCopyHarness(".wiring-links-");

describe("0 件ガードの配線: scripts/check-links.mjs", () => {
  test("対照実行: 書き換えない複製は exit 0 で走査量と内訳を出す", () => {
    // Given: 複製するだけで中身は変えない
    // When
    const r = runScriptCopy("check-links.mjs", (s) => s);
    // Then
    assert.equal(r.status, 0, `対照実行が緑になりません:\n${r.stderr}`);
    assert.match(r.stdout, /走査対象: \d+ 件（うち追跡下 \d+ 件）/);
  });

  test("追跡下の内訳が 0 件になると非ゼロで終了する（全分割照合が黙って空振りする経路）", () => {
    // Given: 全分割照合の対象（追跡下の .md）だけを空にする。
    //        走査対象（未追跡を含む一覧）は 214 件のまま残る
    const mutate = (s) =>
      s.replace('gitList(["ls-files", "*.md"])', 'gitList(["ls-files", "*.md-does-not-exist"])');
    // When
    const r = runScriptCopy("check-links.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, 'gitList(["ls-files", "*.md"])'), 0, "全分割照合の対象を壊せていません");
    assert.equal(countOf(r.source, "*.md-does-not-exist"), 1, "書き換えが 1 か所に入っていません");
    // Then: 走査対象そのものは 0 件になっていない（内訳を見なければ素通りする状態）
    assert.match(r.stderr, /追跡下の .md（全分割照合の対象） が 1 件もありません/);
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
  });
});
