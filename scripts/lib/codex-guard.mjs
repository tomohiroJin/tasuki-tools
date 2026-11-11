/**
 * Codex の入口（`scripts/codex-guard-hook.mjs`）と、その配線の検査（`scripts/audit-codex-guard.mjs`）が共有する部品（#578・docs/adr/0032 の追記）。
 * 純粋な値と関数だけを置く。
 */

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
