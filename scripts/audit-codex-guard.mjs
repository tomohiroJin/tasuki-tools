#!/usr/bin/env node
/**
 * Codex の設定が、本番デプロイのコマンドを止める入口へ配線されているかを見る検査（#578・docs/adr/0032 の追記）。
 *
 * ## 何を見るか
 *
 * 1. **`.codex/hooks.json` が追跡下にあり、期待する形（Bash の PreToolUse に Codex の入口 1 つだけ）と構造ごと完全一致する。**
 *    併記・`timeout`・`async`・別のフック・`SessionStart` などの書き足しは落とす
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
import { CODEX_HOOK_COMMAND, CODEX_HOOK_SCRIPT, EXPECTED_CODEX_HOOKS } from "./lib/codex-guard.mjs";

export { CODEX_HOOK_COMMAND, CODEX_HOOK_SCRIPT };

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const CODEX_HOOKS_PATH = ".codex/hooks.json";
/**
 * Codex の入口が読み込む部品。欠けると入口が起動せず、判定も働かない（`||` の deny に倒れるので fail open ではない）。
 * 手書きの一覧。PR #583 のマージ後に、`audit-agent-guard.mjs` の `collectEntryDependencies`（入口の import をたどる）へ寄せる（#578 のレビュー Minor 2）。
 */
export const CODEX_HOOK_LIBS = ["scripts/lib/agent-guard.mjs", "scripts/lib/direct-run.mjs", "scripts/lib/codex-guard.mjs"];
/** `.codex/hooks.json` の正準の文字列（2 字下げ・末尾に改行）。期待する形から作る。 */
export const CANONICAL_CODEX_HOOKS_TEXT = `${JSON.stringify(EXPECTED_CODEX_HOOKS, null, 2)}\n`;

/**
 * `.codex/hooks.json` の中身を見る。**期待する形から作った正準の文字列と、文字列ごと完全一致**のものだけを通す
 * （期待の形は `scripts/lib/codex-guard.mjs` の `EXPECTED_CODEX_HOOKS`）。構造の比較では、キーが重複したファイルが通る
 * （`JSON.parse` は後ろのキーを採り、Codex がどう読むかは未実測）。Claude Code の入口の併記・`timeout`・`async`・`allow` を返す別のフック・
 * `SessionStart` で規則を流すフック（`additionalContext`）など、歯止めを外す・規則を流し込む書き足しも全部落とす。
 * ほかのフックを足したくなったら、期待の形を広げて ADR に書く。
 * @param {string} text
 * @returns {string[]} 問題（空なら通る）
 */
export function checkCodexHooks(text) {
  if (text === CANONICAL_CODEX_HOOKS_TEXT) return [];
  try {
    JSON.parse(text);
  } catch (e) {
    return [`JSON として読めません（${e.message}）`];
  }
  return [
    `期待する形（scripts/lib/codex-guard.mjs の EXPECTED_CODEX_HOOKS を 2 字下げ・末尾改行で書いた文字列）と一致しません。hooks.PreToolUse に matcher "Bash" で ${JSON.stringify(CODEX_HOOK_COMMAND)} を 1 つだけ置き、ほかのキー・フック・重複したキーを足さないでください（Claude Code の入口は ask を返すので Codex では止まらない。timeout・async・allow・SessionStart は歯止めを外すか規則を流し込む。docs/adr/0032 の追記）`,
  ];
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
