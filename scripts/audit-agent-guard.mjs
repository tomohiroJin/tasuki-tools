#!/usr/bin/env node
/**
 * AI ツールの設定が、本番デプロイのコマンドを止める仕組みへ配線されているかを見る検査（#490・docs/adr/0032）。
 *
 * ## 何を見るか
 *
 * 1. **`.claude/settings.json` が追跡下にあり、Bash の PreToolUse フックに入口（{@link HOOK_COMMAND}）を置いている。**
 *    `disableAllHooks` で全部のフックを切っていない
 * 2. **入口のスクリプトと判定の部品が追跡下にある**
 * 3. **止めるスクリプトの宣言（`scripts/lib/agent-guard.mjs` の `GUARDED_COMMANDS`）と `deploy/` の実体が合う。**
 *    宣言したスクリプトが追跡下にあり、`deploy/` の下の実行するスクリプト（`*.sh`。読み込まれる部品の `deploy/lib/` を除く）は
 *    どれも宣言にある。デプロイの入口を足したのに止める一覧へ足し忘れる、を捕まえる
 *
 * ## 何を見ていないか
 *
 * - **判定がコマンドを正しく読むかは見ない。** それは `scripts/lib/agent-guard.test.mjs` の役目
 * - **Claude Code が実際にフックを走らせるかは見ない。** 実際に呼ばせた確認は #490 の PR に記録した（原則 VII）
 * - **手元の設定（`~/.claude/settings.json`・`.claude/settings.local.json`）は見ない。** 利用者がそこで
 *   `disableAllHooks` にすれば止まらない。それは人の判断で、検査の外に置く
 * - **他のツール（Gemini CLI・Copilot ほか）の設定は見ない。** 文章だけで守る理由は docs/adr/0032 決定 4
 *
 * 設計方針: 判定は純粋関数、実 I/O と `process.exit` は `main()` の薄い配線だけに置く。追加依存は禁止。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listTrackedFiles, findEmptyScanDimensions } from "./lib/scan-targets.mjs";
import { isDirectRun } from "./lib/direct-run.mjs";
import { GUARDED_COMMANDS } from "./lib/agent-guard.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SETTINGS_PATH = ".claude/settings.json";
export const HOOK_SCRIPT = "scripts/agent-guard-hook.mjs";
export const GUARD_LIB = "scripts/lib/agent-guard.mjs";
/** settings.json に書くフックのコマンド。`${CLAUDE_PROJECT_DIR}` で、どの作業場所から呼ばれても同じ入口を指す。 */
export const HOOK_COMMAND = `node "\${CLAUDE_PROJECT_DIR}/${HOOK_SCRIPT}"`;

/** Claude Code の matcher（空・`*`・正規表現）が Bash に当たるか。 */
function matcherHitsBash(matcher) {
  if (matcher === undefined || matcher === "" || matcher === "*") return true;
  if (typeof matcher !== "string") return false;
  try {
    return new RegExp(`^(?:${matcher})$`).test("Bash");
  } catch {
    return false;
  }
}

/**
 * `.claude/settings.json` の中身を見る。
 * @param {string} text
 * @returns {string[]} 問題（空なら通る）
 */
export function checkClaudeSettings(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return [`JSON として読めません（${e.message}）`];
  }
  if (json?.disableAllHooks === true) {
    return ["disableAllHooks が true です。本番デプロイを止めるフックも切れます（docs/adr/0032）"];
  }
  const groups = Array.isArray(json?.hooks?.PreToolUse) ? json.hooks.PreToolUse : [];
  const wired = groups.some(
    (g) =>
      matcherHitsBash(g?.matcher) &&
      Array.isArray(g?.hooks) &&
      g.hooks.some((h) => h?.type === "command" && h?.command === HOOK_COMMAND),
  );
  if (!wired) {
    return [`hooks.PreToolUse に、Bash に当たる matcher で ${JSON.stringify(HOOK_COMMAND)} を置いてください（docs/adr/0032 決定 2）`];
  }
  return [];
}

/** `deploy/` の下で、宣言に載るべき実行するスクリプトか。 */
function isDeployEntryScript(rel) {
  return rel.startsWith("deploy/") && rel.endsWith(".sh") && !rel.startsWith("deploy/lib/");
}

/**
 * 止めるスクリプトの宣言と、追跡下のファイルを突き合わせる。
 * @param {{ id: string, script?: string }[]} declarations
 * @param {string[]} trackedDeployFiles `deploy/` の下の追跡下のファイル
 * @returns {string[]} 問題（空なら通る）
 */
export function checkDeclarations(declarations, trackedDeployFiles) {
  const problems = [];
  const tracked = new Set(trackedDeployFiles);
  const declared = new Set(declarations.filter((d) => d.script).map((d) => d.script));
  for (const script of declared) {
    if (!tracked.has(script)) problems.push(`宣言したスクリプト ${script} が追跡下にありません（移したなら宣言を直す）`);
  }
  for (const rel of trackedDeployFiles.filter(isDeployEntryScript)) {
    if (!declared.has(rel)) {
      problems.push(`${rel} が止める一覧（${GUARD_LIB} の GUARDED_COMMANDS）にありません。本番に触れるなら足し、触れないなら deploy/ の外へ置く`);
    }
  }
  return problems;
}

function main() {
  const problems = [];
  const tracked = new Set(listTrackedFiles(REPO_ROOT, [SETTINGS_PATH, HOOK_SCRIPT, GUARD_LIB]));
  for (const rel of [SETTINGS_PATH, HOOK_SCRIPT, GUARD_LIB]) {
    if (!tracked.has(rel)) problems.push(`${rel} が追跡下にありません${rel === SETTINGS_PATH ? "（.claude/ は無視の対象なので git add -f で足す）" : ""}`);
  }
  if (tracked.has(SETTINGS_PATH)) {
    problems.push(...checkClaudeSettings(fs.readFileSync(path.join(REPO_ROOT, SETTINGS_PATH), "utf8")).map((p) => `${SETTINGS_PATH}: ${p}`));
  }
  const deployFiles = listTrackedFiles(REPO_ROOT, ["deploy/*"]);
  problems.push(...checkDeclarations(GUARDED_COMMANDS, deployFiles));

  const scripts = deployFiles.filter(isDeployEntryScript);
  console.log(`[audit-agent-guard] 走査対象: 宣言 ${GUARDED_COMMANDS.length} 件 / deploy/ の実行するスクリプト ${scripts.length} 本`);
  const empty = findEmptyScanDimensions([
    { label: "宣言", count: GUARDED_COMMANDS.length },
    { label: "deploy/ の実行するスクリプト", count: scripts.length },
  ]);
  if (empty.length > 0) {
    console.error(`[audit-agent-guard] 走査対象が 0 件です（${empty.join(" / ")}）。検査が空振りしています`);
    process.exit(1);
  }
  if (problems.length > 0) {
    console.error("[audit-agent-guard] 本番デプロイを止める仕組みの配線がずれています:");
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log("[audit-agent-guard] OK");
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
