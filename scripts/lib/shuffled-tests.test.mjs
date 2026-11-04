import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listWorkspacePackages } from "./scan-targets.mjs";
import { shuffledCommand, parseSeed, newSeed, SEED_MAX, planShuffledRuns, reproCommand } from "./shuffled-tests.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REAL_PACKAGE_MANAGER = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).packageManager;

test("vitest と bun の test スクリプトに、ランダムな順と種の指定を足す", () => {
  assert.deepEqual(shuffledCommand("vitest run", 7).args, ["vitest", "run", "--sequence.shuffle", "--sequence.seed=7"]);
  assert.deepEqual(shuffledCommand("vitest run --coverage", 7).args, ["vitest", "run", "--coverage", "--sequence.shuffle", "--sequence.seed=7"]);
  assert.deepEqual(shuffledCommand("bun test --timeout 15000", 9).args, ["bun", "test", "--timeout", "15000", "--randomize", "--seed=9"]);
});

test("node --test と test の無いパッケージは理由つきで対象外、知らないランナーは落とす", () => {
  assert.match(shuffledCommand("node --test tests/*.test.mjs", 1).skip, /Node 22/);
  assert.match(shuffledCommand(undefined, 1).skip, /無い/);
  assert.throws(() => shuffledCommand("jest", 1), /知らないテストランナー/);
  assert.throws(() => shuffledCommand("vitest run && echo done", 1), /シェルの記法/);
});

test("種は 1〜SEED_MAX の整数だけを受け付け、毎回の種はその範囲に収まる", () => {
  assert.equal(parseSeed("11"), 11);
  for (const bad of ["0", "-1", "1.5", "abc", "", String(SEED_MAX + 1)]) assert.throws(() => parseSeed(bad), /種は/);
  assert.equal(newSeed(() => 0), 1);
  assert.equal(newSeed(() => 0.999999999999), SEED_MAX);
});

test("実リポジトリの全パッケージが、流すか理由つきで対象外のどちらかになる", () => {
  const plan = planShuffledRuns(ROOT, 5);
  // pnpm 自身の列挙と計画が 1 対 1（コメント行などで黙って抜けない。件数の下限は直書きしない）
  const listed = listWorkspacePackages(ROOT);
  assert.deepEqual(plan.map((r) => r.dir), listed);
  assert.equal(new Set(plan.map((r) => r.dir)).size, listed.length);
  for (const run of plan) assert.ok(Boolean(run.args) !== Boolean(run.skip), run.dir);
  // 対象外は node --test の packages/ui だけ（scripts/ はワークスペースの外）。ほかが黙って外れたら落とす
  assert.deepEqual(plan.filter((r) => r.skip).map((r) => r.dir), ["packages/ui"]);
  assert.ok(plan.find((r) => r.dir === "apps/tasuki-sync").args.includes("--randomize"));
  assert.ok(plan.find((r) => r.dir === "apps/timer-web").args.includes("--sequence.shuffle"));
});

test("再現のコマンドは、ルートからそのまま貼れて、同じ種を含む", () => {
  const run = planShuffledRuns(ROOT, 123).find((r) => r.dir === "apps/timer-web");
  assert.equal(reproCommand(run), "cd apps/timer-web && pnpm exec vitest run --sequence.shuffle --sequence.seed=123");
  // --root で別のワークスペースを流したときは、そこへの絶対パスから cd する
  assert.equal(reproCommand(run, "/work/ws"), "cd /work/ws/apps/timer-web && pnpm exec vitest run --sequence.shuffle --sequence.seed=123");
});

test("ワークスペースの列挙は yaml のコメント行に左右されない", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shuffled-ws-"));
  try {
    fs.writeFileSync(path.join(dir, "pnpm-workspace.yaml"), 'packages:\n  - "pkgs/*"\n  # コメント\n  - "single"\n');
    for (const d of ["pkgs/a", "pkgs/b", "single"]) {
      fs.mkdirSync(path.join(dir, d), { recursive: true });
      fs.writeFileSync(path.join(dir, d, "package.json"), JSON.stringify({ name: d.replace("/", "-"), scripts: { test: "bun test" } }));
    }
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "root", private: true, packageManager: REAL_PACKAGE_MANAGER }));
    assert.deepEqual(listWorkspacePackages(dir), ["pkgs/a", "pkgs/b", "single"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
