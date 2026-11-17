/**
 * 入口（`scripts/agent-guard-hook.mjs`）の判定の束ね方（コードレビュー 3・4・docs/adr/0037）。
 *
 * - 判定ごとに try を分ける。**投げた判定は `ask`（判定に失敗しました）に倒し**、ほかの判定を捨てない
 *   （通る側に倒さない。ADR-0032 決定 1「読めないときは当てる側に倒す」）
 * - 当たった判定の理由は**全部まとめて** 1 つの `ask` にする（先に返して後を捨てない）
 * - `permissionDecision` の無い出力（止めずに知らせる。#622）は、決定（ask・deny ほか）と同時なら理由に足し（`infoLines` があればそれ。「止めずに」の文は足さない）、無ければ知らせだけを返す。
 *   `permissionDecision` を持つ出力は知らせにせず、deny は保ち、それ以外は ask に倒す
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
  // 知らせにするのは、`permissionDecision` を**持たない**出力だけ（許可の一覧。#622。`systemMessage` に本文）。
  // 持つ出力（ask・deny・allow・想定外の値）は、すべて決定として扱い、落とさない
  const infos = found.filter((x) => x.hookSpecificOutput?.permissionDecision === undefined);
  const decisions = found.filter((x) => x.hookSpecificOutput?.permissionDecision !== undefined);
  if (decisions.length === 0) {
    const text = infos.map((x) => x.systemMessage).join("\n\n");
    return { systemMessage: text, hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: text } };
  }
  // deny があればそれを保つ。それ以外（ask・allow・想定外）は ask に倒す（通す側に倒さない）
  const base = decisions.find((x) => x.hookSpecificOutput.permissionDecision === "deny") ?? decisions[0];
  const out = structuredClone(base);
  if (out.hookSpecificOutput.permissionDecision !== "deny") out.hookSpecificOutput.permissionDecision = "ask";
  // 知らせは `infoLines`（「止めずに」の文を含まない本文）があればそれを理由に足す
  out.hookSpecificOutput.permissionDecisionReason = [
    ...decisions.map((x) => x.hookSpecificOutput.permissionDecisionReason),
    ...infos.map((x) => x.infoLines ?? x.systemMessage),
  ].join("\n\n");
  return out;
}
