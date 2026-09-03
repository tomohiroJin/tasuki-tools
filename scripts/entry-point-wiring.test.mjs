/**
 * 起動判定が**検査本体へ配線されているか**を見るテスト（#197）。
 *
 * `scripts/lib/direct-run.test.mjs` は判定そのものを見るが、判定が正しくても
 * 各スクリプトがそれを使っていなければ意味がない。実際、`isDirectRun` を
 * 持っていたのは `mutation-check.mjs` だけで、残る 10 本は文字列比較のまま
 * **symlink 経由の起動で無出力・exit 0** になっていた（#174 のレビュー）。
 *
 * ここでは検査スクリプトを**実際に symlink 経由で起動して**、直接起動と
 * 同じ結果になることを見る。対象は列挙せず `scripts/` の実体から導出するので、
 * 新しく足したスクリプトが古い書き方を持ち込めば落ちる。
 *
 * 手段は `scan-target-wiring.test.mjs` に合わせる（追加依存は禁止、
 * 書き換えた複製を子プロセスで走らせる）。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { listTrackedFiles, hasZeroScanTargets } from "./lib/scan-targets.mjs";

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPTS_DIR, "..");
const COPY_PREFIX = ".entry-";

/** 各スクリプトの末尾に置く正準形。ここを変えるときは全スクリプトを揃える。 */
const GUARD = "if (isDirectRun(import.meta.url, process.argv[1])) main();";

/**
 * 直した後に**再発したら現れる**書き方。実際に使われていた 3 形すべてを挙げる。
 * 綴りだけを見る判定なので、これ自体は防波堤ではない（防波堤は下の実起動）。
 */
const STALE_GUARD_FRAGMENTS = [
  "process.argv[1] === fileURLToPath(import.meta.url)",
  "process.argv[1] === __filename",
  "`file://${process.argv[1]}`",
];

/**
 * 子プロセス 1 回あたりの上限。
 *
 * **上限を置かないと、固まったときに「失敗」ではなく「ハング」になる。**
 * `node:test` の既定タイムアウトは Infinity なので、検査が `git` や `pnpm` の
 * 起動で戻らなくなると CI ジョブは上限（既定 6 時間）まで返らない。
 * 最も重い `audit-structure.mjs` が手元で 2.6 秒なので、CI の遅さを見込んでも
 * 十分に広く、ハングとは区別できる幅にする。
 */
const LAUNCH_TIMEOUT_MS = 120_000;

/**
 * 起動して確かめる対象から外すもの。**理由と、宛先が実在することを併せて見る**
 * （宛先を失った除外が黙って残らないようにする。`list-scan-targets.mjs` と同じ扱い）。
 */
const LAUNCH_EXCLUSIONS = [
  {
    file: "scripts/mutation-check.mjs",
    reason:
      "起動すると全変異を当てるため数分かかる。symlink 経由の起動は scripts/mutation-check.test.mjs が複製リポジトリで見ている",
  },
  {
    file: "scripts/install-with-supply-chain-check.mjs",
    reason:
      "起動すると pnpm install が走り、この検査のために node_modules を書き換えることになる。判定は純粋関数へ寄せてあり scripts/install-with-supply-chain-check.test.mjs が見ている",
  },
];

/**
 * 検査スクリプト（エントリポイント）をリポジトリの実体から列挙する。
 *
 * `scripts/lib/` は他から読み込まれる部品で `main()` を持たないため外す。
 * `*.test.mjs` は自己テストなので外す。**個々のファイル名は書かない** —
 * 名前を並べると新しく足したものが黙って対象外になる（#135 で塞いだ型）。
 *
 * git の pathspec の `*` は `/` を跨ぐので、`scripts/` の下位ディレクトリに
 * 置いたスクリプトもここに入る。**入った先で階層を前提にしない**こと
 * （取り込みパスも複製先も、下の関数がその都度そのファイルの位置から導く）。
 */
function listEntryPoints() {
  return listTrackedFiles(REPO_ROOT, ["scripts/*.mjs"]).filter(
    (rel) => !rel.endsWith(".test.mjs") && !rel.startsWith("scripts/lib/"),
  );
}

