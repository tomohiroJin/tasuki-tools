/**
 * audit-dependency-direction.mjs の宣言と 0 件ガードの配線（#95 S1）を見るテスト（#135・ADR-0014 決定 8）。
 *
 * `scan-target-wiring.test.mjs` を検査スクリプトごとに分けた 1 つ（#544。経緯と補助は `lib/script-copy-harness.mjs`）。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { listWorkspacePackages } from "./lib/scan-targets.mjs";
import { REPO_ROOT, createScriptCopyHarness, countOf, assertBrokenBy } from "./lib/script-copy-harness.mjs";

const { runScriptCopy } = createScriptCopyHarness(".wiring-depdir-");

describe("宣言と 0 件ガードの配線: scripts/audit-dependency-direction.mjs（#95 S1）", () => {
  // この検査だけが配線の破壊検証を持たず、**両方のガードを `if (false)` に潰しても
  // scripts の自己テストが全部緑のままだった**（2026-09-07 のレビューで実測された）。
  // `audit-dependency-direction.test.mjs` は純粋関数（findViolations）しか見ないので、
  // main() の中でガードが呼ばれているかは別に見る必要がある（ADR-0014 決定 7・決定 8）。

  test("対照実行: 書き換えない複製は exit 0 で走査量を出す", () => {
    // Given: 複製するだけで中身は変えない
    // When
    const r = runScriptCopy("audit-dependency-direction.mjs", (s) => s);
    // Then
    assert.equal(r.status, 0, `対照実行が緑になりません:\n${r.stderr}`);
    assert.match(
      r.stdout,
      /\[audit-dependency-direction\] 走査対象: \d+ パッケージ \/ \d+ ファイル/,
    );
  });

  test("許可表に無いパッケージがあると全単射照合が非ゼロで落とす", () => {
    // Given: 実体はそのまま、宣言から 1 行だけ落とす（実在するのに宣言に無い状態）
    const mutate = (s) => s.replace('  "packages/room-core": [],\n', "");
    // When
    const r = runScriptCopy("audit-dependency-direction.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, '"packages/room-core": []'), 0, "宣言を落とせていません");
    // Then
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /実在するが宣言に無い:\s+packages\/room-core/);
  });

  test("実在しないパッケージを宣言に足すと全単射照合が非ゼロで落とす", () => {
    // Given: missing 方向のずれ。**この向きは照合だけが拾える** ——
    //        `findViolations` が見るのは実在パッケージから作った観測結果なので、
    //        実在しない宣言はそもそも現れない（unexpected 方向は両方が拾う）。
    const mutate = (s) =>
      s.replace('  "packages/room-core": [],', '  "packages/ghost": [],\n  "packages/room-core": [],');
    // When
    const r = runScriptCopy("audit-dependency-direction.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, '"packages/ghost": []'), 1, "宣言を足せていません");
    // Then
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /宣言にあるが実在しない:\s+packages\/ghost/);
  });

  test("全単射照合の配線を消すと、実在しない宣言が素通りする", () => {
    // Given: 実在しない宣言を足したうえで、照合の分岐そのものを殺す。
    //        ガードが main() から外れていれば、ずれたまま緑になってしまう。
    const mutate = (s) =>
      s
        .replace('  "packages/room-core": [],', '  "packages/ghost": [],\n  "packages/room-core": [],')
        .replace("if (hasTargetDrift(drift)) {", "if (false) {");
    // When
    const r = runScriptCopy("audit-dependency-direction.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる。**緑を期待する破壊検証には書き換え「前」の
    // 確認が要る**（対象の行が実装から消えたときも 0 件になり、偽の緑になる）
    assertBrokenBy("audit-dependency-direction.mjs", r.source, "if (hasTargetDrift(drift)) {", "全単射照合");
    // Then: 本体側の分岐が missing 方向の唯一の防波堤であることをここで固定する
    assert.equal(r.status, 0, "照合を殺しても落ちないことの確認（配線の所在を固定する）");
    assert.doesNotMatch(r.stderr, /宣言にあるが実在しない/);
  });

  test("走査する拡張子の宣言が pathspec へ配線されている（#252 3 巡目）", () => {
    // Given: 宣言から .mjs を落とす。**実装が拡張子を直書きしていれば走査量は変わらない**
    //        （＝宣言と実体がずれるのに緑のまま、という状態を検出する）。
    //        当初この検査は .ts / .tsx だけを見ており、apps/tasuki-sync/scripts/*.mjs が
    //        走査外だった。そこへ禁止依存を足しても exit 0 になる穴があった。
    const mutate = (s) => s.replace('".mjs", ', "");
    // When
    const r = runScriptCopy("audit-dependency-direction.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, '".mjs"'), 0, "宣言から .mjs を落とせていません");
    // Then: 宣言が pathspec へ届いていれば、走査量が実際に減る
    const before = runScriptCopy("audit-dependency-direction.mjs", (s) => s);
    const volumeOf = (stdout) => {
      const m = stdout.match(/走査対象: \d+ パッケージ \/ (\d+) ファイル/);
      assert.ok(m, `走査量を読めません:\n${stdout}`);
      return Number(m[1]);
    };
    assert.ok(
      volumeOf(r.stdout) < volumeOf(before.stdout),
      `宣言を狭めても走査量が減っていません（拡張子が直書きされている疑い）: ${volumeOf(before.stdout)} → ${volumeOf(r.stdout)}`,
    );
  });

  test("走査対象が 0 件になると非ゼロで終了する", () => {
    // Given: 全単射照合は素通りさせたまま（宣言は触らない）、走査だけを空にする
    const mutate = (s) =>
      s.replace(
        "  const sources = new Map(packages.map((pkg) => [pkg, listPackageSources(pkg)]));",
        "  const sources = new Map(packages.map((pkg) => [pkg, []]));",
      );
    // When
    const r = runScriptCopy("audit-dependency-direction.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    // **`listPackageSources(pkg)` だけを数えてはならない。** 関数の定義行
    // （`function listPackageSources(pkg) {`）にも同じ綴りがあり、呼び出しを
    // 潰しても数が 0 にならない（この検査を書いた最初の版が実際に踏んだ）。
    assertBrokenBy("audit-dependency-direction.mjs", r.source, "[pkg, listPackageSources(pkg)]", "走査の導出");
    // Then: 照合では止まらず、0 件ガードが落とす
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.doesNotMatch(r.stderr, /実在するが宣言に無い/);
    assert.match(r.stdout, /走査対象: \d+ パッケージ \/ 0 ファイル/);
    assert.match(r.stderr, /走査対象が 0 件です.*ファイル/);
  });

  test("2 つの 0 件ガードの配線を両方消すと、走査 0 件のまま緑になる", () => {
    // Given: 走査を空にしたうえで、0 件ガードの分岐を**両方**殺す。
    //        **#253 で内訳（パッケージ単位）のガードが増えるまでは、合計のガード 1 つを
    //        殺すだけで緑になった。** 全パッケージが 0 件の状態は内訳のガードにも当たる
    //        ので、片方だけ殺しても落ちる。ここで固定したいのは「ガードを消せば緑になる」
    //        ＝ main() の分岐が唯一の防波堤である、という配線の所在なので、両方を殺す。
    const mutate = (s) =>
      s
        .replace(
          "  const sources = new Map(packages.map((pkg) => [pkg, listPackageSources(pkg)]));",
          "  const sources = new Map(packages.map((pkg) => [pkg, []]));",
        )
        .replace("if (emptyDimensions.length > 0) {", "if (false) {")
        .replace("if (emptyPackages.length > 0) {", "if (false) {");
    // When
    const r = runScriptCopy("audit-dependency-direction.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる。**壊す対象が実装にあることを先に見る** ——
    //       書き換え後の 0 件だけを見ると、ガードが消えたときも通ってしまう（偽の緑）。
    assertBrokenBy("audit-dependency-direction.mjs", r.source, "[pkg, listPackageSources(pkg)]", "走査の導出");
    assertBrokenBy("audit-dependency-direction.mjs", r.source, "if (emptyDimensions.length > 0) {", "合計のガード");
    assertBrokenBy("audit-dependency-direction.mjs", r.source, "if (emptyPackages.length > 0) {", "内訳のガード");
    // Then: どちらのガードも main() の防波堤であることを固定する
    assert.equal(r.status, 0, "ガードを殺しても落ちないことの確認（配線の所在を固定する）");
    assert.match(r.stdout, /走査対象: \d+ パッケージ \/ 0 ファイル/);
    assert.doesNotMatch(r.stderr, /走査対象が 0 件です/);
    assert.doesNotMatch(r.stderr, /走査対象が 0 件のパッケージ/);
  });

  // ── パッケージ単位の空振り（#253） ────────────────────────────────────────
  //
  // 上の 0 件ガードは走査量の**合計**しか見ない。1 つのパッケージだけが走査対象を
  // 失っても、他パッケージ分で合計が非ゼロのまま緑になる（実測では apps/timer-web の
  // 196 ファイル＝全体の 38% を落としても exit 0 で、その状態の禁止依存も見逃した）。
  // **合計のガードでは塞げないことを、同じテストの中で assert する。**

  /** 先頭 1 パッケージだけ走査を空にする（どのパッケージかは実体から導く）。 */
  const emptyFirstPackage = (s) =>
    s.replace(
      "  const sources = new Map(packages.map((pkg) => [pkg, listPackageSources(pkg)]));",
      "  const sources = new Map(packages.map((pkg, i) => [pkg, i === 0 ? [] : listPackageSources(pkg)]));",
    );

  /** 理由つき除外へ 1 行足す。表が空でも先頭の `[` は必ずあるので、そこへ挿す。 */
  const excludePackage = (pkg) => (s) =>
    s.replace(
      "export const EXCLUDED_PACKAGES = [",
      `export const EXCLUDED_PACKAGES = [\n  { pkg: ${JSON.stringify(pkg)}, reason: "配線の破壊検証" },`,
    );

  test("1 パッケージだけ走査を失うと非ゼロで終了し、そのパッケージを名指しする", () => {
    // Given: 宣言も合計も触らず、先頭 1 パッケージの走査だけを空にする
    const first = listWorkspacePackages(REPO_ROOT)[0];
    // When
    const r = runScriptCopy("audit-dependency-direction.mjs", emptyFirstPackage);
    // Then: まず「壊れたこと自体」を確かめる
    assertBrokenBy("audit-dependency-direction.mjs", r.source, "[pkg, listPackageSources(pkg)]", "走査の導出");
    // Then: 合計は非ゼロのまま（＝合計のガードでは検知できない状態であること）
    const total = r.stdout.match(/走査対象: \d+ パッケージ \/ (\d+) ファイル/);
    assert.ok(total, `走査量を読めません:\n${r.stdout}`);
    assert.notEqual(Number(total[1]), 0, "合計が 0 件では、合計のガードと区別できません");
    assert.doesNotMatch(r.stderr, /走査対象が 0 件です/);
    // Then: パッケージ単位のガードが名指しして落とす
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, new RegExp(`走査対象が 0 件のパッケージ[^\\n]*${first}`));
  });

  test("パッケージ単位のガードの配線を消すと、1 パッケージ空振りのまま緑になる", () => {
    // Given: 先頭 1 パッケージの走査を空にしたうえで、そのガードの分岐だけを殺す
    const mutate = (s) => emptyFirstPackage(s).replace("if (emptyPackages.length > 0) {", "if (false) {");
    // When
    const r = runScriptCopy("audit-dependency-direction.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる。**書き換え後が 0 件であることだけを
    //       見てはならない** —— 壊す対象の行がそもそも無い（ガード未実装）ときも
    //       0 件になり、緑を期待するこのテストは偽の緑になる。
    assertBrokenBy("audit-dependency-direction.mjs", r.source, "if (emptyPackages.length > 0) {", "内訳のガード");
    assertBrokenBy("audit-dependency-direction.mjs", r.source, "[pkg, listPackageSources(pkg)]", "走査の導出");
    // Then: このガードが唯一の防波堤であることを固定する（合計のガードは素通しする）
    assert.equal(r.status, 0, "ガードを殺しても落ちないことの確認（配線の所在を固定する）");
    assert.doesNotMatch(r.stderr, /走査対象が 0 件のパッケージ/);
  });

  test("理由つき除外に載っているパッケージは 0 件でも通す", () => {
    // Given: 先頭 1 パッケージの走査を空にし、同じパッケージを理由つき除外へ載せる
    const first = listWorkspacePackages(REPO_ROOT)[0];
    const mutate = (s) => excludePackage(first)(emptyFirstPackage(s));
    // When
    const r = runScriptCopy("audit-dependency-direction.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, `{ pkg: ${JSON.stringify(first)}, reason:`), 1, "除外を足せていません");
    // Then
    assert.equal(r.status, 0, `除外が効いていません。stderr:\n${r.stderr}`);
    assert.doesNotMatch(r.stderr, /走査対象が 0 件のパッケージ/);
  });

  test("理由の無い除外を足すと非ゼロで終了し、名指しする（ADR-0014 決定 2・決定 9）", () => {
    // Given: 実在するパッケージを、理由を書かずに除外へ載せる。**件数のガードでは
    //        塞げない** —— 表の長さは変わるが「1 行の書き忘れ」は 0 件にならない
    const first = listWorkspacePackages(REPO_ROOT)[0];
    const mutate = (s) =>
      s.replace(
        "export const EXCLUDED_PACKAGES = [",
        `export const EXCLUDED_PACKAGES = [\n  { pkg: ${JSON.stringify(first)} },`,
      );
    // When
    const r = runScriptCopy("audit-dependency-direction.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, `{ pkg: ${JSON.stringify(first)} }`), 1, "除外を足せていません");
    // Then: 理由の検査が先に落とす（宛先は実在するので実在確認では止まらない）
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, new RegExp(`除外に理由がありません[^\\n]*${first}`));
  });

  test("理由の検査の配線を消すと、理由の無い除外が素通りする", () => {
    // Given: 理由の無い除外を足したうえで、その判定の分岐そのものを殺す
    const first = listWorkspacePackages(REPO_ROOT)[0];
    const mutate = (s) =>
      s
        .replace(
          "export const EXCLUDED_PACKAGES = [",
          `export const EXCLUDED_PACKAGES = [\n  { pkg: ${JSON.stringify(first)} },`,
        )
        .replace("if (invalidExclusions.length > 0) {", "if (false) {");
    // When
    const r = runScriptCopy("audit-dependency-direction.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる（書き換え前に対象があることも見る）
    assert.equal(countOf(r.source, `{ pkg: ${JSON.stringify(first)} }`), 1, "除外を足せていません");
    assertBrokenBy("audit-dependency-direction.mjs", r.source, "if (invalidExclusions.length > 0) {", "理由の検査");
    // Then: この判定が唯一の防波堤であることを固定する（陳腐化の検査が先に落とす）
    assert.doesNotMatch(r.stderr, /除外に理由がありません/);
  });

  test("除外の宛先が実在しなくなると非ゼロで終了し、名指しする（ADR-0014 決定 2）", () => {
    // Given: workspace に無いパッケージを理由つき除外へ載せる（改名・移設で起きる）
    // When
    const r = runScriptCopy("audit-dependency-direction.mjs", excludePackage("packages/ghost"));
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, '{ pkg: "packages/ghost", reason:'), 1, "除外を足せていません");
    // Then
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /除外の宛先が実在しません[^\n]*packages\/ghost/);
  });

  test("走査対象を持つパッケージを除外に載せたままにすると非ゼロで終了する（陳腐化）", () => {
    // Given: 走査は壊さず、実際には 0 件でないパッケージを除外へ載せる。
    //        除外の行は「いま 0 件である」ことの主張なので、主張が偽なら落とす。
    //        放置すると、そのパッケージが後で走査対象を失ったときに黙って除外される。
    const first = listWorkspacePackages(REPO_ROOT)[0];
    // When
    const r = runScriptCopy("audit-dependency-direction.mjs", excludePackage(first));
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, `{ pkg: ${JSON.stringify(first)}, reason:`), 1, "除外を足せていません");
    // Then
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, new RegExp(`除外が陳腐化しています[^\\n]*${first}`));
  });
});
