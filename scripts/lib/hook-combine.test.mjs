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

test("全部が投げても ask（通る側に倒さない）", async () => {
  const out = await combineDecisions([{ name: "x", run: () => { throw new Error("1"); } }]);
  assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
});
