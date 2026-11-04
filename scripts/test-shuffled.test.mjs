/**
 * ランダムな順のテスト検査を、わざと順番依存にした小さなワークスペースへ実際に流す（憲法 VII: 壊して確かめる）。
 * ランナーは bun test（追加の依存が要らない。CI の quality ジョブにも setup-bun がある）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, USAGE, execute, rerunCommand, checkToolchain, toolchainCheckCall } from "./test-shuffled.mjs";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "test-shuffled.mjs");
const REAL_PACKAGE_MANAGER = JSON.parse(fs.readFileSync(path.resolve(path.dirname(SCRIPT), "../package.json"), "utf8")).packageManager;

// 前のテストが進めた counter に頼る。宣言の順（1,2,3,4,5）でだけ通る。
const ORDER_DEPENDENT = `import { test, expect } from "bun:test";
let counter = 0;
for (const n of [1, 2, 3, 4, 5]) test("step " + n, () => { counter++; expect(counter).toBe(n); });
`;
const INDEPENDENT = `import { test, expect } from "bun:test";
for (const n of [1, 2, 3, 4, 5]) test("独立 " + n, () => { expect(n).toBeGreaterThan(0); });
`;

function workspace(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shuffled-run-"));
  fs.writeFileSync(path.join(dir, "pnpm-workspace.yaml"), 'packages:\n  - "pkgs/*"\n');
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "root", private: true, packageManager: REAL_PACKAGE_MANAGER }));
  for (const [name, source] of Object.entries(files)) {
    fs.mkdirSync(path.join(dir, "pkgs", name), { recursive: true });
    fs.writeFileSync(path.join(dir, "pkgs", name, "package.json"), JSON.stringify({ name, scripts: { test: "bun test" } }));
    fs.writeFileSync(path.join(dir, "pkgs", name, "a.test.ts"), source);
  }
  return dir;
}
const seedLine = (out) => out.split("\n").find((l) => l.startsWith("[shuffle] 種"));
const run = (dir, ...args) => spawnSync("node", [SCRIPT, "--root", dir, ...args], { encoding: "utf8" });

test("順番依存のテストで赤くなり、ログの種とコマンドで同じ失敗を再現できる", () => {
  const dir = workspace({ dependent: ORDER_DEPENDENT, fine: INDEPENDENT });
  try {
    // 5 本の並びが宣言順に一致するのは 1/120。最初の数個の種で見つかる
    let failing;
    for (let seed = 1; seed <= 10 && !failing; seed++) {
      const result = run(dir, "--all", "--seed", String(seed));
      if (result.status !== 0) failing = { seed, result };
    }
    assert.ok(failing, "順番依存のテストが、10 個の種のどれでも赤くならない（ランダムな順になっていない）");
    const out = failing.result.stdout;
    assert.match(out, new RegExp(`種 ${failing.seed}`));
    assert.match(out, /--randomize/);
    assert.match(out, /失敗 1 件/);
    assert.match(out, new RegExp(`再現（種 ${failing.seed}）: cd ${path.join(dir, "pkgs/dependent").replaceAll("/", "\\/")} && pnpm exec bun test --randomize --seed=${failing.seed}`));
    assert.doesNotMatch(out, /再現.*pkgs\/fine/);
    // ログに出た再現のコマンドで、同じ種のまま同じ失敗が出る
    const repro = /再現（種 \d+）: (.+)/.exec(out)[1];
    const first = spawnSync("bash", ["-c", repro], { cwd: dir, encoding: "utf8" });
    const second = spawnSync("bash", ["-c", repro], { cwd: dir, encoding: "utf8" });
    assert.notEqual(first.status, 0);
    assert.notEqual(second.status, 0);
    const failedNames = (r) => [...(r.stdout + r.stderr).matchAll(/\(fail\) (step \d)/g)].map((m) => m[1]);
    assert.deepEqual(failedNames(first), failedNames(second));
    assert.ok(failedNames(first).length > 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("独立したテストだけなら、どの種でも緑で終わる。種は最初に出る", () => {
  const dir = workspace({ fine: INDEPENDENT });
  try {
    const result = run(dir, "--all", "--seed", "42");
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(seedLine(result.stdout), /種 42/);
    assert.match(result.stdout, /流した 1 件・対象外 0 件・失敗 0 件/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("種を省くと毎回の種を出し、指定が不正なら始めない", () => {
  const dir = workspace({ fine: INDEPENDENT });
  try {
    assert.match(seedLine(run(dir, "--all").stdout), /^\[shuffle\] 種 \d+/);
    assert.equal(run(dir, "--all", "--seed", "0").status, 2);
    assert.equal(run(dir, "--pkg", "pkgs/none").status, 2);
    assert.throws(() => parseArgs(["--unknown"]), /知らない指定/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("指定が無ければ何も流さず、決まった使い方を出して非ゼロで終わる", () => {
  // 小さなワークスペースで確かめる（無指定で流れてしまう退行のとき、リポジトリ全体を流して長引かせない）
  const dir = workspace({ fine: INDEPENDENT });
  try {
    const result = run(dir);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, `${USAGE}\n`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("流したパッケージが 0 件（全部が対象外）なら緑にしない。対象外の件数も出す", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shuffled-skip-"));
  try {
    fs.writeFileSync(path.join(dir, "pnpm-workspace.yaml"), 'packages:\n  - "pkgs/*"\n');
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "root", private: true, packageManager: REAL_PACKAGE_MANAGER }));
    fs.mkdirSync(path.join(dir, "pkgs/n"), { recursive: true });
    fs.writeFileSync(path.join(dir, "pkgs/n/package.json"), JSON.stringify({ name: "n", scripts: { test: "node --test" } }));
    const result = run(dir, "--all");
    assert.equal(result.status, 1);
    assert.match(result.stdout, /流した 0 件・対象外 1 件・失敗 0 件/);
    assert.match(result.stdout, /0 件です/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("版が合わないときは、--root を付けても 1 つも流さずに止まる（docs/adr/0031 決定 2）", () => {
  const dir = workspace({ fine: INDEPENDENT });
  try {
    const spawned = [];
    const spawn = (...call) => { spawned.push(call); return { status: 0 }; };
    assert.equal(execute(["--all", "--root", dir, "--seed", "1"], { checkToolchain: () => false, spawn }), 1);
    assert.equal(execute(["--pkg", "pkgs/fine", "--root", dir], { checkToolchain: () => false, spawn }), 1);
    assert.deepEqual(spawned, []);
    // 合うときは流す（差し替えは版の確かめだけ。流す配線は生きている）
    assert.equal(execute(["--all", "--root", dir, "--seed", "1"], { checkToolchain: () => true, spawn }), 0);
    assert.equal(spawned.length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("版の確かめを飛ばす指定は無い（--root・環境変数）", () => {
  assert.throws(() => parseArgs(["--all", "--skip-toolchain"]), /知らない指定/);
  const source = fs.readFileSync(SCRIPT, "utf8");
  assert.doesNotMatch(source, /process\.env/);
});

test("最初の行の再現コマンドは、実際に流した指定と種を含み、そのまま貼れる", () => {
  const dir = workspace({ fine: INDEPENDENT });
  try {
    for (const args of [["--all", "--seed", "42"], ["--pkg", "pkgs/fine", "--seed", "42"]]) {
      const first = seedLine(run(dir, ...args).stdout);
      const line = /同じ種で再現: node scripts\/test-shuffled\.mjs (.+)）/.exec(first)?.[1];
      assert.ok(line, first);
      const again = parseArgs(line.split(" "));
      assert.equal(again.seed, 42);
      assert.ok(again.all || again.pkg, "貼っても使い方を出して終わる");
      assert.equal(again.pkg, args[0] === "--pkg" ? "pkgs/fine" : undefined);
    }
    assert.equal(rerunCommand({ all: true }, 7), "node scripts/test-shuffled.mjs --all --seed 7");
    assert.equal(rerunCommand({ pkg: "apps/x" }, 7), "node scripts/test-shuffled.mjs --pkg apps/x --seed 7");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("既定の版の確かめは check-toolchain.mjs を段 test で起動し、その終了コードで決まる", () => {
  const call = toolchainCheckCall();
  assert.equal(call.command, process.execPath);
  assert.equal(call.args.length, 2);
  assert.equal(path.relative(path.dirname(SCRIPT), call.args[0]), "check-toolchain.mjs");
  assert.equal(call.args[1], "test");
  const seen = [];
  const fake = (status) => (command, args) => { seen.push([command, args]); return { status }; };
  assert.equal(checkToolchain(fake(0)), true);
  assert.equal(checkToolchain(fake(1)), false);
  assert.equal(checkToolchain(fake(null)), false);
  assert.equal(checkToolchain(() => ({ error: new Error("起動できない"), status: null })), false);
  assert.deepEqual(seen[0], [call.command, call.args]);
  assert.equal(seen.length, 3);
});

test("既定の版の確かめが配線されている: spawn だけを差し替えて check-toolchain が 1 を返すと、1 つも流さず終了コード 1", () => {
  const dir = workspace({ fine: INDEPENDENT });
  try {
    const calls = [];
    const spawn = (command, args) => {
      calls.push(args);
      return { status: args.some((a) => a.endsWith("check-toolchain.mjs")) ? 1 : 0 };
    };
    assert.equal(execute(["--all", "--root", dir, "--seed", "1"], { spawn }), 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1], "test");
    // 通れば、同じ spawn でパッケージも流れる
    const ok = [];
    assert.equal(execute(["--all", "--root", dir, "--seed", "1"], { spawn: (c, a) => { ok.push(a); return { status: 0 }; } }), 0);
    assert.equal(ok.length, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("入口の配線: 本体のソースの execute の呼び出しは main の 1 回だけで、版の確かめを差し替える引数を渡さない", () => {
  // コメントの中の execute( で通らないよう、コメントを除いて数える
  const source = fs.readFileSync(SCRIPT, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
  const calls = [...source.matchAll(/(?<!function )\bexecute\([^\n]*/g)].map((m) => m[0]);
  assert.deepEqual(calls, ["execute(process.argv.slice(2));"]);
});

