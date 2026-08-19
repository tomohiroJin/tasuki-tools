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
    //        ものへ変えて走査ファイルだけを 0 件にする
    const mutate = (s) =>
      s.replace('e.name.endsWith(".ts") &&', 'e.name.endsWith(".ts-none") &&');
    // When
    const r = runScriptCopy("audit-log-hygiene.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assert.equal(countOf(r.source, '.ts-none'), 1, "拡張子の判定を壊せていません");
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
