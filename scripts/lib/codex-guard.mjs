/**
 * Codex の入口（`scripts/codex-guard-hook.mjs`）と、その配線の検査（`scripts/audit-codex-guard.mjs`）が共有する部品（#578・docs/adr/0032 の追記）。
 * 純粋な値と関数だけを置く。
 */

import { findGuardedCommands } from "./agent-guard.mjs";

/** deny を返す理由の末尾に足す、Codex では人に聞く道が無いことの説明。 */
export const CODEX_NOTE =
  "Codex には人に聞く道が無いため、拒みます。人の明示の指示があるときは、人が自分の端末で実行するか、人がフックを外した上でやり直してください（docs/adr/0032）。";

/** Codex が止まる形の PreToolUse の出力（`ask` は Codex では失敗扱いでコマンドが走る）。 */
export const deny = (reason) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } });

/**
 * 入口が起動できなかったとき（node が無い・入口が失敗した）に、`.codex/hooks.json` のコマンドが標準出力へ書く JSON。
 * 起動の失敗は、Codex では「フックの失敗」として**コマンドが走る**ので、ここでも deny に倒す。
 * 引用符（'）を含めないこと（シェルの単引用符で包んで書くため）。
 */
export const LAUNCH_FAILURE_OUTPUT = JSON.stringify(deny("本番デプロイの歯止め（scripts/codex-guard-hook.mjs）を起動できなかったため、念のため拒みます。docs/adr/0032"));

/**
 * Git のルートが引けなかったとき（cwd がリポジトリの外）の deny の出力。人が端末で戻す方法を添える。
 * 引用符（'）を含めないこと。
 */
export const ROOT_FAILURE_OUTPUT = JSON.stringify(
  deny(
    "Git のルートを引けなかったため、本番デプロイの歯止めを確かめられず、念のため拒みます。リポジトリの中で Codex を起動し直すか、人が自分の端末でこのコマンドを実行するか、フックを外してください（docs/adr/0032）。",
  ),
);

export const CODEX_HOOK_SCRIPT = "scripts/codex-guard-hook.mjs";
/**
 * hooks.json に書くフックのコマンド。3 つに分ける。
 * ① `git rev-parse --show-toplevel` が失敗 → deny（`ROOT_FAILURE_OUTPUT`）
 * ② 成功したが、そのルートに入口が無い → **何も出さず exit 0**。その版には歯止めがそもそも無い（歯止めが入る前のコミット・bisect・
 *    入れ子の git リポジトリ・`GIT_DIR` で別のリポジトリを指すとき）。deny にすると `ls` や `git switch -` まで止まり、Codex 自身では戻れない
 * ③ 在る → 入口の出力を一度受け、入口が**成功したときだけ**それを出し、失敗したら deny だけを出す
 *    （`node … || printf` だと、入口が deny を書いた後に非ゼロで終わったとき JSON が 2 つ連なり、Codex は失敗とみなして通す。#584 のレビュー）。
 *    入口が「当たらない」と何も出さず exit 0 で終わるときは何も出さない
 */
export const CODEX_HOOK_COMMAND = [
  `r="$(git rev-parse --show-toplevel)" || { printf '%s' '${ROOT_FAILURE_OUTPUT}'; exit 0; }`,
  `[ -f "$r/${CODEX_HOOK_SCRIPT}" ] || exit 0`,
  `out="$(node "$r/${CODEX_HOOK_SCRIPT}")" && printf '%s' "$out" || printf '%s' '${LAUNCH_FAILURE_OUTPUT}'`,
].join("; ");
/** hooks.json の中身（.codex/hooks.json）として許す形。**これから作った正準の文字列（`scripts/audit-codex-guard.mjs` の `CANONICAL_CODEX_HOOKS_TEXT`）と文字列ごと比べて一致するものだけ**を通す（許可リスト。#578）。 */
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
  // tool_name では絞らない。matcher が Bash に絞っており、二重のふるいは名前が変わったときに黙って外れる道になるだけ（#584 のレビュー）。
  // command を読めないときは deny（この入口は Bash の matcher からしか呼ばれない前提）。
  const command = input.tool_input?.command;
  if (typeof command !== "string") return "シェルのコマンド（tool_input.command）を読めませんでした。念のため拒みます。";
  const hits = find(command);
  if (hits.length === 0) return null;
  return `本番デプロイに当たるコマンドです: ${hits.map((h) => `${h.id}（${h.why}）`).join("・")}。`;
}