const ENTRY_POINTS = listEntryPoints();
const LAUNCHABLE = ENTRY_POINTS.filter((rel) => !LAUNCH_EXCLUSIONS.some((e) => e.file === rel));

/** そのスクリプトの位置から見た共有ヘルパの取り込み文。階層を決め打ちしない。 */
function guardImportFor(rel) {
  const from = path.dirname(path.join(REPO_ROOT, rel));
  const to = path.join(SCRIPTS_DIR, "lib", "direct-run.mjs");
  let spec = path.relative(from, to).split(path.sep).join("/");
  if (!spec.startsWith(".")) spec = `./${spec}`;
  return `import { isDirectRun } from "${spec}";`;
}

/**
 * 子プロセスの環境。**`GITHUB_*` を落とす。**
 * `ci-scope.mjs` は `$GITHUB_OUTPUT` へ追記するので、そのまま起動すると
 * CI の実行中に本物のジョブ出力を書き換えてしまう。
 */
const CHILD_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith("GITHUB_")),
);

/**
 * 前回の異常終了で残った複製を掃除する。
 *
 * 残ると `mutation-check.mjs` の「作業ツリーが clean であること」の判定を
 * 赤にして、原因の分かりにくい失敗になる。**自分が汚した可能性のあるものだけ**を
 * 接頭辞で限定して消す。探す場所は複製を置く場所（＝各エントリポイントの
 * ディレクトリ）から導く。
 */
function cleanupStaleCopies() {
  const dirs = new Set(ENTRY_POINTS.map((rel) => path.dirname(path.join(REPO_ROOT, rel))));
  for (const dir of dirs) {
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith(COPY_PREFIX)) fs.rmSync(path.join(dir, name), { force: true });
    }
  }
}

cleanupStaleCopies();

