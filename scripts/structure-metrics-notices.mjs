#!/usr/bin/env node
/**
 * 構造監査の合否の無い指標の後退の知らせを、JSON の配列（行の文字列）として標準出力へ書く（#578・docs/adr/0037）。
 * `scripts/local-check.mjs` が**別プロセスとして背景で**起こす。local-check 本体は検査を同期的に（spawnSync で）待つので、
 * 同じプロセスの非同期処理は検査の間は進まない。別プロセスにして、検査と並行に走らせる（コードレビュー 8）。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDirectRun } from "./lib/direct-run.mjs";
import { structureNotices, defaultBaselineOutput, defaultCurrentOutput } from "./lib/structure-metrics.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const lines = await structureNotices({ baseline: () => defaultBaselineOutput(ROOT), current: () => defaultCurrentOutput(ROOT) });
  process.stdout.write(`${JSON.stringify(lines)}\n`);
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    process.stdout.write(`${JSON.stringify([`⚠ 構造監査の指標の比較は未実行です（${String(error.message).trim().split("\n")[0]}）`])}\n`);
  });
}
