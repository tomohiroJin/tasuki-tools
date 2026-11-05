/**
 * audit-log-hygiene.mjs の 0 件ガードの配線を見るテスト（#135・ADR-0014 決定 8）。
 *
 * `scan-target-wiring.test.mjs`（1 回 約 3.5 分）を検査スクリプトごとに分けた 1 つ（#544）。
 * 変異の `tests` を関係するファイルだけにして、変異ごとの対照実行・検出の実行を短くし、
 * 変異検査のシャードの偏りを小さくする。手段・理由は `lib/script-copy-harness.mjs` と元のファイルの先頭に同じ。
 * 複製の接頭辞は `.wiring-loghyg-`（他のファイルと重ならない。`script-copy-harness.test.mjs` が見る）。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createScriptCopyHarness, countOf } from "./lib/script-copy-harness.mjs";

const { runScriptCopy } = createScriptCopyHarness(".wiring-loghyg-");

describe("0 件ガードの配線: scripts/audit-log-hygiene.mjs", () => {
  test("対照実行: 書き換えない複製は exit 0 で走査量を出す", () => {
    // Given: 複製するだけで中身は変えない
    // When
    const r = runScriptCopy("audit-log-hygiene.mjs", (s) => s);
    // Then
    assert.equal(r.status, 0, `対照実行が緑になりません:\n${r.stderr}`);
    assert.match(r.stdout, /\[audit-log-hygiene\] 走査対象: \d+ パッケージ \/ \d+ ファイル/);
  });

  test("走査ディレクトリの導出先をすべて実在しない名前にすると非ゼロで終了する", () => {
    // Given: パッケージ名の宣言はそのまま（全単射照合は素通りする）、
    //        走査する src ディレクトリだけを実在しない名前へ変える
    const mutate = (s) => s.replace("`${pkg}/src`", "`${pkg}/src-does-not-exist`");
    // When
    const r = runScriptCopy("audit-log-hygiene.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "`${pkg}/src`"), 0, "SCAN_DIRS の導出を壊せていません");
    assert.equal(countOf(r.source, "src-does-not-exist"), 1, "書き換えが 1 か所に入っていません");
    // Then: 実在確認（E1）が先に落とし、実在しない宣言を名指しする
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /宣言にあるが実在しない: apps\/landing\/src-does-not-exist/);
  });

  test(
    "宣言した 1 パッケージの src だけが実在しなくても非ゼロで終了し、名指しする（#158）",
    () => {
      // Given: 9 パッケージのうち 1 つだけ src の導出先を実在しない名前へ変える。
      //        パッケージ名の宣言は変えないので全単射照合は素通りし、走査ファイル数も
      //        他パッケージ分が残るため 0 件ガードにも掛からない（#158 が塞ぐ穴）。
      const mutate = (s) =>
        s.replace(
          "const SCAN_DIRS = SCANNED_PACKAGES.map((pkg) => `${pkg}/src`);",
          'const SCAN_DIRS = SCANNED_PACKAGES.map((pkg) =>\n  pkg === "packages/protocol" ? `${pkg}/src-moved` : `${pkg}/src`);',
        );
      // When
      const r = runScriptCopy("audit-log-hygiene.mjs", mutate);
      // Then: まず「壊れたこと自体」を確かめる
      assert.equal(countOf(r.source, "src-moved"), 1, "1 パッケージ分の導出を壊せていません");
      assert.equal(
        countOf(r.source, "const SCAN_DIRS = SCANNED_PACKAGES.map((pkg) => `${pkg}/src`);"),
        0,
        "元の導出行が残っています",
      );
      // Then: 走査は 0 件になっていない（旧実装が緑だった条件そのもの）
      assert.doesNotMatch(r.stderr, /走査対象が 0 件です/);
      // Then: それでも落ち、実在しない宣言を名指しする（E1）
      assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
      assert.match(r.stderr, /宣言にあるが実在しない: packages\/protocol\/src-moved/);
    },
  );

  test("走査対象のパッケージが 0 件になると非ゼロで終了する（全宣言を除外へ移す経路）", () => {
    // Given: 全宣言を理由つき除外へ移すと全単射照合は素通りする（ADR-0014 決定 8）。
    //        その終着点である「走査ディレクトリが 1 つも無い」状態を直接作る。
    //        実在確認は空の宣言に対して何も返さないので、ここを止めるのは 0 件ガードだけ。
    const mutate = (s) =>
      s.replace(
        "const SCAN_DIRS = SCANNED_PACKAGES.map((pkg) => `${pkg}/src`);",
        "const SCAN_DIRS = [];",
      );
    // When
    const r = runScriptCopy("audit-log-hygiene.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "const SCAN_DIRS = [];"), 1, "宣言を空にできていません");
    // Then: 実在確認では止まらず、0 件ガードが両方の内訳を名指しして落とす
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.doesNotMatch(r.stderr, /宣言にあるが実在しない/);
    assert.match(r.stdout, /走査対象: 0 パッケージ \/ 0 ファイル/);
    assert.match(r.stderr, /走査対象が 0 件です.*パッケージ.*ファイル/);
  });

  test("走査ディレクトリは実在するがファイルが 0 件になると非ゼロで終了する", () => {
    // Given: 実在確認は通る（ディレクトリはそのまま）が、拾う拡張子を実在しない
    //        ものへ変えて走査ファイルだけを 0 件にする（#157 で宣言へ切り出した）
    const mutate = (s) =>
      s.replace(
        'export const SCANNED_EXTENSIONS = [".ts", ".tsx"];',
        'export const SCANNED_EXTENSIONS = [".ts-none"];',
      );
    // When
    const r = runScriptCopy("audit-log-hygiene.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, '".ts-none"'), 1, "拡張子の判定を壊せていません");
    // Then: 実在確認は素通りし、0 件ガードが落とす
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.doesNotMatch(r.stderr, /宣言にあるが実在しない/);
    assert.match(r.stdout, /走査対象: \d+ パッケージ \/ 0 ファイル/);
    assert.match(r.stderr, /走査対象が 0 件です/);
  });
});
