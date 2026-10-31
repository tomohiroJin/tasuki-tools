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

/** ワーカーに渡す引数。ワーカーは普段の 1 回の実行そのものなので、割り当てを `--id` で渡す。 */
export function workerArgs(mutations, full) {
  return ["--id", mutations.map((m) => m.id).join(","), ...(full ? ["--full"] : [])];
}

/** i 番目（1 から数える）のワーカーの作業ツリーの置き場。親の PID を名前に入れ、残骸の持ち主を見分ける。 */
export function worktreeDirFor(tmpRoot, pid, index) {
  return path.join(tmpRoot, `${WORKTREE_PREFIX}${pid}-${index}`);
}

/**
 * `git worktree list --porcelain` の出力から、**持ち主の親がもう居ない**変異検査の作業ツリーを拾う。
 *
 * 親は終わるときに自分の作業ツリーを消すが、SIGKILL などで殺されると残る。残っても本体の作業ツリーには
 * 触らない（変異が当たったままなのはその写しの中だけ）ので害は無いが、`git worktree list` に溜まり続ける。
 * **生きている親の作業ツリーは消さない**（別の端末で並走している実行を壊さない）。
 */
export function staleWorktreesFrom(porcelain, isAlive) {
  const pattern = new RegExp(`^${WORKTREE_PREFIX}(\\d+)-\\d+$`);
  const stale = [];
  for (const line of porcelain.split("\n")) {
    if (!line.startsWith("worktree ")) continue;
    const dir = line.slice("worktree ".length);
    const m = pattern.exec(path.basename(dir));
    if (m && !isAlive(Number(m[1]))) stale.push(dir);
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
