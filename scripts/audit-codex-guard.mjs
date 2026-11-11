#!/usr/bin/env node
/**
 * Codex の設定が、本番デプロイのコマンドを止める入口へ配線されているかを見る検査（#578・docs/adr/0032 の追記）。
 *
 * ## 何を見るか
 *
 * 1. **`.codex/hooks.json` が追跡下にあり、Bash の PreToolUse フックに Codex の入口（{@link CODEX_HOOK_COMMAND}）を置いている。**
 *    Claude Code の入口（`agent-guard-hook.mjs`）を置いていたら落とす（`ask` を返すので、Codex ではコマンドが走る）
 * 2. **Codex の入口と、それが読み込む判定の部品が追跡下にある**
 *
 * ## 何を見ていないか
 *
 * - **Codex が実際にフックを走らせるかは見ない。** プロジェクトの信頼と `/hooks` でのフックの信頼は利用者の手元の状態で、
 *   リポジトリからは見えない（`docs/guides/development.md`「Codex で作業するとき」）。実測は #578 の PR に記録した（原則 VII）
 * - **手元の設定（`~/.codex/config.toml` の `[features] hooks = false` ほか）は見ない**
 * - **判定がコマンドを正しく読むかは見ない。** それは `scripts/lib/agent-guard.test.mjs` の役目
 *
 * 設計方針: 判定は純粋関数、実 I/O と `process.exitCode` は `main()` の薄い配線だけに置く。追加依存は禁止。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listTrackedFiles } from "./lib/scan-targets.mjs";
import { isDirectRun } from "./lib/direct-run.mjs";
import { LAUNCH_FAILURE_OUTPUT } from "./codex-guard-hook.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const CODEX_HOOKS_PATH = ".codex/hooks.json";
export const CODEX_HOOK_SCRIPT = "scripts/codex-guard-hook.mjs";
/** Codex の入口が読み込む部品。欠けると入口が起動せず、判定も働かない。 */
export const CODEX_HOOK_LIBS = ["scripts/lib/agent-guard.mjs", "scripts/lib/direct-run.mjs"];
/**
 * hooks.json に書くフックのコマンド。作業場所がどこでも、Git のルートの入口を指す。
 * 入口の起動に失敗したら（node が無い・入口が無い・Git のルートが引けない）、Codex はフックの失敗としてコマンドを走らせてしまうので、
 * `||` の後ろで deny を返す。入口が「当たらない」と何も出さず exit 0 で終わるときは、`||` の後ろは走らない。
 * Codex は hooks.json の場所やルートを環境変数で渡さない（codex-cli 0.154.0 のバイナリを調べた）ので、`git rev-parse` で引く。
 */
export const CODEX_HOOK_COMMAND = `node "$(git rev-parse --show-toplevel)/${CODEX_HOOK_SCRIPT}" || printf '%s' '${LAUNCH_FAILURE_OUTPUT}'`;

/** Codex の matcher（空・`*`・正規表現）が、その道具の名前に当たるか。 */
function matcherHits(matcher, tool) {
  if (matcher === undefined || matcher === "" || matcher === "*") return true;
  if (typeof matcher !== "string") return false;
  try {
    return new RegExp(`^(?:${matcher})$`).test(tool);
  } catch {
    return false;
  }
}

/**
 * `.codex/hooks.json` の中身を見る。
 * @param {string} text
 * @returns {string[]} 問題（空なら通る）
 */
export function checkCodexHooks(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return [`JSON として読めません（${e.message}）`];
  }
  const groups = Array.isArray(json?.hooks?.PreToolUse) ? json.hooks.PreToolUse : [];
  const wired = groups.some(
    (g) =>
      matcherHits(g?.matcher, "Bash") &&
      Array.isArray(g?.hooks) &&
      g.hooks.some((h) => h?.type === "command" && h?.command === CODEX_HOOK_COMMAND),
  );
  if (!wired) {
    return [
      `hooks.PreToolUse に、Bash に当たる matcher で ${JSON.stringify(CODEX_HOOK_COMMAND)} を置いてください（Claude Code の入口は ask を返すので、Codex では止まりません。docs/adr/0032 の追記）`,
    ];
  }
  return [];
}

function main() {
  const problems = [];
  const required = [CODEX_HOOKS_PATH, CODEX_HOOK_SCRIPT, ...CODEX_HOOK_LIBS];
  const tracked = new Set(listTrackedFiles(REPO_ROOT, required));
  for (const rel of required) {
    if (!tracked.has(rel)) problems.push(`${rel} が追跡下にありません`);
  }
  if (tracked.has(CODEX_HOOKS_PATH)) {
    problems.push(...checkCodexHooks(fs.readFileSync(path.join(REPO_ROOT, CODEX_HOOKS_PATH), "utf8")).map((p) => `${CODEX_HOOKS_PATH}: ${p}`));
  }
  console.log(`[audit-codex-guard] 走査対象: 必須ファイル ${required.length} 件`);
  if (problems.length > 0) {
    console.error("[audit-codex-guard] Codex の本番デプロイを止める入口の配線がずれています:");
    for (const p of problems) console.error(`  ${p}`);
    process.exitCode = 1;
    return;
  }
  console.log("[audit-codex-guard] OK");
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
