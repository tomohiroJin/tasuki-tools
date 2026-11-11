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
    { SHARD_INDEX: "0", SHARD_TOTAL: "3" }, { SHARD_INDEX: "1", SHARD_TOTAL: "3" }, { SHARD_INDEX: "2", SHARD_TOTAL: "3" },
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
    workflow.replace("shard: [1, 2, 3]", "shard: [1, 2, 3]\n        platform: [linux, mac]"),
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

test("ランダムな順のテストは全件の段に入り、速い段では理由つきで省略する（#524）", () => {
  const command = "node scripts/test-shuffled.mjs --all";
  const full = planChecks(deriveChecks(workflow), "full", true);
  assert.equal(full.filter((c) => c.command === command && !c.reason).length, 1);
  const fast = planChecks(deriveChecks(workflow), "fast", true);
  assert.match(fast.find((c) => c.command === command).reason, /速い段/);
  // 速い段で、shuffle ジョブの流す検査が 1 本も残らない（build も省略される）
  assert.ok(fast.filter((c) => c.job === "shuffle").every((c) => c.reason));
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

const WORKER_START_FAILURE = [
  "@tasuki/sync-client:test: Vitest caught 1 unhandled error during the test run.",
  "@tasuki/sync-client:test: Error: [vitest-pool]: Failed to start forks worker for test files /repo/packages/sync-client/tests/connection.test.ts.",
  "@tasuki/sync-client:test: Caused by: Error: [vitest-pool-runner]: Timeout waiting for worker to respond",
  "Failed:    @tasuki/sync-client#test",
].join("\n");

test("ワーカーが起動しなかっただけの赤は未実行として失敗と分ける（#508）", () => {
  const results = runChecks([{ command: "not-started" }, { command: "real" }, { command: "boolean" }], {
    preflight: () => true,
    execute: (c) => {
      if (c.command === "not-started") return { passed: false, output: WORKER_START_FAILURE };
      if (c.command === "real") return { passed: false, output: `${WORKER_START_FAILURE}\n@tasuki/sync-client:test:  FAIL  tests/a.test.ts > a` };
      return false;
    },
  });
  assert.deepEqual(results.map((c) => c.status), ["not-run", "failed", "failed"]);
  assert.match(results[1].reason, /ほかにワーカーが起動しなかったもの: @tasuki\/sync-client#test: 1 ファイル/);
  assert.match(results[0].reason, /ワーカーが起動しなかった（@tasuki\/sync-client#test: 1 ファイル）/);
  assert.match(results[0].reason, /流し直して/);
  assert.equal(results[2].reason, undefined);
});

test("turbo が打ち切ったタスクがあれば、パッケージだけでなく同じコマンドの流し直しを求める（PR #512 の敵対的レビュー 1）", () => {
  const cut = WORKER_START_FAILURE.replace("Failed:", " Tasks:    3 successful, 24 total\nFailed:");
  const [result] = runChecks([{ command: "pnpm test" }], { preflight: () => true, execute: () => ({ passed: false, output: cut }) });
  assert.equal(result.status, "not-run");
  assert.match(result.reason, /turbo が打ち切ったタスクが 20 個/);
  assert.match(result.reason, /同じコマンド（pnpm test）を流し直して/);
  assert.doesNotMatch(result.reason, /pnpm --filter/);
});

function fixture(t, { failPreflight = false, failCheck = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-check-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const file of ["local-check.mjs", "audit-toolchain.mjs", "ci-scope.mjs", "lib/direct-run.mjs", "lib/check-outcome.mjs", "lib/prior-work.mjs", "lib/structure-metrics.mjs", "lib/toolchain.mjs", "lib/scan-targets.mjs", "lib/workflow.mjs", "lib/ci-scope.mjs"]) {
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

test("速い段は、構造監査の合否の無い指標が merge-base から後退していれば ⚠ で知らせ、落とさない（#578）", (t) => {
  const f = gitFixture(t);
  fs.writeFileSync(path.join(f.dir, ".github/workflows/ci.yml"), FAST_CI);
  // 偽の構造監査: 作業場所の metric.txt の値を SC029 として出す
  fs.writeFileSync(
    path.join(f.dir, "scripts/audit-structure.mjs"),
    "import fs from 'node:fs'; const v = fs.readFileSync('metric.txt', 'utf8').trim();\n" +
      "console.log('SC | 現状値 | 目標値 | 判定'); console.log('---'); for (const id of ['SC027','SC028','SC030','SC031','SC035']) console.log(id + ' | 0 | 0 | PASS'); console.log('SC029 | ' + v + ' | 0 | 未達'); console.log('SC032 | 10/20（50.0%） | 100% | —'); console.log('SC036 | 100 | x | —');\n",
  );
  fs.writeFileSync(path.join(f.dir, "metric.txt"), "86\n");
  f.git("add", "."); f.commit();
  f.git("update-ref", "refs/remotes/origin/main", "HEAD");
  const env = { ...process.env, TMPDIR: fs.mkdtempSync(path.join(os.tmpdir(), "metrics-tmp-")) };
  t.after(() => fs.rmSync(env.TMPDIR, { recursive: true, force: true }));
  const run = () => spawnSync(process.execPath, [path.join(f.dir, "scripts/local-check.mjs"), "fast"], { encoding: "utf8", env });
  // コードの差分あり・値が増えた（後退）
  fs.writeFileSync(path.join(f.dir, "metric.txt"), "90\n");
  fs.writeFileSync(path.join(f.dir, "new.ts"), "export {};\n");
  const bad = run();
  assert.equal(bad.status, 0, bad.stdout + bad.stderr); // 落とさない
  assert.ok(bad.stdout.lastIndexOf("⚠ 構造監査の合否の無い指標が後退しています") > bad.stdout.indexOf("実行結果"), bad.stdout);
  assert.match(bad.stdout, /SC029 86 → 90/);
  // 同じ値なら後退なし
  fs.writeFileSync(path.join(f.dir, "metric.txt"), "86\n");
  const ok = run();
  assert.doesNotMatch(ok.stdout, /⚠ 構造監査/);
  assert.match(ok.stdout, /後退していません/);
  // コードの差分が無ければ比べない
  fs.unlinkSync(path.join(f.dir, "new.ts"));
  fs.writeFileSync(path.join(f.dir, "note.md"), "edited\n");
  assert.doesNotMatch(run().stdout, /構造監査の合否の無い指標/);
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

test("CLI の実経路: 起動しなかっただけの赤を未実行と出し、非ゼロで終わる（#508）", (t) => {
  for (const real of [false, true]) {
    const dir = fixture(t);
    const output = `${WORKER_START_FAILURE}${real ? "\n@tasuki/sync-client:test:  FAIL  tests/a.test.ts > a" : ""}`;
    fs.writeFileSync(path.join(dir, "out.txt"), output);
    fs.writeFileSync(path.join(dir, ".github/workflows/ci.yml"), "jobs:\n  ci:\n    steps:\n      - run: cat out.txt && exit 1\n");
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/local-check.mjs"), "full"], { encoding: "utf8" });
    assert.ifError(r.error);
    assert.equal(r.status, 1, r.stderr);
    // 出力はその場でも流れる（控えるために隠さない）
    assert.match(r.stdout, /Failed to start forks worker/);
    if (real) {
      assert.match(r.stdout, /\[失敗\] ci: cat out\.txt/);
      assert.doesNotMatch(r.stdout, /未実行/);
    } else {
      assert.match(r.stdout, /\[未実行\] ci: cat out\.txt && exit 1 — テストのワーカーが起動しなかった/);
      assert.match(r.stdout, /失敗 0 件・未実行 1 件/);
    }
  }
});

test("速い段は、検査より前に変異の見込みを出し、知らせを最後にもう一度出す（#508）", (t) => {
  const dir = fixture(t);
  fs.writeFileSync(path.join(dir, ".github/workflows/ci.yml"), `jobs:
  ci:
    steps:
      - run: node -e 'console.log("FIRST")'
  mutation:
    strategy:
      matrix:
        shard: [1, 2]
    steps:
      - run: node scripts/mutation-check.mjs --shard "$((SHARD_INDEX + 1))/$SHARD_TOTAL"
        env:
          SHARD_INDEX: \${{ strategy.job-index }}
          SHARD_TOTAL: \${{ strategy.job-total }}
`);
  fs.writeFileSync(
    path.join(dir, "scripts/mutation-check.mjs"),
    "const a = process.argv.slice(2).join(' ');\n" +
      "if (a === '--changed --plan') { console.log('[mutation-check] 見込み: 526 件'); console.log('[mutation-check] ⚠ 全件に切り替わりました'); console.log('[mutation-check]   手元で絞るなら: --id 9'); }\n" +
      "else console.log('MUTATION ' + a);\n",
  );
  const listed = spawnSync(process.execPath, [path.join(dir, "scripts/local-check.mjs"), "fast", "--list"], { encoding: "utf8" });
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /見込み: 526 件[\s\S]*\[予定\] ci:/);
  assert.doesNotMatch(listed.stdout, /^MUTATION/m);

  const r = spawnSync(process.execPath, [path.join(dir, "scripts/local-check.mjs"), "fast"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const forecast = r.stdout.indexOf("見込み: 526 件");
  assert.ok(forecast >= 0 && forecast < r.stdout.indexOf("FIRST"), r.stdout);
  assert.match(r.stdout, /^MUTATION --changed$/m);
  assert.ok(r.stdout.lastIndexOf("⚠ 全件に切り替わりました") > r.stdout.indexOf("実行結果"), r.stdout);
  assert.ok(r.stdout.lastIndexOf("手元で絞るなら: --id 9") > r.stdout.indexOf("実行結果"), r.stdout);
});

/** 偽の gh と git を PATH の先頭に置いた環境を返す（ネットワークを叩かない）。 */
function fakeTools(t, { branch, prs = "[]", heads = "", ghFails = false }) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "local-check-bin-"));
  t.after(() => fs.rmSync(bin, { recursive: true, force: true }));
  const tool = (name, body) => {
    fs.writeFileSync(path.join(bin, name), `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
  };
  tool("gh", ghFails ? "console.error('gh: not logged in'); process.exit(1);" : `process.stdout.write(${JSON.stringify(prs)});`);
  tool("git", `const a = process.argv.slice(2); if (a[0] === 'rev-parse') process.stdout.write(${JSON.stringify(`${branch}\n`)}); else if (a[0] === 'ls-remote') process.stdout.write(${JSON.stringify(heads)}); else process.exit(1);`);
  return { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
}

const FAST_CI = `jobs:
  ci:
    steps:
      - run: node -e 'console.log("FIRST")'
`;

test("速い段は、同じ ISSUE の先行 PR・枝を最初に出し、⚠ を最後にもう一度出す（#504）", (t) => {
  const dir = fixture(t);
  fs.writeFileSync(path.join(dir, ".github/workflows/ci.yml"), FAST_CI);
  const prs = JSON.stringify([{ number: 501, title: "docs: 試し（#491）", body: "#504〜", state: "MERGED", headRefName: "x/501" }]);
  const env = fakeTools(t, { branch: "docs/504-x", prs, heads: "1111\trefs/heads/docs/504-other\n" });
  const r = spawnSync(process.execPath, [path.join(dir, "scripts/local-check.mjs"), "fast"], { encoding: "utf8", env });
  assert.equal(r.status, 0, r.stdout + r.stderr); // 止めない
  const first = r.stdout.indexOf("PR #501（マージ済み）");
  assert.ok(first >= 0 && first < r.stdout.indexOf("FIRST"), r.stdout);
  assert.ok(r.stdout.lastIndexOf("⚠ 同じ ISSUE #504 の他の PR・枝があります") > r.stdout.indexOf("実行結果"), r.stdout);
});

test("速い段は、番号の無い枝では ⚠ なしの案内 1 行で、最後の一覧では繰り返さない（#504）", (t) => {
  const dir = fixture(t);
  fs.writeFileSync(path.join(dir, ".github/workflows/ci.yml"), FAST_CI);
  const r = spawnSync(process.execPath, [path.join(dir, "scripts/local-check.mjs"), "fast"], { encoding: "utf8", env: fakeTools(t, { branch: "renovate/non-breaking" }) });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout.split("先行 PR の確認は省きました").length - 1, 1, r.stdout);
  assert.doesNotMatch(r.stdout, /⚠ 同じ ISSUE/);
});

test("速い段は、gh が使えないときは失敗にせず ⚠ の未実行と理由を出し、最後にも繰り返す（#504）", (t) => {
  const dir = fixture(t);
  fs.writeFileSync(path.join(dir, ".github/workflows/ci.yml"), FAST_CI);
  const r = spawnSync(process.execPath, [path.join(dir, "scripts/local-check.mjs"), "fast"], { encoding: "utf8", env: fakeTools(t, { branch: "docs/504-x", ghFails: true }) });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(r.stdout.lastIndexOf("⚠ 同じ ISSUE #504 の先行 PR の確認は未実行です") > r.stdout.indexOf("実行結果"), r.stdout);
});
