#!/usr/bin/env node
/**
 * Claude Code の PreToolUse フック（#490・docs/adr/0032）。`.claude/settings.json` から呼ばれる。
 *
 * 標準入力の JSON（`tool_name`・`tool_input.command`）を読み、本番デプロイに当たるコマンドなら
 * `permissionDecision: "ask"` を標準出力へ書く（人に聞く）。当たらなければ何も書かない。
 * 止めるコマンドの一覧と判定の正本は `scripts/lib/agent-guard.mjs`。ここは I/O の薄い配線だけ。
 *
 * 常に exit 0 で終わる（exit 2 は「拒む」になり、人が承認して進める道が無くなる）。
 */
import fs from "node:fs";
import { isDirectRun } from "./lib/direct-run.mjs";
import { decideHookOutput } from "./lib/agent-guard.mjs";

function main() {
  let raw = "";
  try {
    raw = fs.readFileSync(0, "utf8");
  } catch {
    // 標準入力が無い・閉じている。空として扱い、ask に倒す
  }
  const out = decideHookOutput(raw);
  if (out !== null) process.stdout.write(`${JSON.stringify(out)}\n`);
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
