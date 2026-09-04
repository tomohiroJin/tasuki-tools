/**
 * 0 件ガードが**検査本体へ配線されているか**を見るテスト（#135・ADR-0014 決定 8）。
 *
 * 純粋関数（`hasZeroScanTargets` / `findEmptyScanDimensions`）の単体テストだけでは、
 * `main()` からガードを丸ごと削除しても全件緑のままになる。実際に
 * 「`audit-structure.mjs` のガード 4 行を消しても 156 件が全部緑」という
 * 状態が存在した。**配線が消えたら落ちる**テストをここに置く。
 *
 * 手段: 検査スクリプトを**書き換えた複製**を作り、子プロセスで実行して終了コードを見る。
 * 追加依存は禁止のため `node:child_process` の `spawnSync` だけを使う。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { listTrackedFiles } from "./lib/scan-targets.mjs";

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPTS_DIR, "..");
const COPY_PREFIX = ".wiring-";

let copyCounter = 0;

/**
 * 前回の異常終了で残った複製を掃除する。
 *
 * 複製は `finally` で消しているが、SIGKILL 等で落ちると残る。残ると
 * `mutation-check.mjs` の「作業ツリーが clean であること」の判定を赤にして、
 * 原因の分かりにくい失敗になる。**自分が汚した可能性のあるものだけ**を、
 * 接頭辞で限定して消す（広い範囲の削除はしない）。
 */
function cleanupStaleCopies() {
  for (const name of fs.readdirSync(SCRIPTS_DIR)) {
    if (name.startsWith(COPY_PREFIX)) fs.rmSync(path.join(SCRIPTS_DIR, name), { force: true });
  }
}

cleanupStaleCopies();

/**
 * 検査スクリプトの複製を `scripts/` 直下へ置き、子プロセスで実行する。
 *
 * **同じディレクトリへ置くことが必須。** 各スクリプトは `__dirname/..` を
 * リポジトリルートとみなすため、別の場所へ複製すると走査先が変わってしまう。
 * 複製名は `*.test.mjs` でも `*.sh` でもないので、自己テスト・shellcheck の
 * 導出対象（`scripts/list-scan-targets.mjs`）には入らない。
 *
 * @param {string} scriptName 複製元のファイル名
 * @param {(source: string) => string} mutate 書き換え。恒等関数なら対照実行になる
 */
function runScriptCopy(scriptName, mutate) {
  const original = fs.readFileSync(path.join(SCRIPTS_DIR, scriptName), "utf8");
  const mutated = mutate(original);
  const copyPath = path.join(SCRIPTS_DIR, `${COPY_PREFIX}${process.pid}-${copyCounter++}-${scriptName}`);
  fs.writeFileSync(copyPath, mutated);
  try {
    const r = spawnSync(process.execPath, [copyPath], { encoding: "utf8" });
    return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", source: mutated };
  } finally {
    fs.rmSync(copyPath, { force: true });
  }
}

/** 部分文字列の出現回数（「壊れたこと自体」を先に確かめるために使う）。 */
function countOf(source, needle) {
  return source.split(needle).length - 1;
}

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
        '{ pkg: "apps/timer-sync", src: "src", test: "test", entry: "server.ts" }',
        '{ pkg: "apps/timer-sync", src: "src", test: "test", entry: "server-gone.ts" }',
      );
    // When
    const r = runScriptCopy("audit-structure.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "server-gone.ts"), 1, "宣言を壊せていません");
    // Then
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /宣言にあるが実在しない: apps\/timer-sync\/src\/server-gone\.ts/);
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