const REPO_ROOT = path.resolve(path.dirname(SCRIPT), "..");

/** 本体とそれが読むもの（scripts/lib の本体・check-toolchain・宣言）を一時ディレクトリへ写す。 */
function repoCopy(toolchainJson) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shuffled-copy-"));
  fs.mkdirSync(path.join(dir, "scripts/lib"), { recursive: true });
  for (const file of ["test-shuffled.mjs", "check-toolchain.mjs"]) fs.copyFileSync(path.join(REPO_ROOT, "scripts", file), path.join(dir, "scripts", file));
  for (const file of fs.readdirSync(path.join(REPO_ROOT, "scripts/lib")).filter((f) => f.endsWith(".mjs") && !f.endsWith(".test.mjs"))) {
    fs.copyFileSync(path.join(REPO_ROOT, "scripts/lib", file), path.join(dir, "scripts/lib", file));
  }
  fs.copyFileSync(path.join(REPO_ROOT, "package.json"), path.join(dir, "package.json"));
  fs.writeFileSync(path.join(dir, "toolchain.json"), toolchainJson);
  return dir;
}

test("本物の起動（main を通る）: 宣言と合わない版では、1 つも流さず『始めません』で終わる。合う宣言では流れる", () => {
  const real = fs.readFileSync(path.join(REPO_ROOT, "toolchain.json"), "utf8");
  const bad = JSON.stringify({ ...JSON.parse(real), bun: "9.9.9" });
  // 流したら印を残すテスト（流れたかどうかを、出力でなく副作用で見る）
  const marker = fs.mkdtempSync(path.join(os.tmpdir(), "shuffled-marker-"));
  const probe = `import { test } from "bun:test";\nimport fs from "node:fs";\ntest("ran", () => { fs.writeFileSync(${JSON.stringify(path.join(marker, "ran"))}, "1"); });\n`;
  const ws = workspace({ fine: probe });
  const copies = [];
  try {
    const launch = (toolchainJson, ...args) => {
      const copy = repoCopy(toolchainJson);
      copies.push(copy);
      return spawnSync("node", [path.join(copy, "scripts/test-shuffled.mjs"), "--root", ws, ...args], { encoding: "utf8" });
    };
    // 版が外れている: 止まる。--pkg でも --all でも同じ
    for (const args of [["--pkg", "pkgs/fine", "--seed", "1"], ["--all", "--seed", "1"]]) {
      const result = launch(bad, ...args);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stderr, /始めません/);
      assert.equal(fs.existsSync(path.join(marker, "ran")), false, "版が合わないのにテストが流れた");
    }
    // 対照: 同じ複製の作り方で、合う宣言なら流れる（複製が壊れて止まったのではないこと）
    const ok = launch(real, "--pkg", "pkgs/fine", "--seed", "1");
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.equal(fs.existsSync(path.join(marker, "ran")), true);
  } finally {
    for (const dir of [...copies, ws, marker]) fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("--pkg は指定のパッケージだけを計画する。関係の無いパッケージの test スクリプトで止まらない（--all は止まる）", () => {
  const dir = workspace({ fine: INDEPENDENT });
  fs.mkdirSync(path.join(dir, "pkgs/odd"));
  fs.writeFileSync(path.join(dir, "pkgs/odd/package.json"), JSON.stringify({ name: "odd", scripts: { test: "jest" } }));
  try {
    const one = run(dir, "--pkg", "pkgs/fine", "--seed", "1");
    assert.equal(one.status, 0, one.stdout + one.stderr);
    assert.match(one.stdout, /流した 1 件/);
    const all = run(dir, "--all", "--seed", "1");
    assert.equal(all.status, 1);
    assert.match(all.stderr, /知らないテストランナー/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("--pkg は ./・末尾の /・絶対パスでも同じパッケージを指し、無いものは見つかりませんで 2", () => {
  const dir = workspace({ fine: INDEPENDENT });
  try {
    for (const spelled of ["./pkgs/fine", "pkgs/fine/", path.join(dir, "pkgs/fine"), "pkgs//fine"]) {
      const result = run(dir, "--pkg", spelled, "--seed", "1");
      assert.equal(result.status, 0, `${spelled}: ${result.stdout}${result.stderr}`);
      assert.match(result.stdout, /流した 1 件/);
    }
    for (const missing of ["pkgs/none", "../outside"]) assert.equal(run(dir, "--pkg", missing).status, 2, missing);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("--all と --pkg の両方は使い方の誤り（終了コード 2、何も流さない）", () => {
  assert.throws(() => parseArgs(["--all", "--pkg", "x"]), /同時に使えません/);
  const dir = workspace({ fine: INDEPENDENT });
  try {
    const result = run(dir, "--all", "--pkg", "pkgs/fine");
    assert.equal(result.status, 2);
    assert.doesNotMatch(result.stdout, /流した/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("--root を使ったとき、最初の行と最後の再現コマンドにも --root（と絶対パスの cd）が付く", () => {
  const dir = workspace({ dependent: ORDER_DEPENDENT });
  try {
    let failing;
    for (let seed = 1; seed <= 10 && !failing; seed++) {
      const result = run(dir, "--all", "--seed", String(seed));
      if (result.status !== 0) failing = { seed, out: result.stdout };
    }
    assert.ok(failing);
    assert.match(seedLine(failing.out), new RegExp(`--all --seed ${failing.seed} --root ${dir.replaceAll("/", "\\/")}`));
    assert.match(failing.out, new RegExp(`再現（種 ${failing.seed}）: cd ${path.join(dir, "pkgs/dependent").replaceAll("/", "\\/")} && pnpm exec bun test`));
    // 最初の行のコマンドは、そのまま解析でき、同じ root を指す
    const again = parseArgs(/同じ種で再現: node scripts\/test-shuffled\.mjs (.+)）/.exec(seedLine(failing.out))[1].split(" "));
    assert.equal(again.root, dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
