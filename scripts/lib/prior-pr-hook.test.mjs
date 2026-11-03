import { test } from "node:test";
import assert from "node:assert/strict";
import { decidePriorPrOutput, extractTitle } from "./prior-pr-hook.mjs";
import { decideHookOutput } from "./agent-guard.mjs";

/** `scripts/lib/prior-pr-hook.mjs` の自己テスト（#504）。引き方は偽物を渡す。 */

const input = (command, tool_name = "Bash") => JSON.stringify({ tool_name, tool_input: { command } });
const found = { state: "found", lines: ["⚠ 同じ ISSUE #504 の他の PR・枝があります", "  - PR #501"] };
const none = { state: "none", lines: ["ok"] };
const notRun = { state: "not-run", lines: ["⚠ 未実行です（理由）"] };

function deps({ branch = "docs/504-x", result = none } = {}) {
  const calls = [];
  return {
    calls,
    currentBranch: () => branch,
    lookup: (a) => { calls.push(a); return result; },
  };
}

test("title を --title・-t・=付き・引用符つきで取る", () => {
  assert.equal(extractTitle(["gh", "pr", "create", "--title", "docs: x（#504）"]), "docs: x（#504）");
  assert.equal(extractTitle(["gh", "pr", "create", "-t", "a #5"]), "a #5");
  assert.equal(extractTitle(["gh", "pr", "create", "--title=a #6"]), "a #6");
  assert.equal(extractTitle(["gh", "pr", "create"]), null);
});

test("gh pr create で先行があれば ask。理由に行を載せる", () => {
  const d = deps({ result: found });
  const out = decidePriorPrOutput(input("gh pr create --title 'docs: x'"), d);
  assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
  assert.equal(out.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /PR #501/);
  assert.deepEqual(d.calls[0].numbers, [504]);
  assert.equal(d.calls[0].branch, "docs/504-x");
});

test("先行が無ければ何も返さない", () => {
  assert.equal(decidePriorPrOutput(input("gh pr create"), deps({ result: none })), null);
});

test("番号は 1 つに絞る（ブランチ優先。題の番号は引かない）", () => {
  const d = deps({ branch: "docs/504-x", result: none });
  decidePriorPrOutput(input("gh pr create --title 'feat: y（#491）'"), d);
  assert.deepEqual(d.calls[0].numbers, [504]);
});

test("題の取り出し: 別の選択肢の値に混ざった t を題と読まず、束ねた -dt の値は次の語から取る", () => {
  const g = ["gh", "pr", "create"];
  assert.equal(extractTitle([...g, "-Tmytemplate", "--title", "x（#9）"]), "x（#9）");
  assert.equal(extractTitle([...g, "-dt", "x（#9）"]), "x（#9）");
  assert.equal(extractTitle([...g, "-btest #9"]), null);
  assert.equal(extractTitle([...g, "-rteam/#3"]), null);
  assert.equal(extractTitle([...g, "-b", "-t x"]), null);
  assert.equal(extractTitle([...g, "--title", "a", "-t", "b"]), "b");
  assert.equal(extractTitle([...g, "-ft"]), null);
});

test("ISSUE でない数字のブランチ名は番号なしとして扱い、題から取る", () => {
  const d = deps({ branch: "chore/node-26-upgrade", result: none });
  decidePriorPrOutput(input("gh pr create --title 'chore: x（#40）'"), d);
  assert.deepEqual(d.calls[0].numbers, [40]);
  const e = deps({ branch: "chore/node-26-upgrade" });
  assert.equal(decidePriorPrOutput(input("gh pr create --title x"), e), null);
  assert.equal(e.calls.length, 0);
});

test("gh pr new（create の別名）も当てる", () => {
  const out = decidePriorPrOutput(input("gh pr new --title x"), deps({ result: found }));
  assert.equal(out?.hookSpecificOutput.permissionDecision, "ask");
});

test("-t<値>・-t=…でない 1 語の形・--title=<値> から題を取る", () => {
  assert.equal(extractTitle(["gh", "pr", "create", "-tfeat（#480）"]), "feat（#480）");
  assert.equal(extractTitle(["gh", "pr", "create", "--title=feat（#480）"]), "feat（#480）");
  const d = deps({ branch: "main", result: none });
  decidePriorPrOutput(input('gh pr create -t"feat（#480）"'), d);
  assert.deepEqual(d.calls[0].numbers, [480]);
});

test("ブランチに番号が無くても題の番号で引く", () => {
  const d = deps({ branch: "main", result: found });
  const out = decidePriorPrOutput(input("gh pr create -t 'x #7'"), d);
  assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
  assert.deepEqual(d.calls[0].numbers, [7]);
});

test("番号がどこにも無ければ引かずに通す", () => {
  const d = deps({ branch: "main" });
  assert.equal(decidePriorPrOutput(input("gh pr create --title x"), d), null);
  assert.equal(d.calls.length, 0);
});

test("引けなかったとき（not-run）は ask に倒す", () => {
  const out = decidePriorPrOutput(input("gh pr create"), deps({ result: notRun }));
  assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /未実行/);
});

test("gh pr create でないコマンド・Bash 以外の道具は引かない", () => {
  const d = deps({ result: found });
  for (const c of ["gh pr list", "gh pr view 5", "gh issue create", "echo gh pr create", "git status"]) {
    assert.equal(decidePriorPrOutput(input(c), d), null, c);
  }
  assert.equal(decidePriorPrOutput(input("gh pr create", "Read"), d), null);
  assert.equal(d.calls.length, 0);
});

test("複合コマンド・bash -c・env の包みの中の gh pr create も当てる", () => {
  for (const c of ["git push && gh pr create --title x", "bash -c 'gh pr create'", "env FOO=1 gh pr create", "cd x; gh -R a/b pr create"]) {
    const out = decidePriorPrOutput(input(c), deps({ result: found }));
    assert.equal(out?.hookSpecificOutput.permissionDecision, "ask", c);
  }
});

test("入力が読めない・command が文字列でないときは何も返さない（既存の本番ガードが担う）", () => {
  assert.equal(decidePriorPrOutput("not json", deps()), null);
  assert.equal(decidePriorPrOutput(JSON.stringify({ tool_name: "Bash", tool_input: {} }), deps()), null);
});

test("本番デプロイのガードの振る舞いは変わらない", () => {
  const raw = input("bash deploy/deploy.sh");
  assert.equal(decideHookOutput(raw).hookSpecificOutput.permissionDecision, "ask");
  assert.equal(decideHookOutput(input("gh pr create")), null);
});
