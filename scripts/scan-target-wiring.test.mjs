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

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
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

  test("走査ディレクトリの導出先を実在しない名前にすると非ゼロで終了する", () => {
    // Given: パッケージ名の宣言はそのまま（全単射照合は素通りする）、
    //        走査する src ディレクトリだけを実在しない名前へ変える
    const mutate = (s) => s.replace("`${pkg}/src`", "`${pkg}/src-does-not-exist`");
    // When
    const r = runScriptCopy("audit-log-hygiene.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, "`${pkg}/src`"), 0, "SCAN_DIRS の導出を壊せていません");
    assert.equal(countOf(r.source, "src-does-not-exist"), 1, "書き換えが 1 か所に入っていません");
    // Then: 走査ファイルが 0 件になり、検査は落ちる
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stdout, /走査対象: \d+ パッケージ \/ 0 ファイル/);
    assert.match(r.stderr, /走査対象が 0 件です/);
  });
});
