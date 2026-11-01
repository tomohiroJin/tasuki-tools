import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { deriveChecks, planChecks, runChecks } from "./local-check.mjs";

const workflow = fs.readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

test("CI の全検査と matrix の全シャードを同じ引数で導く", () => {
  const checks = deriveChecks(workflow);
  assert.ok(checks.some((c) => c.command === "pnpm typecheck"));
  assert.ok(checks.some((c) => c.command === "pnpm e2e"));
  assert.ok(checks.some((c) => c.command.includes("shellcheck -x --source-path=deploy --severity=warning")));
  assert.ok(checks.some((c) => c.command.includes("node --test $targets")));
  assert.deepEqual(planChecks(checks, "full", false), checks);
  assert.deepEqual(checks.filter((c) => c.job === "mutation" && !c.reason).map((c) => c.env), [
    { SHARD_INDEX: "0", SHARD_TOTAL: "2" }, { SHARD_INDEX: "1", SHARD_TOTAL: "2" },
  ]);
});

test("CI に足した検査・変えた引数が自動で全件の段に入る", () => {
  const changed = workflow.replace("- run: pnpm lint", "- run: node scripts/new-check.mjs --strict\n      - run: pnpm lint --new-flag");
  const plan = planChecks(deriveChecks(changed), "full", true);
  assert.ok(plan.some((c) => c.command === "node scripts/new-check.mjs --strict" && !c.reason));
  assert.ok(plan.some((c) => c.command === "pnpm lint --new-flag" && !c.reason));
});

test("読めない YAML・CI 固有の環境を黙って無視しない", () => {
  for (const changed of [
    workflow.replace("run: pnpm lint", "run: >\n          pnpm lint"),
    workflow.replace("run: pnpm lint", "run: pnpm lint\n        env:\n          EXTRA: true"),
    workflow.replace("shard: [1, 2]", "shard: [1, 2]\n        platform: [linux, mac]"),
    workflow.replace("run: pnpm lint", "run: echo ${{ secrets.EXAMPLE }}"),
    workflow.replace("      - run: pnpm lint", "      - {run: pnpm lint}"),
    workflow.replace("    runs-on: ubuntu-latest", "    env:\n      EXTRA: true\n    runs-on: ubuntu-latest"),
    workflow.replace('COREPACK_ENABLE_DOWNLOAD_PROMPT: "0"', 'EXTRA: "true"'),
    workflow.replace("- run: pnpm lint", "- uses: example/validation@v1\n      - run: pnpm lint"),
  ]) assert.throws(() => deriveChecks(changed));
});

test("速い段は build・E2E を理由つきで省略し、変異を --changed にする", () => {
  const plan = planChecks(deriveChecks(workflow), "fast", true);
  assert.ok(plan.some((c) => c.command === "pnpm test" && !c.reason));
  assert.ok(plan.filter((c) => /pnpm (build|e2e)$/.test(c.command)).every((c) => c.reason));
  assert.equal(plan.filter((c) => c.command === "node scripts/mutation-check.mjs --changed" && !c.reason).length, 1);
  const docs = planChecks(deriveChecks(workflow), "fast", false);
  assert.ok(docs.find((c) => c.command === "pnpm test").reason);
  assert.ok(docs.some((c) => c.command === "node scripts/check-links.mjs" && !c.reason));
});

test("供給網 install は両方の段で CI 専用として省略し、実行しない", () => {
  for (const mode of ["fast", "full"]) {
    const plan = planChecks(deriveChecks(workflow), mode, true);
    const install = plan.find((c) => c.command === "node scripts/install-with-supply-chain-check.mjs");
    assert.match(install.reason ?? "", /CI.*新規|新規.*CI/);
    let ran = false;
    const [result] = runChecks([install], { preflight: () => true, execute: () => { ran = true; return false; } });
    assert.equal(ran, false);
    assert.equal(result.status, "skipped");
  }
});

test("版チェックに失敗したら検査を 1 本も始めず、全件の省略理由を報告する", () => {
  const calls = [];
  const results = runChecks([{ command: "first" }, { command: "second" }], {
    preflight: () => false, execute: (c) => { calls.push(c); return true; },
  });
  assert.deepEqual(calls, []);
  assert.ok(results.every((c) => c.status === "skipped" && /版/.test(c.reason)));
});

test("失敗しても残りを流し、成功・失敗・省略を区別する", () => {
  const calls = [];
  const results = runChecks([{ command: "bad" }, { command: "good" }, { command: "slow", reason: "速い段" }], {
    preflight: () => true, execute: (c) => { calls.push(c.command); return c.command !== "bad"; },
  });
  assert.deepEqual(calls, ["bad", "good"]);
  assert.deepEqual(results.map((c) => c.status), ["failed", "passed", "skipped"]);
});

