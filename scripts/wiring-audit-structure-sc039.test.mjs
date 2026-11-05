/**
 * audit-structure.mjs の SC-039 の走査範囲の配線（#180）を見るテスト（#135・ADR-0014 決定 8）。
 *
 * `scan-target-wiring.test.mjs`（1 回 約 3.5 分）を検査スクリプトごとに分けた 1 つ（#544）。
 * 変異の `tests` を関係するファイルだけにして、変異ごとの対照実行・検出の実行を短くし、
 * 変異検査のシャードの偏りを小さくする。手段・理由は `lib/script-copy-harness.mjs` と元のファイルの先頭に同じ。
 * 複製の接頭辞は `.wiring-sc039-`（他のファイルと重ならない。`script-copy-harness.test.mjs` が見る）。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SCRIPTS_DIR, createScriptCopyHarness, countOf } from "./lib/script-copy-harness.mjs";

const { runScriptCopy } = createScriptCopyHarness(".wiring-sc039-");

/**
 * SC-039②③ の走査範囲が**宣言から導かれている**ことを、検査そのものを走らせて見る（#180）。
 *
 * 純粋関数の単体テスト（`audit-structure.test.mjs`）は合成の `loaded` を渡すので、
 * `buildSc039Sources` にパッケージ名の名指しが戻っても**合成側だけが赤くなり、
 * 実リポジトリでの狭まりは検知できない**。#180 が実際に起きた形がこれである
 * （「照合先 14 ファイル」は 1 パッケージ分でしかなかったが、誰も落ちなかった）。
 */
/**
 * 出力から SC-039 の走査量を読む。**件数は直書きしない** — 製品コードに .ts を
 * 1 つ足すだけで、無関係にここが赤くなる（#147 で実際に踏んだ）。
 */
function readSc039ScanVolume(stdout) {
  const m = stdout.match(/SC-039②③ の走査対象: 照合先 (\d+) パッケージ \/ (\d+) ファイル、参照元 (\d+) パッケージ \/ (\d+) ファイル/);
  assert.ok(m, `SC-039 の走査量を読めません:\n${stdout}`);
  return {
    comparedPackages: Number(m[1]),
    comparedFiles: Number(m[2]),
    referencePackages: Number(m[3]),
    referenceFiles: Number(m[4]),
  };
}

