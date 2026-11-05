/**
 * `scripts/check-toolchain.mjs` の配線（#487・docs/adr/0031）。
 *
 * 判定そのものは `scripts/lib/toolchain.test.mjs` が見る。ここは、`main()` が実際に宣言を読み、
 * 環境の版を集め、**宣言を 1 つ外すと検査を始めずに非ゼロで終わる**ことを、複製を子プロセスで起動して見る。
 * 宣言の置き場は複製の中で一時ファイルへ差し替える（追跡下の toolchain.json は書き換えない）。
 *
 * **環境の版が宣言と合っていることを前提にする**（対照実行）。合っていない環境では対照実行が赤くなり、
 * 何が合わないかを出す。それはこの検査が止めるべき環境そのものである。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { REPO_ROOT, createScriptCopyHarness, countOf } from "./lib/script-copy-harness.mjs";
import { chromiumBrowsersDir, BROWSERS_LOCATION_ENV, PNPM_SET_ENV } from "./lib/toolchain.mjs";

const SCRIPT = "check-toolchain.mjs";
// 時間制限は、手書きだった頃の値（60 秒）を保つ（既定は 300 秒）
const { runScriptCopy } = createScriptCopyHarness(".toolchain-", { timeoutMs: 60_000 });

const TOOLCHAIN_READ = 'path.join(REPO_ROOT, "toolchain.json")';
const PACKAGE_READ = 'path.join(REPO_ROOT, "package.json")';

/**
 * 宣言の置き場を一時ファイルへ差し替えた複製を、同じディレクトリに置いて起動する。
 * `overrides` は { toolchain?: object, packageJson?: object }。省いたものは実物を読む。
 */
function runWith(stage, overrides = {}, extraEnv = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "check-toolchain-"));
  try {
    // 上書きの内容は先に一時ファイルへ書き、複製の中ではその道に差し替えるだけにする
    const replacements = [];
    for (const [key, needle] of [
      ["toolchain", TOOLCHAIN_READ],
      ["packageJson", PACKAGE_READ],
    ]) {
      if (overrides[key] === undefined) continue;
      const file = path.join(tmp, `${key}.json`);
      fs.writeFileSync(file, JSON.stringify(overrides[key]));
      replacements.push([needle, JSON.stringify(file)]);
    }
    // pnpm から起動されたときの user agent を落とし、`pnpm --version` を確かめる経路を通す
    const env = { ...extraEnv, npm_config_user_agent: undefined };
    return runScriptCopy(
      SCRIPT,
      (source) =>
        replacements.reduce((src, [needle, to]) => {
          assert.equal(countOf(src, needle), 1, `差し替える読み取り（${needle}）が実装に 1 か所ありません`);
          return src.replace(needle, to);
        }, source),
      { args: stage === undefined ? [] : [stage], env },
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const REAL_TOOLCHAIN = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "toolchain.json"), "utf8"));
const REAL_PACKAGE = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));

describe("check-toolchain の配線（#487）", () => {
  test("対照実行: 宣言を差し替えない複製は test の段で exit 0", () => {
    const r = runWith("test");
    assert.equal(r.status, 0, `対照実行が緑になりません（環境の版が宣言と合っていない）:\n${r.stderr}`);
    assert.match(r.stdout, /\[check-toolchain\] OK（test: node \S+ \/ pnpm \S+ \/ bun \S+）/);
  });

  test("対照実行: 同じ内容の一時ファイルへ差し替えても exit 0（差し替えの仕組みが緑を壊さない）", () => {
    const r = runWith("test", { toolchain: REAL_TOOLCHAIN, packageJson: REAL_PACKAGE });
    assert.equal(r.status, 0, r.stderr);
  });

  test("Bun の宣言を外すと、検査を始めずに非ゼロで終わり、Bun と揃え方を名指しする", () => {
    const r = runWith("test", { toolchain: { ...REAL_TOOLCHAIN, bun: "0.0.1" } });
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stderr, /test の検査を始めません/);
    assert.match(r.stderr, /bun: 宣言 0\.0\.1 \/ 環境 \d+\.\d+\.\d+/);
    assert.match(r.stderr, /揃え方: .*bun-v0\.0\.1/);
  });

  test("Node の宣言を外すと（環境より新しい下限）、非ゼロで終わり Node を名指しする", () => {
    const r = runWith("mutation", { toolchain: { ...REAL_TOOLCHAIN, node: "99.0.0" } });
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stderr, /mutation の検査を始めません/);
    assert.match(r.stderr, /node: 宣言 99\.0\.0 以上（99 系）/);
  });

  test("pnpm の宣言（packageManager）を外すと、非ゼロで終わり pnpm を名指しする", () => {
    const r = runWith("test", { packageJson: { ...REAL_PACKAGE, packageManager: "pnpm@0.0.1" } });
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stderr, /pnpm: 宣言 0\.0\.1/);
    assert.match(r.stderr, /corepack enable/);
  });

  test("宣言そのものが壊れていると、比べる前に止まる（読めない宣言を「合っている」と読ませない）", () => {
    const r = runWith("test", { toolchain: { node: "22", bun: "1.4.3", caddy: "2.11.7" } });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /版の宣言を読めません/);
  });

  test("段を指定しない・知らない段は exit 2（綴りの誤りで何も見ずに通さない）", () => {
    assert.equal(runWith(undefined).status, 2);
    assert.equal(runWith("tests").status, 2);
  });
});