function fixture(t, { failPreflight = false, failCheck = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-check-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const file of ["local-check.mjs", "audit-toolchain.mjs", "ci-scope.mjs", "lib/direct-run.mjs", "lib/toolchain.mjs", "lib/scan-targets.mjs", "lib/workflow.mjs", "lib/ci-scope.mjs"]) {
    const target = path.join(dir, "scripts", file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(new URL(file, import.meta.url), target);
  }
  fs.writeFileSync(path.join(dir, "scripts/check-toolchain.mjs"), `console.log('PREFLIGHT ' + process.argv[2]); process.exit(${failPreflight ? 1 : 0});`);
  fs.writeFileSync(path.join(dir, "scripts/install-with-supply-chain-check.mjs"), "throw new Error('SUPPLY-INSTALL-RAN');");
  fs.mkdirSync(path.join(dir, ".github/workflows"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".github/workflows/ci.yml"), `jobs:
  ci:
    steps:
      - run: node -e 'console.log("FIRST"); process.exit(${failCheck ? 1 : 0})'
      - run: node -e 'console.log("SECOND")'
  quality:
    steps:
      - run: node scripts/install-with-supply-chain-check.mjs
`);
  return dir;
}

test("CLI の実経路: full の実行・失敗の集約・事前停止・symlink 起動", (t) => {
  for (const options of [{}, { failCheck: true }, { failPreflight: true }]) {
    const dir = fixture(t, options);
    const entry = path.join(dir, "entry.mjs");
    fs.symlinkSync(path.join(dir, "scripts/local-check.mjs"), entry);
    // リポジトリの外からも、その入口が属するリポジトリを使う。
    const r = spawnSync(process.execPath, [entry, "full"], { cwd: os.tmpdir(), encoding: "utf8" });
    assert.ifError(r.error);
    assert.equal(r.status, options.failCheck || options.failPreflight ? 1 : 0, r.stderr);
    assert.match(r.stdout, /PREFLIGHT e2e/);
    assert.match(r.stdout, /実行結果/);
    if (options.failPreflight) {
      assert.doesNotMatch(r.stdout, /^FIRST$|^SECOND$/m);
      assert.match(r.stdout, /省略.*版チェック/);
    } else {
      assert.match(r.stdout, /^FIRST$/m);
      assert.match(r.stdout, /^SECOND$/m);
      assert.match(r.stdout, options.failCheck ? /失敗/ : /成功/);
    }
  }
});

test("CLI の一覧は検査と版チェックを起動せず、間違った引数は非ゼロ", (t) => {
  const dir = fixture(t);
  const entry = path.join(dir, "scripts/local-check.mjs");
  const r = spawnSync(process.execPath, [entry, "full", "--list"], { encoding: "utf8" });
  assert.ifError(r.error);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /予定/);
  assert.doesNotMatch(r.stdout, /PREFLIGHT|^FIRST$|^SECOND$/m);
  for (const args of [[], ["unknown"], ["fast", "--unknown"]]) {
    const invalid = spawnSync(process.execPath, [entry, ...args], { encoding: "utf8" });
    assert.equal(invalid.status, 2);
    assert.match(invalid.stderr, /使い方/);
  }
});

function gitFixture(t) {
  const dir = fixture(t);
  fs.writeFileSync(path.join(dir, ".github/workflows/ci.yml"), `jobs:
  ci:
    steps:
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
`);
  fs.writeFileSync(path.join(dir, "note.md"), "original\n");
  fs.writeFileSync(path.join(dir, "a.ts"), "export const value = 1;\n");
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const commit = () => git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--no-gpg-sign", "-m", "fixture");
  git("init"); git("add", "."); commit();
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  const check = (code) => {
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/local-check.mjs"), "fast", "--list"], { encoding: "utf8" });
    assert.ifError(r.error);
    assert.equal(r.status, 0, r.stderr);
    for (const command of ["typecheck", "lint", "test"]) {
      assert.ok(r.stdout.includes(`[${code ? "予定" : "省略"}] ci: pnpm ${command}`), r.stdout);
    }
    return r.stdout;
  };
  return { dir, git, commit, check };
}

test("fast の実 git 差分: 文書だけの未ステージ・ステージ済み・コミット済み・未追跡", (t) => {
  const f = gitFixture(t);
  fs.writeFileSync(path.join(f.dir, "note.md"), "edited\n"); f.check(false);
  f.git("add", "note.md"); f.check(false);
  f.commit(); f.check(false);
  fs.writeFileSync(path.join(f.dir, "new.md"), "untracked\n"); f.check(false);
});

test("fast の実 git 差分: 未追跡のコードを落とさない", (t) => {
  const f = gitFixture(t);
  fs.writeFileSync(path.join(f.dir, "note.md"), "edited\n");
  fs.writeFileSync(path.join(f.dir, "new.ts"), "export {};\n");
  f.check(true);
});

test("fast の実 git 差分: コードから文書への改名でも削除側を数える", (t) => {
  const f = gitFixture(t);
  f.git("mv", "a.ts", "a.md"); f.check(true);
  f.commit(); f.check(true);
});

test("fast の実 git 差分: コードの削除と、基準が無いときは検査を流す", (t) => {
  const f = gitFixture(t);
  fs.unlinkSync(path.join(f.dir, "a.ts")); f.check(true);
  f.git("restore", "a.ts");
  fs.writeFileSync(path.join(f.dir, "note.md"), "edited\n");
  f.git("update-ref", "-d", "refs/remotes/origin/main");
  assert.match(f.check(true), /差分を判定できない/);
});

test("--list も複数行のコマンドを一行で表示する", (t) => {
  const dir = fixture(t);
  fs.writeFileSync(path.join(dir, ".github/workflows/ci.yml"), "jobs:\n  ci:\n    steps:\n      - run: |\n          echo FIRST\n          echo SECOND\n");
  const r = spawnSync(process.execPath, [path.join(dir, "scripts/local-check.mjs"), "full", "--list"], { encoding: "utf8" });
  assert.ifError(r.error);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\[予定\] ci: echo FIRST \/ echo SECOND/);
  assert.equal(r.stdout.trim().split("\n").length, 1);
});
