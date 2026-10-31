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
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPTS_DIR, "..");
const SCRIPT = "check-toolchain.mjs";
const COPY_PREFIX = ".toolchain-";

const TOOLCHAIN_READ = 'path.join(REPO_ROOT, "toolchain.json")';
const PACKAGE_READ = 'path.join(REPO_ROOT, "package.json")';

/** 前回の異常終了で残った複製を掃除する（変異検査の「作業ツリーが clean」を赤くしないため）。 */
for (const name of fs.readdirSync(SCRIPTS_DIR)) {
  if (name.startsWith(COPY_PREFIX)) fs.rmSync(path.join(SCRIPTS_DIR, name), { force: true });
}

let counter = 0;

/**
 * 宣言の置き場を一時ファイルへ差し替えた複製を、同じディレクトリに置いて起動する。
 * `overrides` は { toolchain?: object, packageJson?: object }。省いたものは実物を読む。
 */
function runWith(stage, overrides = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "check-toolchain-"));
  let source = fs.readFileSync(path.join(SCRIPTS_DIR, SCRIPT), "utf8");
  for (const [key, needle] of [
    ["toolchain", TOOLCHAIN_READ],
    ["packageJson", PACKAGE_READ],
  ]) {
    if (overrides[key] === undefined) continue;
    assert.equal(source.split(needle).length - 1, 1, `差し替える読み取り（${needle}）が実装に 1 か所ありません`);
    const file = path.join(tmp, `${key}.json`);
    fs.writeFileSync(file, JSON.stringify(overrides[key]));
    source = source.replace(needle, JSON.stringify(file));
  }
  const copy = path.join(SCRIPTS_DIR, `${COPY_PREFIX}${process.pid}-${counter++}-${SCRIPT}`);
  fs.writeFileSync(copy, source);
  try {
    const args = stage === undefined ? [copy] : [copy, stage];
    // pnpm から起動されたときの user agent を落とし、`pnpm --version` を確かめる経路を通す
    const env = { ...process.env };
    delete env["npm_config_user_agent"];
    const r = spawnSync(process.execPath, args, { encoding: "utf8", env, timeout: 60_000 });
    return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  } finally {
    fs.rmSync(copy, { force: true });
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

describe("入口の配線（#487）", () => {
  test("pnpm test と pnpm e2e は、turbo より先にそれぞれの段で版を比べる", () => {
    assert.equal(REAL_PACKAGE.scripts.test, "node scripts/check-toolchain.mjs test && turbo run test");
    assert.equal(REAL_PACKAGE.scripts.e2e, "node scripts/check-toolchain.mjs e2e && turbo run e2e");
  });
});
