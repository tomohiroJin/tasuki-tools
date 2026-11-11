/**
 * Codex の入口（`scripts/codex-guard-hook.mjs`）と、その配線の検査（`scripts/audit-codex-guard.mjs`）が共有する部品（#578・docs/adr/0032 の追記）。
 * 純粋な値と関数だけを置く。
 */

import { findGuardedCommands, SHELL_TOOLS } from "./agent-guard.mjs";

/** deny を返す理由の末尾に足す、Codex では人に聞く道が無いことの説明。 */
export const CODEX_NOTE =
  "Codex には人に聞く道が無いため、拒みます。人の明示の指示があるときは、人が自分の端末で実行するか、人がフックを外した上でやり直してください（docs/adr/0032）。";

/** Codex が止まる形の PreToolUse の出力（`ask` は Codex では失敗扱いでコマンドが走る）。 */
export const deny = (reason) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } });

/**
 * 入口が起動できなかったとき（node が無い・入口のファイルが無い・Git のルートが引けない）に、`.codex/hooks.json` のコマンドが
 * `||` の後ろで標準出力へ書く JSON。起動の失敗は、Codex では「フックの失敗」として**コマンドが走る**ので、ここでも deny に倒す。
 * 引用符（'）を含めないこと（シェルの単引用符で包んで書くため）。
 */
export const LAUNCH_FAILURE_OUTPUT = JSON.stringify(deny("本番デプロイの歯止め（scripts/codex-guard-hook.mjs）を起動できなかったため、念のため拒みます。docs/adr/0032"));

/** hooks.json の中身（.codex/hooks.json）として許す形。**これと構造ごと完全一致のものだけ**を通す（許可リスト。#578）。 */
export const CODEX_HOOK_SCRIPT = "scripts/codex-guard-hook.mjs";
export const CODEX_HOOK_COMMAND = `node "$(git rev-parse --show-toplevel)/${CODEX_HOOK_SCRIPT}" || printf '%s' '${LAUNCH_FAILURE_OUTPUT}'`;
export const EXPECTED_CODEX_HOOKS = Object.freeze({
  hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: CODEX_HOOK_COMMAND }] }] },
});

/**
 * 本番デプロイの判定だけ（#578）。**`decideHookOutput` は使わない。** あれは PR #583 のあと、`agent_id` つきの入力でサブエージェントの
 * 判定（git push・枝の切り替えほか）も返すようになり、Codex では ask が使えず deny になって日常の作業を止める。
 * ここは `findGuardedCommands`（本番デプロイに当たるか）だけを直接使う。入力が読めないときは deny に倒す理由を返す。
 * @param {string} raw
 * @param {(command: string) => {id: string, why: string}[]} [find] 判定（テストで差し替える）
 * @returns {string | null} deny の理由。当たらなければ null
 */
export function productionDenyReason(raw, find = findGuardedCommands) {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return "フックの入力を読めませんでした。念のため拒みます。";
  }
  if (input === null || typeof input !== "object") return "フックの入力の形が想定と違います。念のため拒みます。";
  if (!SHELL_TOOLS.includes(input.tool_name)) return null;
  const command = input.tool_input?.command;
  if (typeof command !== "string") return `${input.tool_name} のコマンドを読めませんでした。念のため拒みます。`;
  const hits = find(command);
  if (hits.length === 0) return null;
  return `本番デプロイに当たるコマンドです: ${hits.map((h) => `${h.id}（${h.why}）`).join("・")}。`;
}
