import { test } from "node:test";
import assert from "node:assert/strict";
import { decidePriorPrOutput, decidePriorPrOutputWithin, extractTitle, parseCreateOptions, effectiveCwd, mentionsPrCreate } from "./prior-pr-hook.mjs";
import { decideHookOutput } from "./agent-guard.mjs";

/** `scripts/lib/prior-pr-hook.mjs` の自己テスト（#504）。引き方は偽物を渡す。 */

const input = (command, tool_name = "Bash") => JSON.stringify({ tool_name, tool_input: { command } });
const found = { state: "found", lines: ["⚠ 同じ ISSUE #504 の他の PR・枝があります", "  - PR #501"] };
const none = { state: "none", lines: ["ok"] };
const notRun = { state: "not-run", lines: ["⚠ 未実行です（理由）"] };

function deps({ branch = "docs/504-x", result = none, cwd = "/repo", worktrees = ["/repo", "/other/wt"] } = {}) {
  const calls = [];
  const branches = [];
  const asked = [];
  return {
    calls,
    branches,
    asked,
    cwd,
    registeredWorktrees: (dir) => { asked.push(dir); return worktrees; },
    currentBranch: (dir) => { branches.push(dir); return branch; },
    lookup: (a) => { calls.push(a); return result; },
  };
}

test("title を --title・-t・=付き・引用符つきで取る", async () => {
  assert.equal(extractTitle(["gh", "pr", "create", "--title", "docs: x（#504）"]), "docs: x（#504）");
  assert.equal(extractTitle(["gh", "pr", "create", "-t", "a #5"]), "a #5");
  assert.equal(extractTitle(["gh", "pr", "create", "--title=a #6"]), "a #6");
  assert.equal(extractTitle(["gh", "pr", "create"]), null);
});

test("gh pr create で先行があれば ask。理由に行を載せる", async () => {
  const d = deps({ result: found });
  const out = await decidePriorPrOutput(input("gh pr create --title 'docs: x'"), d);
  assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
  assert.equal(out.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /PR #501/);
  assert.deepEqual(d.calls[0].numbers, [504]);
  assert.equal(d.calls[0].branch, "docs/504-x");
});

test("先行が無ければ何も返さない", async () => {
  assert.equal(await decidePriorPrOutput(input("gh pr create"), deps({ result: none })), null);
});

test("番号はブランチと題の最大 2 つを引く（同じなら 1 つ）", async () => {
  const d = deps({ branch: "docs/504-x", result: none });
  await decidePriorPrOutput(input("gh pr create --title 'feat: y（#491）'"), d);
  assert.deepEqual(d.calls[0].numbers, [504, 491]);
  const e = deps({ branch: "docs/504-x", result: none });
  await decidePriorPrOutput(input("gh pr create --title 'feat: y（#504）と #1'"), e);
  assert.deepEqual(e.calls[0].numbers, [504]);
});

test("切れて none のときは ask に倒す（無いと言い切れない）", async () => {
  const out = await decidePriorPrOutput(input("gh pr create"), deps({ result: { state: "none", truncated: true, lines: ["⚠ 検索が上限に当たりました"] } }));
  assert.equal(out?.hookSpecificOutput.permissionDecision, "ask");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /上限/);
});

test("--head があれば、自分の枝と番号はそちらから取る", async () => {
  const d = deps({ branch: "main", result: none });
  await decidePriorPrOutput(input("gh pr create --head docs/504-x --title t"), d);
  assert.equal(d.calls[0].branch, "docs/504-x");
  assert.deepEqual(d.calls[0].numbers, [504]);
  const e = deps({ branch: "docs/1-x", result: none });
  await decidePriorPrOutput(input("gh pr create -H me:docs/9-y"), e);
  assert.equal(e.calls[0].branch, "docs/9-y");
  assert.deepEqual(parseCreateOptions(["gh", "pr", "create", "--head=a/b", "-t", "x"]), { title: "x", head: "a/b" });
  assert.equal(parseCreateOptions(["gh", "pr", "create", "-Hfoo"]).head, "foo");
});

test("先頭の cd を解釈して作業場所を直す。読めない形は元のまま", async () => {
  assert.equal(effectiveCwd("cd ../wt && gh pr create", "/a/repo"), "/a/wt");
  assert.equal(effectiveCwd('cd "/x y"; gh pr create', "/a"), "/x y");
  assert.equal(effectiveCwd("cd /abs&&gh pr create", "/a"), "/abs");
  for (const c of ["gh pr create", "echo hi && cd /x && gh pr create", "cd ~/w && gh pr create", "cd $W && gh pr create", "cd - && gh pr create", "cd && gh pr create"]) {
    assert.equal(effectiveCwd(c, "/a"), "/a", c);
  }
});

test("cd の先が登録済みの worktree なら、その場所で引く", async () => {
  const d = deps({ result: none });
  await decidePriorPrOutput(input("cd /other/wt && gh pr create"), d);
  assert.deepEqual(d.branches, ["/other/wt"]);
  assert.equal(d.calls[0].dir, "/other/wt");
  assert.deepEqual(d.asked, ["/repo"]); // 登録の一覧は、フックの入力の cwd で引く
});

test("cd の先が登録外なら、何も流さずに ask（信用できない場所の git 設定を許可の前に実行しない）", async () => {
  const d = deps({ result: none });
  const out = await decidePriorPrOutput(input("cd /tmp/evil && gh pr create"), d);
  assert.equal(out?.hookSpecificOutput.permissionDecision, "ask");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /\/tmp\/evil.*worktree ではありません/);
  assert.deepEqual(d.branches, []); // git rev-parse を流さない
  assert.deepEqual(d.calls, []); // 先行 PR の lookup（gh・git ls-remote）を流さない
});