describe("0 件ガードの配線: scripts/audit-assembly-wiring.mjs", () => {
  test("対照実行: 書き換えない複製は exit 0 で走査量を出す", () => {
    // Given: 複製するだけで中身は変えない
    // When
    const r = runScriptCopy("audit-assembly-wiring.mjs", (s) => s);
    // Then
    assert.equal(r.status, 0, `対照実行が緑になりません:\n${r.stderr}`);
    assert.match(r.stdout, /\[audit-assembly-wiring\] 走査対象: \d+ 組 \/ \d+ ファイル/);
  });

  test("宣言を空にすると非ゼロで終了する（検査が丸ごと空振りする経路）", () => {
    // Given: ASSEMBLY_TARGETS の中身を消す。宣言が空なら「問題 0 件」で緑になってしまう
    const mutate = (s) =>
      s.replace(/export const ASSEMBLY_TARGETS = \[[\s\S]*?\n\];/, "export const ASSEMBLY_TARGETS = [];");
    // When
    const r = runScriptCopy("audit-assembly-wiring.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "export const ASSEMBLY_TARGETS = [];"), 1, "宣言を空にできていません");
    assert.equal(countOf(r.source, 'entry: "apps/'), 0, "宣言の中身が残っています");
    // Then: 0 件ガードが落とす
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /検査する組が 0 件です/);
  });

  test("エントリの経由が切れると非ゼロで終了する（判定が main へ配線されている）", () => {
    // Given: 判定の呼び出しを消す。純粋関数の単体テストだけでは、main から
    //        findAssemblyProblems を呼ばなくなった状態を検知できない
    const mutate = (s) =>
      s.replace(
        "const problems = ASSEMBLY_TARGETS.flatMap((t) => findAssemblyProblems(t, sources));",
        "const problems = ASSEMBLY_TARGETS.flatMap((t) => [`配線が消えた: ${t.entry}`]);",
      );
    // When
    const r = runScriptCopy("audit-assembly-wiring.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "findAssemblyProblems(t, sources)"), 0, "判定の呼び出しを壊せていません");
    // Then: 差し込んだ問題がそのまま赤として出る（＝main が problems を見て終了コードを決めている）
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /配線が消えた: apps\/poker-sync\/src\/server\.ts/);
  });
});

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
    //        件数は 12 のまま・ファイルも実在するので、0 件ガードにも実在確認にも掛からない
    const mutate = (s) => s.replace('type: "RoundError"', 'type: "RoundFailure"');
    // When
    const r = runScriptCopy("audit-domain-error-shape.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "RoundFailure"), 1, "宣言を壊せていません");
    // Then
    assert.match(r.stdout, /走査対象: 12 型 \/ 3 ファイル/);
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /RoundFailure の型宣言が見つかりません/);
  });
});

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

