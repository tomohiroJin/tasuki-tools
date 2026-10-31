import path from "node:path";
import { groupByControl, partitionMutations } from "./mutation-partition.mjs";

/**
 * 1 つのジョブの中で、変異を並列に流す（`--jobs m`。#481・設計正本
 * `docs/superpowers/specs/2026-10-31-ci-wait-design.md` §4.4）。
 *
 * 変異検査は 1 つの作業ツリーの上で「当てる → 流す → 戻す」を繰り返すので、同じ作業ツリーでは直列にしか流せない
 * （同時に流すと互いの復元が潰し合う。`scripts/mutation-check.mjs` のヘッダ）。並列にするには**作業ツリーを分ける**。
 *
 * **形**: 親は HEAD の写しの作業ツリー（`git worktree add --detach`）を m 個作り、それぞれで
 * 普段の 1 回の実行（`node scripts/mutation-check.mjs --id …`）を子として起こす。
 * **ロック・復元・マーカー・未コミット変更の検査は、子がそれぞれ自分の作業ツリーで今までどおり行う。**
 * 安全機構を並列のために作り直さない（並べるのは、それぞれが閉じた直列の実行である）。
 *
 * ここに置くのは判定の部分だけ（純粋関数）。作業ツリーを作る・子を起こす・後片づけは `mutation-check.mjs` の側。
 */

/** 作業ツリーの名前の接頭辞。残骸を見分けるのに使う（人が作った作業ツリーと取り違えない）。 */
export const WORKTREE_PREFIX = "tasuki-mutation-";

/**
 * 引数から `--jobs` を読む。指定が無ければ 1（今までどおり、この作業ツリーで直列に流す）。
 * 値の要る・要らないの判定と、知らない指定のエラーは `parseSelector` が持つ。ここは値だけを見る。
 */
export function parseJobs(args) {
  let jobs = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== "--jobs") continue;
    if (jobs !== null) throw new Error("--jobs は 1 回だけ書きます");
    const value = args[i + 1] ?? "";
    if (!/^[1-9]\d*$/.test(value)) throw new Error(`--jobs は正の整数で書きます: ${value}`);
    jobs = Number(value);
    i++;
  }
  return jobs ?? 1;
}

/**
 * 選んだ変異をワーカーへ割り当てる。CI のシャードと同じ分け方（`partitionMutations`）を使う。
 * **ワーカーの数は対照の組の数を超えない**（`--changed` で数件だけ選んだときに、空のワーカーを起こさない）。
 *
 * @returns {object[][]} ワーカーごとの変異（宣言の順）。選んだ変異が 0 件なら空の配列
 */
export function planWorkers(mutations, jobs, weightOf) {
  if (mutations.length === 0) return [];
  const workers = Math.min(jobs, groupByControl(mutations).length);
  return partitionMutations(mutations, workers, weightOf);
}

/**
 * ワーカーに渡す引数。ワーカーは普段の 1 回の実行そのものなので、割り当てを `--id` で渡す。
 * テストランナーの並列の上限（{@link testWorkersPerJob}）を `--test-workers` で渡す。
 */
export function workerArgs(mutations, full, testWorkers) {
  return [
    "--id",
    mutations.map((m) => m.id).join(","),
    "--test-workers",
    String(testWorkers),
    ...(full ? ["--full"] : []),
  ];
}

/**
 * 子 1 つあたりのテストランナーの並列の上限。コアの数をワーカーの数で割り、1 を下回らない。
 *
 * **なぜ抑えるか**（#481 のレビュー）: 子のテストランナー（vitest・`node --test`）は、それぞれがコアの数だけ並列に起動する。
 * ワーカー m 個がそうすると、コアの m 倍の本数が取り合う。変異を当てた実行が**時間切れで落ちても「検出」に数わる**ので、
 * テストが実際には変異を捕まえていなくても、混んでいるだけで緑になりうる（対照実行は別の時刻なので防げない）。
 */
export function testWorkersPerJob(cores, jobs) {
  return Math.max(1, Math.floor(cores / jobs));
}

/**
 * 引数から `--test-workers` を読む。指定が無ければ null（テストランナーの既定のまま。直列の今までの振る舞い）。
 * 親が `--jobs` の子へ渡す。手で書いてもよい。
 */
export function parseTestWorkers(args) {
  const i = args.indexOf("--test-workers");
  if (i === -1) return null;
  const value = args[i + 1] ?? "";
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`--test-workers は正の整数で書きます: ${value}`);
  return Number(value);
}