test("登録の一覧を引けないときも、cd の先では何も流さずに ask", async () => {
  const d = { ...deps(), registeredWorktrees: () => { throw new Error("git: not a repo"); } };
  const out = await decidePriorPrOutput(input("cd /other/wt && gh pr create"), d);
  assert.equal(out?.hookSpecificOutput.permissionDecision, "ask");
  assert.deepEqual(d.branches, []);
  assert.deepEqual(d.calls, []);
});

test("cd の無いコマンドでは、登録の一覧を引かない（入力の cwd は信用する場所）", async () => {
  const d = deps({ result: none });
  await decidePriorPrOutput(input("gh pr create"), d);
  assert.deepEqual(d.asked, []);
});

test("全体の上限: lookup が終わらなくても、上限の内に ask を返す", async () => {
  const d = { ...deps(), lookup: () => new Promise(() => {}) };
  const t0 = Date.now();
  const out = await decidePriorPrOutputWithin(input("gh pr create"), d, 50);
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(out?.hookSpecificOutput.permissionDecision, "ask");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /上限/);
});

test("全体の上限: gh pr create でないコマンドは待たずに null", async () => {
  const d = { ...deps(), lookup: () => new Promise(() => {}) };
  assert.equal(await decidePriorPrOutputWithin(input("git status"), d, 50), null);
});

test("mentionsPrCreate: gh pr create を含むコマンドだけ真", () => {
  assert.equal(mentionsPrCreate(input("bash deploy/deploy.sh && gh pr create")), true);
  assert.equal(mentionsPrCreate(input("bash deploy/deploy.sh")), false);
  assert.equal(mentionsPrCreate("not json"), false);
});

test("gh pr create 以外で pr create が引数に出ても当てない（位置を固定）", async () => {
  const d = deps({ result: found });
  for (const c of ["gh issue list --search 'pr create'", "gh issue list --search pr create", "gh search prs pr create"]) {
    assert.equal(await decidePriorPrOutput(input(c), d), null, c);
  }
  assert.equal(d.calls.length, 0);
  const out = await decidePriorPrOutput(input("gh -R a/b pr create"), deps({ result: found }));
  assert.equal(out?.hookSpecificOutput.permissionDecision, "ask");
});

test("ISSUE でない数字のブランチ名は番号なしとして扱い、題から取る", async () => {
  const d = deps({ branch: "chore/node-26-upgrade", result: none });
  await decidePriorPrOutput(input("gh pr create --title 'chore: x（#40）'"), d);
  assert.deepEqual(d.calls[0].numbers, [40]);
  const e = deps({ branch: "chore/node-26-upgrade" });
  assert.equal(await decidePriorPrOutput(input("gh pr create --title x"), e), null);
  assert.equal(e.calls.length, 0);
});

test("gh pr new（create の別名）も当てる", async () => {
  const out = await decidePriorPrOutput(input("gh pr new --title x"), deps({ result: found }));
  assert.equal(out?.hookSpecificOutput.permissionDecision, "ask");
});

test("-t<値>・-t=…でない 1 語の形・--title=<値> から題を取る", async () => {
  assert.equal(extractTitle(["gh", "pr", "create", "-tfeat（#480）"]), "feat（#480）");
  assert.equal(extractTitle(["gh", "pr", "create", "--title=feat（#480）"]), "feat（#480）");
  const d = deps({ branch: "main", result: none });
  await decidePriorPrOutput(input('gh pr create -t"feat（#480）"'), d);
  assert.deepEqual(d.calls[0].numbers, [480]);
});

test("ブランチに番号が無くても題の番号で引く", async () => {
  const d = deps({ branch: "main", result: found });
  const out = await decidePriorPrOutput(input("gh pr create -t 'x #7'"), d);
  assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
  assert.deepEqual(d.calls[0].numbers, [7]);
});

test("番号がどこにも無ければ引かずに通す", async () => {
  const d = deps({ branch: "main" });
  assert.equal(await decidePriorPrOutput(input("gh pr create --title x"), d), null);
  assert.equal(d.calls.length, 0);
});

test("引けなかったとき（not-run）は ask に倒す", async () => {
  const out = await decidePriorPrOutput(input("gh pr create"), deps({ result: notRun }));
  assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /未実行/);
});

test("gh pr create でないコマンド・Bash 以外の道具は引かない", async () => {
  const d = deps({ result: found });
  for (const c of ["gh pr list", "gh pr view 5", "gh issue create", "echo gh pr create", "git status"]) {
    assert.equal(await decidePriorPrOutput(input(c), d), null, c);
  }
  assert.equal(await decidePriorPrOutput(input("gh pr create", "Read"), d), null);
  assert.equal(d.calls.length, 0);
});

test("複合コマンド・bash -c・env の包みの中の gh pr create も当てる", async () => {
  for (const c of ["git push && gh pr create --title x", "bash -c 'gh pr create'", "env FOO=1 gh pr create", "cd x; gh -R a/b pr create"]) {
    const out = await decidePriorPrOutput(input(c), deps({ result: found }));
    assert.equal(out?.hookSpecificOutput.permissionDecision, "ask", c);
  }
});

test("入力が読めない・command が文字列でないときは何も返さない（既存の本番ガードが担う）", async () => {
  assert.equal(await decidePriorPrOutput("not json", deps()), null);
  assert.equal(await decidePriorPrOutput(JSON.stringify({ tool_name: "Bash", tool_input: {} }), deps()), null);
});

test("本番デプロイのガードの振る舞いは変わらない", async () => {
  const raw = input("bash deploy/deploy.sh");
  assert.equal(decideHookOutput(raw).hookSpecificOutput.permissionDecision, "ask");
  assert.equal(decideHookOutput(input("gh pr create")), null);
});
