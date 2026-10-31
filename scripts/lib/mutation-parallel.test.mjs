import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  parseJobs,
  planWorkers,
  workerArgs,
  worktreeDirFor,
  staleWorktreesFrom,
  formatWorkerSummary,
} from "./mutation-parallel.mjs";

/**
 * `scripts/lib/mutation-parallel.mjs` の自己テスト（#481）。
 *
 * 1 つのジョブの中で、作業ツリー（`git worktree`）を分けて変異を並列に流す仕組みの判定の部分を見る。
 * 実際に作業ツリーを作って流す配線（`mutation-check.mjs` の runInWorktrees）は I/O の塊なので、
 * ここでは扱わない（CI の実行そのものが確かめる）。
 */

describe("parseJobs: --jobs の解釈", () => {
  test("指定が無ければ 1（今までどおり 1 つの作業ツリーで直列）", () => {
    assert.equal(parseJobs([]), 1);
    assert.equal(parseJobs(["--shard", "1/2"]), 1);
  });

  test("--jobs m は正の整数", () => {
    assert.equal(parseJobs(["--jobs", "4"]), 4);
    assert.equal(parseJobs(["--shard", "1/2", "--jobs", "2"]), 2);
  });

  test("不正な値はエラー", () => {
    for (const bad of ["0", "-1", "1.5", "a", "", "4x"]) {
      assert.throws(() => parseJobs(["--jobs", bad]), /--jobs/, bad);
    }
  });

  test("2 回書いたらエラー（どちらが効くかを決めない）", () => {
    assert.throws(() => parseJobs(["--jobs", "2", "--jobs", "3"]), /1 回だけ/);
  });
});

const M = (id, pkg) => ({ id, pkg, tests: ["t.test.ts"] });
const launches = (g) => 1 + g.mutations.length;

describe("planWorkers: ワーカーへの割り当て", () => {
  test("ワーカーの数は、対照の組の数を超えない（空のワーカーを作らない）", () => {
    const muts = [M(1, "a"), M(2, "a"), M(3, "b")];
    const plan = planWorkers(muts, 4, launches);
    assert.equal(plan.length, 2);
  });

  test("合わせると選んだ全件で、重ならない", () => {
    const muts = [M(1, "a"), M(2, "b"), M(3, "c"), M(4, "a"), M(5, "d")];
    const plan = planWorkers(muts, 3, launches);
    assert.equal(plan.length, 3);
    assert.deepEqual(
      plan
        .flat()
        .map((m) => m.id)
        .sort((a, b) => a - b),
      [1, 2, 3, 4, 5],
    );
  });

  test("選んだ変異が 0 件なら、ワーカーも 0", () => {
    assert.deepEqual(planWorkers([], 4, launches), []);
  });
});

describe("workerArgs: ワーカーに渡す引数", () => {
  test("割り当てた変異を --id で渡す（ワーカーは普段の 1 回の実行そのもの）", () => {
    assert.deepEqual(workerArgs([M(3, "a"), M(10, "b")], false), ["--id", "3,10"]);
  });

  test("--full は引き継ぐ", () => {
    assert.deepEqual(workerArgs([M(3, "a")], true), ["--id", "3", "--full"]);
  });
});

describe("worktreeDirFor / staleWorktreesFrom: 作業ツリーの置き場と残骸", () => {
  test("置き場は一時ディレクトリの下に、親の PID と番号で名づける", () => {
    assert.equal(worktreeDirFor("/tmp", 1234, 2), path.join("/tmp", "tasuki-mutation-1234-2"));
  });

  const porcelain = [
    "worktree /repo",
    "HEAD abc",
    "branch refs/heads/main",
    "",
    "worktree /tmp/tasuki-mutation-111-1",
    "HEAD abc",
    "detached",
    "",
    "worktree /tmp/tasuki-mutation-222-1",
    "HEAD abc",
    "detached",
    "",
    "worktree /home/user/other-wt",
    "HEAD def",
    "branch refs/heads/feature",
    "",
  ].join("\n");

  test("親が死んでいる置き場だけを残骸とする（生きている実行の作業ツリーは消さない）", () => {
    const alive = (pid) => pid === 222;
    assert.deepEqual(staleWorktreesFrom(porcelain, alive), ["/tmp/tasuki-mutation-111-1"]);
  });

  test("名前の形が違う作業ツリー（人が作ったもの・本体）は残骸にしない", () => {
    assert.deepEqual(staleWorktreesFrom(porcelain, () => false), [
      "/tmp/tasuki-mutation-111-1",
      "/tmp/tasuki-mutation-222-1",
    ]);
  });
});

describe("formatWorkerSummary: ワーカーごとの結果", () => {
  test("件数・所要時間・終了コードを 1 行ずつ出し、落ちたワーカーを数える", () => {
    const { lines, failed } = formatWorkerSummary([
      { index: 1, count: 50, exitCode: 0, ms: 61_000 },
      { index: 2, count: 48, exitCode: 1, ms: 59_400 },
    ]);
    assert.deepEqual(lines, [
      "ワーカー 1/2: 50 件・61 秒・exit 0",
      "ワーカー 2/2: 48 件・59 秒・exit 1（失敗）",
    ]);
    assert.deepEqual(failed, [2]);
  });

  test("終了コードが取れない（シグナルで止まった）ワーカーも失敗に数える", () => {
    const { failed } = formatWorkerSummary([{ index: 1, count: 3, exitCode: null, ms: 1000 }]);
    assert.deepEqual(failed, [1]);
  });
});
