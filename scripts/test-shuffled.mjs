#!/usr/bin/env node
/**
 * ランダムな順でテストを流す（#524・#495 の B。部品は lib/shuffled-tests.mjs）。
 *
 * 使い方: node scripts/test-shuffled.mjs (--all | --pkg <ディレクトリ>) [--seed <整数>]
 * **指定が無ければ何も流さず使い方を出して終わる**（entry-point-wiring.test.mjs が引数なしで起動するため。重い検査を無指定で走らせない）。
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

export const USAGE = "使い方: node scripts/test-shuffled.mjs (--all | --pkg <ディレクトリ>) [--seed <整数>]";

export function parseArgs(argv) {
  const options = { seed: undefined, pkg: undefined, root: ROOT, all: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--all") options.all = true;
    else if (argv[i] === "--seed" && argv[i + 1] !== undefined) options.seed = parseSeed(argv[++i]);
    else if (argv[i] === "--pkg" && argv[i + 1] !== undefined) options.pkg = argv[++i];
    else if (argv[i] === "--root" && argv[i + 1] !== undefined) { options.root = path.resolve(argv[++i]); }
    else throw new Error(`知らない指定です: ${argv[i]}\n${USAGE}`);
  }
  return options;
}

/** 最初の行に出す、同じ種で流し直すコマンド。実際に流した指定（--all / --pkg）を付ける。 */
export function rerunCommand(options, seed) {
  return `node scripts/test-shuffled.mjs ${options.pkg ? `--pkg ${options.pkg}` : "--all"} --seed ${seed}`;
}

/** 版の確かめ（docs/adr/0031 決定 2）。常に、このリポジトリの宣言と比べる。飛ばす指定は置かない。 */
function checkToolchain() {
  return spawnSync(process.execPath, [path.join(ROOT, "scripts/check-toolchain.mjs"), "test"], { stdio: "inherit" }).status === 0;
}

/** 終了コードを返す。`deps` は自己テストが版の確かめとパッケージの実行を差し替えるためのもの。 */
export function execute(argv, deps = {}) {
  const check = deps.checkToolchain ?? checkToolchain;
  const spawn = deps.spawn ?? spawnSync;
  let options;
  try { options = parseArgs(argv); } catch (error) { console.error(error.message); return 2; }
  if (!options.all && !options.pkg) { console.error(USAGE); return 2; }
  // 版が合わないなら始めない。--root は流す対象のワークスペースを変えるだけで、比べる宣言は変えない
  if (!check()) { console.error("[shuffle] 開発環境の版が合わないため始めません"); return 1; }
  const seed = options.seed ?? newSeed();
  console.log(`[shuffle] 種 ${seed}（同じ種で再現: ${rerunCommand(options, seed)}）`);
  let plan;
  try { plan = planShuffledRuns(options.root, seed); } catch (error) { console.error(`[shuffle] ${error.message}`); return 1; }
  if (options.pkg && !plan.some((r) => r.dir === options.pkg)) { console.error(`[shuffle] パッケージが見つかりません: ${options.pkg}`); return 2; }
  const selected = plan.filter((r) => !options.pkg || r.dir === options.pkg);
  const skipped = selected.filter((r) => r.skip).length;
  const failed = [];
  let ran = 0;
  const started = Date.now();
  for (const run of selected) {
    if (run.skip) { console.log(`\n[shuffle] 対象外 ${run.dir}（${run.name}）— ${run.skip}`); continue; }
    console.log(`\n[shuffle] ${run.dir}（${run.name}）: ${run.args.join(" ")}`);
    const t = Date.now();
    ran++;
    const result = spawn("pnpm", ["exec", ...run.args], { cwd: path.join(options.root, run.dir), stdio: "inherit" });
    const passed = !result.error && result.status === 0;
    console.log(`[shuffle] ${passed ? "成功" : "失敗"} ${run.dir}（${Math.round((Date.now() - t) / 1000)} 秒）`);
    if (!passed) failed.push(run);
  }
  console.log(`\n[shuffle] 種 ${seed}・所要 ${Math.round((Date.now() - started) / 1000)} 秒・流した ${ran} 件・対象外 ${skipped} 件・失敗 ${failed.length} 件`);
  // 1 件も流していない緑は検査が空振りしている（docs/adr/0014 決定 6・8）
  if (ran === 0) console.log("[shuffle] 流したパッケージが 0 件です。検査になっていません");
  for (const run of failed) console.log(`[shuffle] 再現（種 ${seed}）: ${reproCommand(run)}`);
  if (failed.length > 0) console.log("[shuffle] 上のコマンドは同じ種で同じ順になる。再現したら順番依存。再現しないなら順番ではなく別の不安定さ。見つけた順番依存はこの PR で直さず ISSUE を切る");
  return failed.length > 0 || ran === 0 ? 1 : 0;
}

function main() {
  process.exitCode = execute(process.argv.slice(2));
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