/**
 * e2e の段が、**実物の playwright-core** から要求の revision を読んでいるか（#492 のレビュー 3）。
 * 旧 `e2e/tests/browsers.test.ts` の「revision が数字の文字列」「素の Node で playwright-core を解決できる」に当たる。
 * 置き場は一時ディレクトリへ向け、環境に入っているブラウザに依らないようにする。
 */
describe("check-toolchain の配線: Chromium の revision（#492）", () => {
  const coreDir = path.dirname(
    createRequire(path.join(REPO_ROOT, "e2e", "package.json")).resolve("playwright-core/package.json"),
  );
  const browsers = JSON.parse(fs.readFileSync(path.join(coreDir, "browsers.json"), "utf8")).browsers;
  const revision = browsers.find((b) => b.name === "chromium").revision;
  const ffmpegRevision = browsers.find((b) => b.name === "ffmpeg").revision;

  function withBrowsersDir(names, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "check-toolchain-browsers-"));
    try {
      for (const n of names) fs.mkdirSync(path.join(dir, n));
      return fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  test("要求の revision は数字の文字列（素の Node で e2e の playwright-core を解決できる）", () => {
    assert.match(revision, /^\d+$/);
  });

  test("要求の revision の本体・headless shell・ffmpeg があれば、e2e の段は exit 0 で revision を名指しする", () => {
    const r = withBrowsersDir(
      [`chromium-${revision}`, `chromium_headless_shell-${revision}`, `ffmpeg-${ffmpegRevision}`],
      (dir) => runWith("e2e", {}, { PLAYWRIGHT_BROWSERS_PATH: dir }),
    );
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, new RegExp(`chromium ${revision} / ffmpeg ${ffmpegRevision}`));
  });

  test("ffmpeg だけが別の revision なら非ゼロで終わり、ffmpeg の要求の revision を名指しする（#509）", () => {
    const r = withBrowsersDir([`chromium-${revision}`, `chromium_headless_shell-${revision}`, "ffmpeg-1"], (dir) =>
      runWith("e2e", {}, { PLAYWRIGHT_BROWSERS_PATH: dir }),
    );
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stderr, new RegExp(`ffmpeg: 宣言 revision ${ffmpegRevision} / 環境 1`));
    assert.doesNotMatch(r.stderr, /chromium: 宣言/);
  });

  test("別の revision しか無ければ非ゼロで終わり、要求の revision を名指しする", () => {
    const r = withBrowsersDir(["chromium-1", "chromium_headless_shell-1"], (dir) =>
      runWith("e2e", {}, { PLAYWRIGHT_BROWSERS_PATH: dir }),
    );
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stderr, new RegExp(`chromium: 宣言 revision ${revision} / 環境 1`));
  });

  test("PLAYWRIGHT_BROWSERS_PATH=0 でも比べる（playwright-core の中の .local-browsers を見る）", () => {
    const r = runWith("e2e", {}, { PLAYWRIGHT_BROWSERS_PATH: "0" });
    // .local-browsers に要求の revision が入っていない限り止まる（このリポジトリは使っていない）
    if (fs.existsSync(path.join(coreDir, ".local-browsers", `chromium-${revision}`))) return;
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stderr, /\.local-browsers/);
  });
});

/**
 * ルートの検査と、turbo の中から起動したハーネスの検査が、**同じ置き場を見る**か（#492 の Codex レビュー 1）。
 * turbo は既定で環境変数を絞るので、置き場を決める変数が `passThroughEnv` に無いと、ルートでは通った検査が
 * ハーネスの中では別の置き場を見て止まる（XDG_CACHE_HOME で実際に起きた）。
 *
 * 置き場の解き方が読む変数は、宣言（BROWSERS_LOCATION_ENV）からではなく**実際に読んだキーを記録して**導く。
 * 解き方に変数を足して宣言を忘れても、ここが赤くなる。
 */