describe("SC-039 の走査範囲の配線: scripts/audit-structure.mjs（#180）", () => {
  test("対照実行: 書き換えない複製は exit 0 で SC-039 の走査量を名乗る", () => {
    // Given / When（恒等関数なので対照実行）
    const r = runScriptCopy("audit-structure.mjs", (s) => s);
    // Then: 壊さなければ緑になれる（これが無いと下の赤が「複製の失敗」でも通る）
    assert.equal(r.status, 0, `対照実行が緑になりません:\n${r.stderr}`);
    assert.match(
      r.stdout,
      /\[audit-structure\] SC-039②③ の走査対象: 照合先 \d+ パッケージ \/ \d+ ファイル、参照元 \d+ パッケージ \/ \d+ ファイル/,
    );
  });

  test("照合先を 1 パッケージへ名指しで狭めると非ゼロで終了し、失われたパッケージを名指しする", () => {
    // Given: #180 以前と同じ「timer-core だけを取り出す」名指しを、組み立ての中へ戻す。
    //        **層の述語（isPackageLayer）自体は壊さない。** あれを狭めると宣言側と
    //        実体側が揃って狭まり、全単射の照合では落ちない（buildSc039Sources の
    //        「塞げていないこと」を参照）。ここで見るのは述語の後段の絞り込みである。
    const mutate = (s) =>
      s.replace(
        "      for (const [k, v] of p.srcFiles) packageSrcFiles.set(prefix + k, v);",
        '      for (const [k, v] of p.srcFiles) if (p.pkg === "packages/timer-core") packageSrcFiles.set(prefix + k, v);',
      );
    // When
    const r = runScriptCopy("audit-structure.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる（壊せていなければ以下の判定は無意味）
    assert.equal(
      countOf(r.source, "      for (const [k, v] of p.srcFiles) packageSrcFiles.set(prefix + k, v);"),
      0,
      "照合先の組み立てを壊せていません",
    );
    assert.equal(
      countOf(r.source, 'if (p.pkg === "packages/timer-core") packageSrcFiles.set(prefix + k, v);'),
      1,
      "名指しの絞り込みを差し込めていません",
    );
    // Then: 宣言（SCANNED_PACKAGES）は 1 行も減っていない（宣言を見るだけでは検知できない状態）
    assert.equal(
      countOf(r.source, "{ pkg: "),
      countOf(fs.readFileSync(path.join(SCRIPTS_DIR, "audit-structure.mjs"), "utf8"), "{ pkg: "),
    );
    // Then: それでも検査は落ち、測られなくなったパッケージを名指しする
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /宣言にあるが実在しない: packages\/poker-core/);
    assert.match(r.stderr, /宣言にあるが実在しない: packages\/protocol/);
    assert.match(r.stderr, /宣言にあるが実在しない: packages\/rate-limit/);
    // Then: 指標の表は 1 行も出ていない（ガードが指標より前にある）
    assert.equal(countOf(r.stdout, "SC039 |"), 0, "指標の表が出てしまっています");
  });

  test("参照元から apps を落とすと非ゼロで終了する（参照元の狭まりも見ている）", () => {
    // Given: 参照元の組み立てを `packages/` 層だけに狭める
    const mutate = (s) =>
      s.replace(
        "    if (entriesOf(p).length === 0) continue;\n    const reachable = computeReachableFiles(p.srcFiles, entriesOf(p));",
        "    if (entriesOf(p).length === 0 || !isPackageLayer(p.pkg)) continue;\n    const reachable = computeReachableFiles(p.srcFiles, entriesOf(p));",
      );
    // When
    const r = runScriptCopy("audit-structure.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(
      countOf(r.source, "if (entriesOf(p).length === 0 || !isPackageLayer(p.pkg)) continue;"),
      1,
      "参照元の絞り込みを差し込めていません",
    );
    // Then: 落ちて、参照元から消えた apps を名指しする
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /宣言にあるが実在しない: apps\/timer-web/);
  });
  // 走査範囲の照合は**ファイル単位**で行う（#180 の敵対的レビュー）。パッケージ単位の
  // 名乗りだけだと、「そのパッケージは 1 件以上寄与し続けるが、特定のファイルだけが
  // 集合から抜ける」狭め方が全単射照合・0 件ガード・例外表の健全性のいずれにも
  // 掛からず exit 0 で素通りする。実測では `stats.ts` 1 件を間引いた状態が
  // 「照合先 4 パッケージ / 28 ファイル」（正規は 29）で緑になった。

  test("照合先からパッケージ内の 1 ファイルだけを間引くと非ゼロで終了し、名指しする", () => {
    // Given: packages/poker-core は照合先に残る（他 7 ファイルが寄与する）。
    //        抜けるのは stats.ts だけ ＝ パッケージ単位の名乗りでは検知できない狭め方
    const mutate = (s) =>
      s.replace(
        "      for (const [k, v] of p.srcFiles) packageSrcFiles.set(prefix + k, v);",
        '      for (const [k, v] of p.srcFiles) { if (p.pkg === "packages/poker-core" && k === "stats.ts") continue; packageSrcFiles.set(prefix + k, v); }',
      );
    // When
    const r = runScriptCopy("audit-structure.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる（壊す前と後の両方を数える）
    const original = fs.readFileSync(path.join(SCRIPTS_DIR, "audit-structure.mjs"), "utf8");
    assert.equal(
      countOf(original, "      for (const [k, v] of p.srcFiles) packageSrcFiles.set(prefix + k, v);"),
      1,
      "壊す前の組み立て行が 1 件見つかりません",
    );
    assert.equal(
      countOf(r.source, "      for (const [k, v] of p.srcFiles) packageSrcFiles.set(prefix + k, v);"),
      0,
      "組み立て行を壊せていません",
    );
    // **この綴りは docstring の中にも例として出てくる**ので、書き換えた行の全体で数える
    assert.equal(
      countOf(
        r.source,
        '      for (const [k, v] of p.srcFiles) { if (p.pkg === "packages/poker-core" && k === "stats.ts") continue; packageSrcFiles.set(prefix + k, v); }',
      ),
      1,
      "間引きを差し込めていません",
    );
    // Then: パッケージ単位の名乗りは変わらない（旧実装が緑だった条件そのもの）。
    //       対照実行と比べ、照合先が**ちょうど 1 件だけ**減ったことを見る。
    const control1 = readSc039ScanVolume(runScriptCopy("audit-structure.mjs", (x) => x).stdout);
    const mutated1 = readSc039ScanVolume(r.stdout);
    assert.equal(mutated1.comparedPackages, control1.comparedPackages, "パッケージ単位の名乗りが変わっています");
    assert.equal(mutated1.comparedFiles, control1.comparedFiles - 1, "照合先がちょうど 1 件だけ減っていません");
    assert.doesNotMatch(r.stderr, /SC-039 の走査対象が 0 件です/);
    // Then: それでもファイル単位の照合が落とし、抜けたファイルを名指しする
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /宣言では走査するのに集合へ入っていない:\s+packages\/poker-core\/src\/stats\.ts/);
    // Then: 指標の表は 1 行も出ていない（照合が指標より前にある）
    assert.equal(countOf(r.stdout, "SC039 |"), 0, "指標の表が出てしまっています");
  });

  test("参照元からパッケージ内の 1 ファイルだけを間引くと非ゼロで終了し、名指しする", () => {
    // Given: 参照元（到達可能な製品コード）から 1 ファイルだけを抜く。
    //        参照元が痩せると「他から参照されていない」記号が増えて SC-039 の値が
    //        跳ね上がるが、それを検査自身が「走査範囲の欠落」として説明できない
    //
    //        **`if (!reachable.has(k)) continue;` を目印にしてはならない** —
    //        まったく同じ行が宣言側（`sc039DeclaredReferenceFiles`）にもあり、
    //        しかもファイル内で先に現れる。そちらを書き換えると宣言と実体が
    //        揃って狭まり、この検査が見たい狭め方を再現できない（実測で踏んだ）。
    //        組み立て側にしか無い綴りを目印にする。
    const mutate = (s) =>
      s.replace(
        "      productSources.set(prefix + k, v);",
        '      if (p.pkg === "packages/poker-core" && k === "deck.ts") continue;\n      productSources.set(prefix + k, v);',
      );
    // When
    const r = runScriptCopy("audit-structure.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる（壊す前と後の両方を数える）
    const original = fs.readFileSync(path.join(SCRIPTS_DIR, "audit-structure.mjs"), "utf8");
    assert.equal(countOf(original, "      productSources.set(prefix + k, v);"), 1, "壊す前の組み立て行が 1 件見つかりません");
    assert.equal(
      countOf(r.source, 'if (p.pkg === "packages/poker-core" && k === "deck.ts") continue;'),
      1,
      "間引きを差し込めていません",
    );
    // Then: パッケージ単位の名乗りは変わらない（**件数は直書きしない** —
    //       製品コードのファイルを 1 つ足すたびに、無関係にここが赤くなる）。
    //       対照実行の走査量から、参照元が「ちょうど 1 件だけ」減ったことを見る。
    const control = runScriptCopy("audit-structure.mjs", (x) => x);
    const readReference = (stdout) => {
      const m = stdout.match(/参照元 (\d+) パッケージ \/ (\d+) ファイル/);
      assert.ok(m, `参照元の走査量を読めません:\n${stdout}`);
      return { packages: Number(m[1]), files: Number(m[2]) };
    };
    const before = readReference(control.stdout);
    const after = readReference(r.stdout);
    assert.equal(after.packages, before.packages, "パッケージ単位の名乗りが変わっています");
    assert.equal(after.files, before.files - 1, "参照元がちょうど 1 件だけ減っていません");
    // Then: それでもファイル単位の照合が落とし、抜けたファイルを名指しする
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /宣言では走査するのに集合へ入っていない:\s+packages\/poker-core\/src\/deck\.ts/);
  });

  test("公開契約（SC-039④）から 1 パッケージ分を間引くと非ゼロで終了し、名指しする", () => {
    // Given: 公開契約の集合だけを痩せさせる。痩せると「外から取り込まれない値」を
    //        そのパッケージについて 1 件も数えなくなるが、指標は report-only なので
    //        値が下がっただけでは誰も気づけない（#182）。走査対象の照合で落とす
    const mutate = (s) =>
      s.replace(
        "        if (entrySource !== undefined) contractFiles.set(prefix + e, entrySource);",
        '        if (entrySource !== undefined && p.pkg !== "packages/poker-core") contractFiles.set(prefix + e, entrySource);',
      );
    // When
    const r = runScriptCopy("audit-structure.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる（壊す前と後の両方を数える）
    const original = fs.readFileSync(path.join(SCRIPTS_DIR, "audit-structure.mjs"), "utf8");
    assert.equal(
      countOf(original, "        if (entrySource !== undefined) contractFiles.set(prefix + e, entrySource);"),
      1,
      "壊す前の組み立て行が 1 件見つかりません",
    );
    assert.equal(countOf(r.source, 'p.pkg !== "packages/poker-core"'), 1, "間引きを差し込めていません");
    // Then: 走査量の表示でも公開契約がちょうど 1 件だけ減っている（**件数は直書きしない**）
    const control = runScriptCopy("audit-structure.mjs", (x) => x);
    const readContract = (stdout) => {
      const m = stdout.match(/公開契約 (\d+) ファイル/);
      assert.ok(m, `公開契約の走査量を読めません:\n${stdout}`);
      return Number(m[1]);
    };
    assert.equal(readContract(r.stdout), readContract(control.stdout) - 1, "公開契約がちょうど 1 件だけ減っていません");
    // Then: ファイル単位の照合が落とし、抜けたファイルを名指しする
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /宣言では走査するのに集合へ入っていない:\s+packages\/poker-core\/src\/index\.ts/);
    // Then: 指標の表は 1 行も出ていない（照合が指標より前にある）
    assert.equal(countOf(r.stdout, "SC039 |"), 0, "指標の表が出てしまっています");
  });

  test("宣言していないファイルを集合へ混ぜても非ゼロで終了する（逆向き）", () => {
    // Given: 全単射は両方向を見る。宣言に無いものが集合へ入る向きも落とす
    const mutate = (s) =>
      s.replace(
        "      for (const [k, v] of p.srcFiles) packageSrcFiles.set(prefix + k, v);",
        '      for (const [k, v] of p.srcFiles) packageSrcFiles.set(prefix + k, v);\n      packageSrcFiles.set("packages/ghost/src/ghost.ts", "export const Ghost = 1;\\n");',
      );
    // When
    const r = runScriptCopy("audit-structure.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "packages/ghost/src/ghost.ts"), 1, "混入を差し込めていません");
    // Then
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /集合に入っているが宣言では走査しない:\s+packages\/ghost\/src\/ghost\.ts/);
  });

  test("ファイル単位の照合そのものを消すと、間引きが素通りするようになる（配線の破壊検証）", () => {
    // Given: 照合の呼び出しを外したうえで、上と同じ 1 ファイルの間引きを入れる。
    //        **この検査が落としているのは確かにこの照合である**ことを固定する
    //        （消しても赤いままなら、赤の理由は別のところにある）
    const mutate = (s) =>
      s
        .replace(
          "      for (const [k, v] of p.srcFiles) packageSrcFiles.set(prefix + k, v);",
          '      for (const [k, v] of p.srcFiles) { if (p.pkg === "packages/poker-core" && k === "stats.ts") continue; packageSrcFiles.set(prefix + k, v); }',
        )
        .replace(
          "  const sc039FileDrift = diffTargets(",
          "  const sc039FileDriftDisabled = diffTargets(",
        )
        .replace(
          [
            "  if (",
            "    hasTargetDrift(sc039FileDrift) ||",
            "    hasTargetDrift(sc039RefFileDrift) ||",
            "    hasTargetDrift(sc039ContractDrift)",
            "  ) {",
          ].join("\n"),
          "  if (false) {",
        );
    // When
    const r = runScriptCopy("audit-structure.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "const sc039FileDrift = diffTargets("), 0, "照合の配線を外せていません");
    assert.equal(countOf(r.source, "if (false) {"), 1, "判定の分岐を外せていません");
    // Then: 照合を外すと同じ間引きが素通りする（＝赤の理由はこの照合だった）
    assert.equal(r.status, 0, `素通りしません。stderr:\n${r.stderr}`);
    // Then: 素通りした結果として、照合先が 1 件だけ痩せた表示のまま緑になる
    const control2 = readSc039ScanVolume(runScriptCopy("audit-structure.mjs", (x) => x).stdout);
    const mutated2 = readSc039ScanVolume(r.stdout);
    assert.equal(mutated2.comparedFiles, control2.comparedFiles - 1, "照合先がちょうど 1 件だけ減っていません");
  });
});