describe("0 件ガードの配線: scripts/audit-public-surface.mjs", () => {
  test("対照実行: 書き換えない複製は exit 0 で走査量を出す", () => {
    // Given: 複製するだけで中身は変えない
    // When
    const r = runScriptCopy("audit-public-surface.mjs", (s) => s);
    // Then
    assert.equal(r.status, 0, `対照実行が緑になりません:\n${r.stderr}`);
    assert.match(r.stdout, /\[audit-public-surface\] 走査対象: エントリ \d+ 件/);
  });

  test("走査対象のエントリが 0 件になると非ゼロで終了する（検査が丸ごと空振りする経路）", () => {
    // Given: SCANNED_PACKAGES の走査ループそのものを空にする。中身が空なら
    //        「問題 0 件」で緑になってしまう
    const mutate = (s) => s.replace("for (const d of SCANNED_PACKAGES) {", "for (const d of []) {");
    // When
    const r = runScriptCopy("audit-public-surface.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "for (const d of SCANNED_PACKAGES) {"), 0, "走査ループを壊せていません");
    assert.equal(countOf(r.source, "for (const d of []) {"), 1, "書き換えが 1 か所に入っていません");
    // Then: 0 件ガードが落とす
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /走査するエントリが 0 件です/);
  });

  test("判定の呼び出しが切れると非ゼロで終了する（判定が main へ配線されている）", () => {
    // Given: findWildcardReexports の呼び出しを消し、認識できる偽の問題を差し込む。
    //        `findWildcardReexports(` は関数定義（引数名は entrySources）にも現れるため、
    //        呼び出し行にしか現れない綴り `findWildcardReexports(sources)` で数える
    const mutate = (s) =>
      s.replace(
        "const problems = findWildcardReexports(sources);",
        'const problems = ["配線が消えた: 偽の問題"];',
      );
    // When
    const r = runScriptCopy("audit-public-surface.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "findWildcardReexports(sources)"), 0, "判定の呼び出しを壊せていません");
    assert.equal(
      countOf(r.source, 'const problems = ["配線が消えた: 偽の問題"];'),
      1,
      "書き換えが 1 か所に入っていません",
    );
    // Then: 差し込んだ問題がそのまま赤として出る（＝main が problems を見て終了コードを決めている）
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /配線が消えた: 偽の問題/);
  });
});

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

  test("plan の列挙が空になると非ゼロで終了する（検査が丸ごと空振りする経路）", () => {
    // Given: 走査対象そのものを失う
    const mutate = (s) =>
      s.replace("const plans = listTrackedFiles(REPO_ROOT, PLAN_PATTERNS);", "const plans = [];");
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

/**
 * **列挙ではなく導出で見るガード**（#166 / #72 E3）。
 *
 * 上の describe は検査スクリプトごとに手書きで列挙している。列挙は腐るので、
 * 「すべての検査が走査量を名乗る」ことだけは導出で押さえる。新しい検査を足した人が
 * 登録を漏らしても、ここが赤くなる。
 *
 * 権威は `git ls-files`。`fs.readdirSync` は未追跡ファイルを拾い、ローカルと CI で
 * 見えるものが食い違う（`docs/adr/0014` 決定 5）。
 *
 * **`scripts/list-scan-targets.mjs` の KINDS には足していない。** 同モジュールの除外は
 * `rel.startsWith(prefix)` の前方一致しか持たず、`.test.mjs` の後方一致を表現できない。
 * `git ls-files 'scripts/audit-*.mjs'` は自己テストを含む 10 件に一致する（2026-08-18 実測）。
 *
 * `runScriptCopy` が作る複製は `.wiring-` 接頭辞なので、追跡下にも `audit-*` の一致にも
 * 入らない。複製が自分自身を走査対象として拾う経路は無い。
 */
describe("走査量の出力: すべての audit-*.mjs が名乗る（導出で見る）", () => {
  const AUDITS = listTrackedFiles(REPO_ROOT, ["scripts/audit-*.mjs"])
    .map((rel) => path.basename(rel))
    .filter((name) => !name.endsWith(".test.mjs"));

  test("走査対象の検査スクリプトが 0 件でない（このガード自身の空振り検出）", () => {
    // 下限は「非空」だけにする。`>= 5` のような固定値は ADR-0014 決定 8 の MUST NOT。
    assert.ok(AUDITS.length > 0, "audit-*.mjs が 0 件（このガードが空振りしている）");
  });

  for (const name of AUDITS) {
    test(`${name} は走査量を出力する（ADR-0014 決定 6）`, () => {
      // Given / When（恒等関数なので対照実行）
      const r = runScriptCopy(name, (s) => s);
      // Then
      assert.match(r.stdout, /走査対象: /, `${name} が走査量を名乗っていない`);
    });
  }
});

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
        "    if (!hasScanTarget(p.entry)) continue;\n    const reachable = computeReachableFiles(p.srcFiles, [p.entry]);",
        "    if (!hasScanTarget(p.entry) || !isPackageLayer(p.pkg)) continue;\n    const reachable = computeReachableFiles(p.srcFiles, [p.entry]);",
      );
    // When
    const r = runScriptCopy("audit-structure.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(
      countOf(r.source, "if (!hasScanTarget(p.entry) || !isPackageLayer(p.pkg)) continue;"),
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
        "      if (entrySource !== undefined) contractFiles.set(prefix + p.entry, entrySource);",
        '      if (entrySource !== undefined && p.pkg !== "packages/poker-core") contractFiles.set(prefix + p.entry, entrySource);',
      );
    // When
    const r = runScriptCopy("audit-structure.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる（壊す前と後の両方を数える）
    const original = fs.readFileSync(path.join(SCRIPTS_DIR, "audit-structure.mjs"), "utf8");
    assert.equal(
      countOf(original, "      if (entrySource !== undefined) contractFiles.set(prefix + p.entry, entrySource);"),
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
