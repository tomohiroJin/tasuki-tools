#!/usr/bin/env node
/**
 * ランダムな順でテストを流す（#524・#495 の B。部品は lib/shuffled-tests.mjs）。
 *
 * 使い方: node scripts/test-shuffled.mjs [--seed <整数>] [--pkg <ディレクトリ>]
 * （`--root <ディレクトリ>` は自己テストが別のワークスペースを流すためのもの）
 *
 * **種は毎回変えて、最初にログへ出す**（`--seed` で固定もできる）。固定すると 1 通りの順しか見ず、
 * 新しく入った順番依存を取りこぼす。毎回変えれば、入った PR か次の実行のどこかで当たる。
 * 代わりに「落ちたら同じ種で手元で再現できる」ことを守る: 落ちたパッケージごとに再現のコマンドを出す。
 * 順番依存は種で再現する（同じ種なら同じ順）。種に依らず落ちるものは、順番ではなく別の不安定さ。
 * パッケージは 1 つずつ順に流す（並べると、取り合いで揺れたのか順番で落ちたのかが分からない）。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { isDirectRun } from "./lib/direct-run.mjs";
import { newSeed, parseSeed, planShuffledRuns, reproCommand } from "./lib/shuffled-tests.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseArgs(argv) {
  const options = { seed: undefined, pkg: undefined, root: ROOT };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--seed" && argv[i + 1] !== undefined) options.seed = parseSeed(argv[++i]);
    else if (argv[i] === "--pkg" && argv[i + 1] !== undefined) options.pkg = argv[++i];
    else if (argv[i] === "--root" && argv[i + 1] !== undefined) options.root = path.resolve(argv[++i]);
    else throw new Error(`知らない指定です: ${argv[i]}（使えるのは --seed <整数> と --pkg <ディレクトリ>）`);
  }
  return options;
}

function main() {
  let options;
  try { options = parseArgs(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 2; return; }
  const seed = options.seed ?? newSeed();
  console.log(`[shuffle] 種 ${seed}（同じ種で再現: node scripts/test-shuffled.mjs --seed ${seed}${options.pkg ? ` --pkg ${options.pkg}` : ""}）`);
  let plan;
  try { plan = planShuffledRuns(options.root, seed); } catch (error) { console.error(`[shuffle] ${error.message}`); process.exitCode = 1; return; }
  if (options.pkg && !plan.some((r) => r.dir === options.pkg)) { console.error(`[shuffle] パッケージが見つかりません: ${options.pkg}`); process.exitCode = 2; return; }
  const failed = [];
  const started = Date.now();
  for (const run of plan.filter((r) => !options.pkg || r.dir === options.pkg)) {
    if (run.skip) { console.log(`\n[shuffle] 対象外 ${run.dir}（${run.name}）— ${run.skip}`); continue; }
    console.log(`\n[shuffle] ${run.dir}（${run.name}）: ${run.args.join(" ")}`);
    const t = Date.now();
    const result = spawnSync("pnpm", ["exec", ...run.args], { cwd: path.join(options.root, run.dir), stdio: "inherit" });
    const passed = !result.error && result.status === 0;
    console.log(`[shuffle] ${passed ? "成功" : "失敗"} ${run.dir}（${Math.round((Date.now() - t) / 1000)} 秒）`);
    if (!passed) failed.push(run);
  }
  console.log(`\n[shuffle] 種 ${seed}・所要 ${Math.round((Date.now() - started) / 1000)} 秒・失敗 ${failed.length} 件`);
  for (const run of failed) console.log(`[shuffle] 再現（種 ${seed}）: ${reproCommand(run)}`);
  if (failed.length > 0) console.log("[shuffle] 上のコマンドは同じ種で同じ順になる。再現したら順番依存。再現しないなら順番ではなく別の不安定さ。見つけた順番依存はこの PR で直さず ISSUE を切る");
  process.exitCode = failed.length > 0 ? 1 : 0;
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