function run(scriptPath) {
  const r = spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    env: CHILD_ENV,
    timeout: LAUNCH_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
  // 起動そのものが失敗した／上限を越えたときは、待ち続けずにここで赤にする。
  if (r.error) {
    throw new Error(
      `子プロセスが正常に終了しませんでした（${r.error.code ?? r.error.message}）: ${scriptPath}`,
    );
  }
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** 実体を指す symlink を一時ディレクトリに作り、そこから起動する。 */
function runViaSymlink(realPath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "entry-point-link-"));
  try {
    const link = path.join(dir, `linked-${path.basename(realPath)}`);
    fs.symlinkSync(realPath, link);
    return run(link);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * 書き換えた複製を**元と同じディレクトリ**へ置く。
 *
 * **同じディレクトリへ置くことが必須。** 各スクリプトは自分の位置から
 * リポジトリルートを求め、`./lib/` を相対で読み込むため、別の場所へ複製すると
 * 走査先ごと変わってしまう。複製名は `*.test.mjs` でも `*.sh` でもないので、
 * 自己テスト・shellcheck の導出対象には入らない。
 */
let copyCounter = 0;
function withScriptCopy(rel, mutate, fn) {
  const originalPath = path.join(REPO_ROOT, rel);
  const mutated = mutate(fs.readFileSync(originalPath, "utf8"));
  const copyPath = path.join(
    path.dirname(originalPath),
    `${COPY_PREFIX}${process.pid}-${copyCounter++}-${path.basename(rel)}`,
  );
  fs.writeFileSync(copyPath, mutated);
  try {
    return fn(copyPath, mutated);
  } finally {
    fs.rmSync(copyPath, { force: true });
  }
}

/** 部分文字列の出現回数（「壊れたこと自体」を先に確かめるために使う）。 */
function countOf(source, needle) {
  return source.split(needle).length - 1;
}

/** 起動判定を、直したはずの古い書き方へ戻す。取り込みを増やさない形を選ぶ。 */
const REVERTED_GUARD = "if (import.meta.url === `file://${process.argv[1]}`) main();";
function revertGuard(source) {
  return source.replace(GUARD, REVERTED_GUARD);
}

describe("エントリポイントの列挙", () => {
  test("scripts/ から 1 件以上導出できる（空振りしていない）", () => {
    // Given / When / Then: 0 件なら以下のテストは全部素通りする
    assert.equal(
      hasZeroScanTargets(ENTRY_POINTS.length),
      false,
      "検査スクリプトが 1 件も見つかりません（列挙の仕方が壊れています）",
    );
  });

  test("起動して確かめる対象が 1 件以上残っている（除外で空にしない）", () => {
    // Given / When / Then: 除外は人手で増える。全件が除外されると、この下の
    //                      describe はテスト 0 件のまま緑になり、この検査自身が
    //                      「何も実行せず緑」になる（ADR-0014 決定 8 の自己適用）
    assert.equal(
      hasZeroScanTargets(LAUNCHABLE.length),
      false,
      "起動して確かめる対象が 0 件です（除外が増えすぎて検査が空振りします）",
    );
  });

  test("起動から外す宣言の宛先がすべて実在する（宛先を失った除外を残さない）", () => {
    // Given / When / Then
    for (const e of LAUNCH_EXCLUSIONS) {
      assert.ok(
        ENTRY_POINTS.includes(e.file),
        `除外の宛先が実在しません: ${e.file}（${e.reason}）`,
      );
    }
  });
});

describe("起動判定が共有ヘルパへ集約されている", () => {
  for (const rel of ENTRY_POINTS) {
    test(`${rel} が判定を自前で書いていない`, () => {
      // Given
      const source = fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
      const guardImport = guardImportFor(rel);
      // When / Then: 取り込みと正準形がそろって 1 か所に集約されている
      assert.ok(source.includes(guardImport), `共有ヘルパを取り込んでいません: ${guardImport}`);
      assert.equal(countOf(source, GUARD), 1, `起動判定が正準形ではありません: ${GUARD}`);
      // Then: 古い書き方が混ざっていない
      for (const stale of STALE_GUARD_FRAGMENTS) {
        assert.equal(countOf(source, stale), 0, `古い起動判定が残っています: ${stale}`);
      }
    });
  }
});

describe("symlink 経由の起動でも検査が走る", () => {
  for (const rel of LAUNCHABLE) {
    const realPath = path.join(REPO_ROOT, rel);

    test(`${rel}: symlink 経由と直接起動で結果が同じ`, () => {
      // Given: 直接起動（対照実行）。何かを出していなければ以下の比較は無意味
      const direct = run(realPath);
      assert.notEqual(
        direct.stdout.length + direct.stderr.length,
        0,
        "直接起動でも無出力です（対照実行になっていません）",
      );
      // When: 実体を指す symlink から起動する
      const linked = runViaSymlink(realPath);
      // Then: 起動のしかたで結果が変わらない
      assert.equal(linked.status, direct.status, "終了コードが直接起動と違います");
      assert.equal(linked.stdout, direct.stdout, "標準出力が直接起動と違います");
      assert.equal(linked.stderr, direct.stderr, "標準エラーが直接起動と違います");
    });

    test(`${rel}: 起動判定を古い書き方へ戻すと無出力・exit 0 に戻る`, () => {
      // Given: 起動判定だけを古い書き方へ戻した複製
      withScriptCopy(rel, revertGuard, (copyPath, source) => {
        // Then: まず「壊せたこと自体」を確かめる（壊せていなければ以下は無意味）
        assert.equal(countOf(source, GUARD), 0, "起動判定を戻せていません");
        assert.equal(countOf(source, REVERTED_GUARD), 1, "古い書き方へ差し替わっていません");
        // Then: 直接起動なら古い書き方でも走る（複製が壊れていないことの対照）
        const direct = run(copyPath);
        assert.notEqual(
          direct.stdout.length + direct.stderr.length,
          0,
          "複製が直接起動でも無出力です（複製の作り方が壊れています）",
        );
        // When / Then: symlink 経由にすると、何も出さないまま成功で終わる
        const linked = runViaSymlink(copyPath);
        assert.equal(linked.stdout, "", "標準出力が空ではありません");
        assert.equal(linked.stderr, "", "標準エラーが空ではありません");
        assert.equal(linked.status, 0, "無出力のまま exit 0 になる症状が再現していません");
      });
    });
  }
});
