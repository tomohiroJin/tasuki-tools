import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  parseJobs,
  planWorkers,
  workerArgs,
  worktreeDirFor,
  staleWorktreesFrom,
  worktreeLockReason,
  formatWorkerSummary,
  parseTestWorkers,
  testWorkersPerJob,
  createLinePrefixer,
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
  test("割り当てた変異を --id で、テストランナーの並列の上限を --test-workers で渡す", () => {
    assert.deepEqual(workerArgs([M(3, "a"), M(10, "b")], false, 1), ["--id", "3,10", "--test-workers", "1"]);
  });

  test("--full は引き継ぐ", () => {
    assert.deepEqual(workerArgs([M(3, "a")], true, 2), ["--id", "3", "--test-workers", "2", "--full"]);
  });
});

describe("testWorkersPerJob / parseTestWorkers: テストランナーの並列の上限", () => {
  // 子のテストランナー（vitest・node --test）は、それぞれがコアの数だけ並列に起動する。
  // ワーカー 4 つが 4 コアの上でそうすると取り合いになり、変異を当てた実行が時間切れで落ちて
  // 「検出」と数えられうる（テストが実際には変異を捕まえていなくても）。コアをワーカーで分ける
  test("コアの数をワーカーの数で割り、1 を下回らない", () => {
    assert.equal(testWorkersPerJob(4, 4), 1);
    assert.equal(testWorkersPerJob(8, 3), 2);
    assert.equal(testWorkersPerJob(2, 4), 1);
  });

  test("指定が無ければ null（テストランナーの既定のまま。直列の今までの振る舞い）", () => {
    assert.equal(parseTestWorkers([]), null);
    assert.equal(parseTestWorkers(["--id", "1"]), null);
  });

  test("--test-workers n は正の整数", () => {
    assert.equal(parseTestWorkers(["--id", "1", "--test-workers", "2"]), 2);
    for (const bad of ["0", "-1", "a", ""]) {
      assert.throws(() => parseTestWorkers(["--test-workers", bad]), /--test-workers/, bad);
    }
  });
});

describe("createLinePrefixer: 子の出力をその場で、ワーカーの番号つきで流す", () => {
  // 子の出力をためて終わってから出すと、子が固まったときにログに何も出ないまま CI が上限まで待つ
  const collect = () => {
    const lines = [];
    return { lines, write: (line) => lines.push(line) };
  };

  test("行ごとに接頭辞を付けて書き、行の途中で切れた断片は次の断片とつなぐ", () => {
    const out = collect();
    const p = createLinePrefixer("[w2] ", out.write);
    p.push("--- 変異 #1 ---\n  対照: ");
    p.push("○ 通過\n");
    assert.deepEqual(out.lines, ["[w2] --- 変異 #1 ---", "[w2]   対照: ○ 通過"]);
  });

  test("最後に改行の無い断片は flush で書く", () => {
    const out = collect();
    const p = createLinePrefixer("[w1] ", out.write);
    p.push("a\nb");
    p.flush();
    assert.deepEqual(out.lines, ["[w1] a", "[w1] b"]);
  });

  test("書いたものを後で読めるよう、接頭辞を付けない形でも持つ（失敗したワーカーの末尾を出すため）", () => {
    const p = createLinePrefixer("[w1] ", () => {});
    p.push("x\ny\n");
    p.flush();
    assert.equal(p.text(), "x\ny\n");
  });
});

describe("worktreeDirFor / staleWorktreesFrom: 作業ツリーの置き場と残骸", () => {
  test("置き場は一時ディレクトリの下に、親の PID と番号で名づける", () => {
    assert.equal(worktreeDirFor("/tmp", 1234, 2), path.join("/tmp", "tasuki-mutation-1234-2"));
  });

  test("ロックの理由に、持ち主の PID とホスト名を書く", () => {
    assert.equal(worktreeLockReason(1234, "box-a"), "tasuki-mutation pid=1234 host=box-a");
  });

  // 作業ツリーはロックつきで作る。`git worktree prune` は、ロックされた作業ツリーの登録を消さない。
  // .git を共有したまま /tmp と PID の名前空間が別の環境（9p 越しのコンテナ 2 つなど）では、
  // 相手の作業ツリーは「無い」ように見え、ロックが無いと prune が相手の実行中の登録を消す
  const porcelain = [
    "worktree /repo",
    "HEAD abc",
    "branch refs/heads/main",
    "",
    "worktree /tmp/tasuki-mutation-111-1",
    "HEAD abc",
    "detached",
    "locked tasuki-mutation pid=111 host=box-a",
    "",
    "worktree /tmp/tasuki-mutation-222-1",
    "HEAD abc",
    "detached",
    "locked tasuki-mutation pid=222 host=box-a",
    "",
    "worktree /tmp/tasuki-mutation-333-1",
    "HEAD abc",
    "detached",
    "locked tasuki-mutation pid=333 host=box-b",
    "prunable gitdir file points to non-existent location",
    "",
    "worktree /home/user/other-wt",
    "HEAD def",
    "branch refs/heads/feature",
    "",
  ].join("\n");

  test("同じホストで、持ち主の親が死んでいる置き場だけを残骸とする（生きている実行の作業ツリーは消さない）", () => {
    const alive = (pid) => pid === 222;
    assert.deepEqual(staleWorktreesFrom(porcelain, alive, "box-a"), ["/tmp/tasuki-mutation-111-1"]);
  });

  test("別のホストの置き場は、PID が見えなくても残骸にしない（PID は名前空間をまたぐと当てにならない）", () => {
    assert.deepEqual(staleWorktreesFrom(porcelain, () => false, "box-a"), [
      "/tmp/tasuki-mutation-111-1",
      "/tmp/tasuki-mutation-222-1",
    ]);
    assert.deepEqual(staleWorktreesFrom(porcelain, () => false, "box-b"), ["/tmp/tasuki-mutation-333-1"]);
  });

  test("ロックの理由を持たない作業ツリー（人が作ったもの・本体・名前だけ似たもの）は残骸にしない", () => {
    const unlocked = ["worktree /tmp/tasuki-mutation-444-1", "HEAD abc", "detached", ""].join("\n");
    assert.deepEqual(staleWorktreesFrom(unlocked, () => false, "box-a"), []);
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
