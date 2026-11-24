#!/usr/bin/env node
/**
 * 前のタグから HEAD までのコミットを、配る順を決める材料として並べる（#675）。**読むだけ**で、git にも何も書かない。
 *
 *     pnpm changes:since <前のタグ>        # 例: pnpm changes:since v4.7.1
 *
 * コミットごとに、wire（`packages/<名前>-core/src`）・同期サーバー（`apps/tasuki-sync/src`）・`deploy/` に触れたかを印にし、
 * 終わりに種類ごとの PR の番号をまとめる。**順そのものは出さない**（人が、印の付いた PR 本文の「配布の注意」と
 * 各 `deploy/<app>/NOTES.md` を読んで決める。`deploy/README.md` の「配る時の確認の一覧」）。
 *
 * 前のタグを解けない・HEAD の祖先でないときは、空の一覧を出さずに exit 2 で止まる
 * （浅い複製でタグが無い・履歴が途切れているのを、「変更なし」と取り違えないため）。
 *
 * 設計方針: 判定は `scripts/lib/changes-since.mjs`。ここは git から値を集める配線だけ。
 */
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isDirectRun } from "./lib/direct-run.mjs";
import { LOG_ARGS, parseLog, classifyCommit, formatChanges } from "./lib/changes-since.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const TAG = "[changes-since]";

/** git を流す。`{ ok, stdout, stderr }` を返す（投げない）。 */
function git(args) {
  const r = spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.error === undefined && r.status === 0, stdout: r.stdout ?? "", stderr: (r.stderr ?? "").trim() || (r.error?.message ?? "") };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith("-")) {
    console.error(`${TAG} 前のタグを 1 つ渡してください: pnpm changes:since <前のタグ>（例: v4.7.1。リモートのタグは git ls-remote --tags origin）`);
    process.exitCode = 2;
    return;
  }
  const [rev] = args;

  const base = git(["rev-parse", "--verify", "--quiet", `${rev}^{commit}`]);
  if (!base.ok) {
    console.error(`${TAG} ${rev} を解けません。手元にタグが無いなら取ってください: git fetch origin tag ${rev}`);
    process.exitCode = 2;
    return;
  }
  const baseSha = base.stdout.trim();

  // 祖先でなければ、範囲 <rev>..HEAD は「前のタグより後」を意味しない（別の枝・履歴の途切れた浅い複製）
  if (!git(["merge-base", "--is-ancestor", baseSha, "HEAD"]).ok) {
    console.error(`${TAG} ${rev}（${baseSha.slice(0, 7)}）は HEAD の祖先ではありません。一覧を出しません`);
    console.error("  浅い複製なら履歴を取り足してください（git fetch --unshallow）。別の枝にいるなら main で流してください");
    process.exitCode = 2;
    return;
  }

  const log = git([...LOG_ARGS, `${baseSha}..HEAD`]);
  if (!log.ok) {
    console.error(`${TAG} git log が失敗しました: ${log.stderr}`);
    process.exitCode = 2;
    return;
  }
  let commits;
  try {
    commits = parseLog(log.stdout).map(classifyCommit);
  } catch (e) {
    // 読めない形を 0 件にしない（題に区切りの字がある・git の出力の形が変わった）
    console.error(`${TAG} ${e.message}。一覧を出しません`);
    process.exitCode = 2;
    return;
  }

  const head = git(["rev-parse", "HEAD"]).stdout.trim();
  const branch = git(["branch", "--show-current"]).stdout.trim() || "枝なし";
  console.log(`${TAG} ${rev}（${baseSha.slice(0, 7)}）..HEAD（${head.slice(0, 7)}・${branch}）: ${commits.length} 件`);
  console.log(formatChanges(commits));
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