describe("Chromium の置き場を決める変数が turbo の中へ届く（#492）", () => {
  const turbo = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "turbo.json"), "utf8"));

  /** 解き方が読んだ環境変数のキーを、OS と指定の組を一通り回して集める。 */
  function readKeys() {
    const keys = new Set();
    const env = new Proxy(
      {},
      {
        get(_, key) {
          if (typeof key === "string") keys.add(key);
          return undefined;
        },
      },
    );
    for (const platform of ["linux", "darwin", "win32"]) {
      chromiumBrowsersDir(env, platform, "/home/u", { coreDir: "/core", cwd: "/repo" });
    }
    // 相対パスの指定のときにだけ読む変数（INIT_CWD）も拾う
    const relative = new Proxy(
      {},
      {
        get(_, key) {
          if (typeof key === "string") keys.add(key);
          return key === "PLAYWRIGHT_BROWSERS_PATH" ? "pw" : undefined;
        },
      },
    );
    chromiumBrowsersDir(relative, "linux", "/home/u", { coreDir: "/core", cwd: "/repo" });
    return [...keys].sort();
  }

  test("解き方が読む変数は、すべて宣言（BROWSERS_LOCATION_ENV か PNPM_SET_ENV）にある", () => {
    const read = readKeys();
    assert.ok(read.includes("XDG_CACHE_HOME"), `記録できていません: ${read.join(", ")}`);
    assert.ok(read.includes("INIT_CWD"), `記録できていません: ${read.join(", ")}`);
    const declared = [...BROWSERS_LOCATION_ENV, ...PNPM_SET_ENV];
    assert.deepEqual(read.filter((k) => !declared.includes(k)), []);
  });

  for (const task of ["e2e", "e2e:prod"]) {
    test(`turbo の ${task} タスクの passThroughEnv に、渡す変数がすべてある`, () => {
      const pass = turbo.tasks[task]?.passThroughEnv ?? [];
      assert.deepEqual(BROWSERS_LOCATION_ENV.filter((k) => !pass.includes(k)), []);
    });

    test(`turbo の ${task} タスクの passThroughEnv に、pnpm が上書きする変数を入れない（渡しても効かない。#492 の再レビュー）`, () => {
      const pass = turbo.tasks[task]?.passThroughEnv ?? [];
      assert.deepEqual(PNPM_SET_ENV.filter((k) => pass.includes(k)), []);
    });
  }

  test("相対パスの PLAYWRIGHT_BROWSERS_PATH は、ルートでも e2e/ から解く（ハーネスと Playwright が見る置き場。#492 の再レビュー）", () => {
    // 置き場は e2e/node_modules/ の下（gitignore の対象）に作り、e2e/ から見た相対パスで指す。
    // ルートから解くと node_modules/ の下の別の（無い）場所になるので、ルートから解く実装なら止まる。
    // 追跡の外に置くのは、強制終了で残っても mutation-check が作業ツリーの汚れで止まらないようにするため（#492 の再レビュー）。
    // OS の一時ディレクトリを ../ で指す形は使えない（/ より上は丸められ、ルートから解いても同じ場所になる）
    const e2eDir = path.join(REPO_ROOT, "e2e");
    const browsers = JSON.parse(
      fs.readFileSync(
        path.join(path.dirname(createRequire(path.join(e2eDir, "package.json")).resolve("playwright-core/package.json")), "browsers.json"),
        "utf8",
      ),
    ).browsers;
    const revision = browsers.find((b) => b.name === "chromium").revision;
    const ffmpegRevision = browsers.find((b) => b.name === "ffmpeg").revision;
    const dir = fs.mkdtempSync(path.join(e2eDir, "node_modules", ".check-toolchain-relative-"));
    try {
      for (const n of [`chromium-${revision}`, `chromium_headless_shell-${revision}`, `ffmpeg-${ffmpegRevision}`]) {
        fs.mkdirSync(path.join(dir, n));
      }
      const relative = path.relative(e2eDir, dir);
      // Given: e2e/ から解けば一時ディレクトリ、ルートから解けば別の（無い）場所になる指定
      assert.ok(!path.isAbsolute(relative), relative);
      assert.notEqual(path.resolve(REPO_ROOT, relative), dir, "ルートから解いても同じ場所になり、区別できません");
      // When: ルートから、ルートの INIT_CWD のまま流す（pnpm e2e の入口と同じ）
      const r = runWith("e2e", {}, { PLAYWRIGHT_BROWSERS_PATH: relative, INIT_CWD: REPO_ROOT });
      // Then: e2e/ から解いた置き場を見て通る
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, new RegExp(`chromium ${revision}`));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("入口の配線（#487）", () => {
  test("pnpm test と pnpm e2e は、turbo より先にそれぞれの段で版を比べる", () => {
    assert.equal(REAL_PACKAGE.scripts.test, "node scripts/check-toolchain.mjs test && turbo run test");
    assert.equal(REAL_PACKAGE.scripts.e2e, "node scripts/check-toolchain.mjs e2e && turbo run e2e");
  });
});
