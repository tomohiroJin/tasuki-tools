/**
 * 入口（`scripts/agent-guard-hook.mjs`）の判定の束ね方（コードレビュー 3・4・docs/adr/0037）。
 *
 * - 判定ごとに try を分ける。**投げた判定は `ask`（判定に失敗しました）に倒し**、ほかの判定を捨てない
 *   （通る側に倒さない。ADR-0032 決定 1「読めないときは当てる側に倒す」）
 * - 当たった判定の理由は**全部まとめて** 1 つの `ask` にする（先に返して後を捨てない）
 * - 本番デプロイの近道（当たったら他を省く）は入口が別に持つ。ここは近道の後の束ねだけ
 */

function ask(reason) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: reason } };
}

/**
 * @param {{ name: string, run: () => object | null | Promise<object | null> }[]} judges
 * @returns {Promise<object | null>} 当たりがなければ null
 */
export async function combineDecisions(judges) {
  const results = await Promise.all(
    judges.map(async ({ name, run }) => {
      try {
        return await run();
      } catch {
        return ask(`${name} の判定に失敗しました。確かめられなかったので、念のため人に確かめます（docs/adr/0037）。`);
      }
    }),
  );
  const found = results.filter((x) => x !== null && x !== undefined);
  if (found.length === 0) return null;
  const out = structuredClone(found[0]);
  out.hookSpecificOutput.permissionDecisionReason = found.map((x) => x.hookSpecificOutput.permissionDecisionReason).join("\n\n");
  return out;
}