/**
 * 子の出力を行ごとに、接頭辞（`[w2] ` など）を付けてその場で書く。
 *
 * **ためてから出さない**（#481 のレビュー）: 子の出力をためて、終わってからまとめて出すと、子が 1 つでも固まったとき
 * ログに何も出ないまま CI が上限まで待つ。直列のときは変異ごとに `--- 変異 #… ---` がその場で出ていた。
 * 行の途中で切れた断片は次の断片とつなぐ（混ざった行を出さない）。書いたものは接頭辞なしでも持ち、
 * 失敗したワーカーの末尾を最後にもう一度出すのに使う。
 */
export function createLinePrefixer(prefix, write) {
  let pending = "";
  let all = "";
  return {
    push(chunk) {
      const text = String(chunk);
      all += text;
      pending += text;
      const lines = pending.split("\n");
      pending = lines.pop();
      for (const line of lines) write(prefix + line);
    },
    flush() {
      if (pending !== "") write(prefix + pending);
      pending = "";
    },
    text() {
      return all;
    },
  };
}

/** i 番目（1 から数える）のワーカーの作業ツリーの置き場。親の PID を名前に入れ、残骸の持ち主を見分ける。 */
export function worktreeDirFor(tmpRoot, pid, index) {
  return path.join(tmpRoot, `${WORKTREE_PREFIX}${pid}-${index}`);
}

/**
 * 作業ツリーのロックの理由（`git worktree add --lock --reason …`）。持ち主の PID とホスト名を書く。
 *
 * **ロックつきで作る理由**（#481 のレビュー）: `git worktree prune` は、ロックされた作業ツリーの登録を消さない。
 * `.git` を共有したまま `/tmp` と PID の名前空間が別の環境（9p 越しのコンテナ 2 つなど）では、相手の作業ツリーは
 * 「無い」ように見え、ロックが無いと prune が相手の実行中の登録を消す。片づけは `remove --force --force` なので、
 * ロックされていても自分の作業ツリーは消せる。
 */
export function worktreeLockReason(pid, host) {
  return `${WORKTREE_PREFIX.replace(/-$/, "")} pid=${pid} host=${host}`;
}

/**
 * `git worktree list --porcelain` の出力から、**同じホストで、持ち主の親がもう居ない**変異検査の作業ツリーを拾う。
 *
 * 親は終わるときに自分の作業ツリーを消すが、SIGKILL などで殺されると残る。残っても本体の作業ツリーには
 * 触らない（変異が当たったままなのはその写しの中だけ）ので害は無いが、`git worktree list` に溜まり続ける。
 *
 * - **生きている親の作業ツリーは消さない**（別の端末で並走している実行を壊さない）
 * - **別のホストの作業ツリーは消さない。** PID は名前空間をまたぐと当てにならない（相手の PID はこちらから見えない）
 * - **ロックの理由を持たないものは消さない**（人が作ったもの・名前だけ似たもの）
 */
export function staleWorktreesFrom(porcelain, isAlive, host) {
  const reasonPattern = new RegExp(`^locked ${WORKTREE_PREFIX.replace(/-$/, "")} pid=(\\d+) host=(\\S+)$`);
  const stale = [];
  for (const block of porcelain.split("\n\n")) {
    const lines = block.split("\n");
    const head = lines.find((l) => l.startsWith("worktree "));
    if (head === undefined) continue;
    const dir = head.slice("worktree ".length);
    if (!path.basename(dir).startsWith(WORKTREE_PREFIX)) continue;
    const lock = lines.map((l) => reasonPattern.exec(l)).find((m) => m !== null);
    if (lock && lock[2] === host && !isAlive(Number(lock[1]))) stale.push(dir);
  }
  return stale;
}

/**
 * ワーカーごとの結果を 1 行ずつにし、落ちたワーカーの番号を返す。
 * **終了コードが取れない（シグナルで止まった）ワーカーも失敗に数える**（0 でなければ緑にしない）。
 *
 * @param {{ index: number, count: number, exitCode: number | null, ms: number }[]} results
 */
export function formatWorkerSummary(results) {
  const total = results.length;
  const failed = results.filter((r) => r.exitCode !== 0).map((r) => r.index);
  const lines = results.map(
    (r) =>
      `ワーカー ${r.index}/${total}: ${r.count} 件・${(r.ms / 1000).toFixed(0)} 秒・exit ${r.exitCode}` +
      (r.exitCode === 0 ? "" : "（失敗）"),
  );
  return { lines, failed };
}
