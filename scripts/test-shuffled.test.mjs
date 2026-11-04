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
import { parseArgs, USAGE } from "./test-shuffled.mjs";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "test-shuffled.mjs");

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
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "root", private: true }));
  for (const [name, source] of Object.entries(files)) {
    fs.mkdirSync(path.join(dir, "pkgs", name), { recursive: true });
    fs.writeFileSync(path.join(dir, "pkgs", name, "package.json"), JSON.stringify({ name, scripts: { test: "bun test" } }));
    fs.writeFileSync(path.join(dir, "pkgs", name, "a.test.ts"), source);
  }
  return dir;
}
const run = (dir, ...args) => spawnSync("node", [SCRIPT, "--root", dir, ...args], { encoding: "utf8" });
const launch = (...args) => spawnSync("node", [SCRIPT, ...args], { encoding: "utf8" });

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
    assert.match(out, new RegExp(`再現（種 ${failing.seed}）: cd pkgs/dependent && pnpm exec bun test --randomize --seed=${failing.seed}`));
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
    assert.match(result.stdout.split("\n")[0], /種 42/);
    assert.match(result.stdout, /流した 1 件・対象外 0 件・失敗 0 件/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("種を省くと毎回の種を出し、指定が不正なら始めない", () => {
  const dir = workspace({ fine: INDEPENDENT });
  try {
    assert.match(run(dir, "--all").stdout.split("\n")[0], /^\[shuffle\] 種 \d+/);
    assert.equal(run(dir, "--all", "--seed", "0").status, 2);
    assert.equal(run(dir, "--pkg", "pkgs/none").status, 2);
    assert.throws(() => parseArgs(["--unknown"]), /知らない指定/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("指定が無ければ何も流さず、決まった使い方を出して非ゼロで終わる", () => {
  const result = launch();
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, `${USAGE}\n`);
});

test("流したパッケージが 0 件（全部が対象外）なら緑にしない。対象外の件数も出す", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shuffled-skip-"));
  try {
    fs.writeFileSync(path.join(dir, "pnpm-workspace.yaml"), 'packages:\n  - "pkgs/*"\n');
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "root", private: true }));
    fs.mkdirSync(path.join(dir, "pkgs/n"), { recursive: true });
    fs.writeFileSync(path.join(dir, "pkgs/n/package.json"), JSON.stringify({ name: "n", scripts: { test: "node --test" } }));
    const result = run(dir, "--all");
    assert.equal(result.status, 1);
    assert.match(result.stdout, /流した 0 件・対象外 1 件・失敗 0 件/);
    assert.match(result.stdout, /0 件です/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
