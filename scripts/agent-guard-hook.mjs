#!/usr/bin/env node
/**
 * Claude Code の PreToolUse フック（#490・docs/adr/0032）。`.claude/settings.json` から呼ばれる。
 *
 * 標準入力の JSON（`tool_name`・`tool_input.command`）を読み、本番デプロイに当たるコマンドなら
 * `permissionDecision: "ask"` を標準出力へ書く（人に聞く）。当たらなければ何も書かない。
 * 止めるコマンドの一覧と判定の正本は `scripts/lib/agent-guard.mjs`。ここは I/O の薄い配線だけ。
 *
 * 続けて、`gh pr create` の直前に同じ ISSUE の先行 PR・枝があれば同じく `ask` を書く（#504・
 * `scripts/lib/prior-pr-hook.mjs`）。本番デプロイの判定が先で、その振る舞いは変えない。
 *
 * 常に exit 0 で終わる（exit 2 は「拒む」になり、人が承認して進める道が無くなる）。
 */
import fs from "node:fs";
import { isDirectRun } from "./lib/direct-run.mjs";
import { decideHookOutput } from "./lib/agent-guard.mjs";
import { decidePriorPrOutput, defaultCurrentBranch, defaultLookup } from "./lib/prior-pr-hook.mjs";

/** gh と git を走らせる作業場所。入力の `cwd`（作業ツリー）、なければ CLAUDE_PROJECT_DIR、なければ今の場所。 */
function workingDirectory(raw) {
  try {
    const cwd = JSON.parse(raw)?.cwd;
    if (typeof cwd === "string" && cwd !== "") return cwd;
  } catch {
    // 読めない入力は本番デプロイの判定が扱う
  }
  return process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
}

function main() {
  let raw = "";
  try {
    raw = fs.readFileSync(0, "utf8");
  } catch {
    // 標準入力が無い・閉じている。空として扱い、ask に倒す
  }
  const cwd = workingDirectory(raw);
  const out = decideHookOutput(raw) ?? decidePriorPrOutput(raw, { currentBranch: defaultCurrentBranch(cwd), lookup: defaultLookup(cwd) });
  if (out !== null) process.stdout.write(`${JSON.stringify(out)}\n`);
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
