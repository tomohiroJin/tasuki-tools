import { test } from "node:test";
import assert from "node:assert/strict";
import { combineDecisions } from "./hook-combine.mjs";

const ask = (reason) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: reason } });

test("当たった判定の理由を全部まとめて 1 つの ask にする。何も当たらなければ null", async () => {
  assert.equal(await combineDecisions([{ name: "a", run: () => null }, { name: "b", run: async () => null }]), null);
  const out = await combineDecisions([{ name: "a", run: () => ask("理由 A") }, { name: "b", run: () => null }, { name: "c", run: async () => ask("理由 C") }]);
  assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
  assert.equal(out.hookSpecificOutput.permissionDecisionReason, "理由 A\n\n理由 C");
});

test("投げた判定は ask（判定に失敗しました）に倒し、ほかの判定は捨てない。非同期の棄却も同じ", async () => {
  const out = await combineDecisions([
    { name: "未コミット", run: () => { throw new Error("boom"); } },
    { name: "pnpm", run: () => ask("理由 P") },
    { name: "先行PR", run: async () => { throw new Error("late"); } },
  ]);
  const reason = out.hookSpecificOutput.permissionDecisionReason;
  assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
  assert.match(reason, /未コミット.*判定に失敗しました/);
  assert.match(reason, /理由 P/);
  assert.match(reason, /先行PR.*判定に失敗しました/);
});

const inform = (text) => ({ systemMessage: text, hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: text } });

test("止めずに知らせる出力（permissionDecision なし）だけなら、ask にせず知らせをまとめて返す（#622）", async () => {
  const one = await combineDecisions([{ name: "a", run: () => null }, { name: "b", run: () => inform("知らせ B") }]);
  assert.equal("permissionDecision" in one.hookSpecificOutput, false);
  assert.equal(one.systemMessage, "知らせ B");
  assert.equal(one.hookSpecificOutput.additionalContext, "知らせ B");
  const two = await combineDecisions([{ name: "a", run: () => inform("知らせ A") }, { name: "b", run: () => inform("知らせ B") }]);
  assert.equal(two.systemMessage, "知らせ A\n\n知らせ B");
  assert.equal(two.hookSpecificOutput.additionalContext, "知らせ A\n\n知らせ B");
});

test("ask と知らせが同時に当たれば ask。知らせを理由に足し、ask を落とさない（#622）", async () => {
  const out = await combineDecisions([{ name: "a", run: () => inform("知らせ A") }, { name: "b", run: () => ask("理由 B") }]);
  assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
  assert.equal(out.hookSpecificOutput.permissionDecisionReason, "理由 B\n\n知らせ A");
});

test("知らせが「止めずに」の文を別に持つなら、ask の理由には行だけを足す（#622）", async () => {
  const withLines = { ...inform("行 A\n止めずに知らせます"), infoLines: "行 A" };
  const out = await combineDecisions([{ name: "a", run: () => withLines }, { name: "b", run: () => ask("理由 B") }]);
  assert.equal(out.hookSpecificOutput.permissionDecisionReason, "理由 B\n\n行 A");
  const only = await combineDecisions([{ name: "a", run: () => withLines }]);
  assert.equal(only.systemMessage, "行 A\n止めずに知らせます");
  assert.equal("infoLines" in only, false);
});

test("deny・allow など ask 以外の決定は知らせとして落とさない。deny と知らせが同時でも deny が残り、allow は ask に倒す（#622）", async () => {
  const deny = { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "禁止 D" } };
  const allow = { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: "許可 W" } };
  const d = await combineDecisions([{ name: "a", run: () => inform("知らせ A") }, { name: "b", run: () => deny }]);
  assert.equal(d.hookSpecificOutput.permissionDecision, "deny");
  assert.match(d.hookSpecificOutput.permissionDecisionReason, /禁止 D/);
  const dAsk = await combineDecisions([{ name: "a", run: () => ask("理由 B") }, { name: "b", run: () => deny }]);
  assert.equal(dAsk.hookSpecificOutput.permissionDecision, "deny");
  assert.match(dAsk.hookSpecificOutput.permissionDecisionReason, /理由 B/);
  const w = await combineDecisions([{ name: "a", run: () => inform("知らせ A") }, { name: "b", run: () => allow }]);
  assert.equal(w.hookSpecificOutput.permissionDecision, "ask");
  assert.match(w.hookSpecificOutput.permissionDecisionReason, /許可 W/);
});

test("全部が投げても ask（通る側に倒さない）", async () => {
  const out = await combineDecisions([{ name: "x", run: () => { throw new Error("1"); } }]);
  assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
});
