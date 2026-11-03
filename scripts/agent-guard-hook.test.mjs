import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

/**
 * 入口のフック（scripts/agent-guard-hook.mjs）を実際に起動する自己テスト（#504）。
 * 配線（本番デプロイの判定の後に先行 PR の判定を呼ぶこと）は部品のテストでは守れない。
 * gh と git は PATH の先頭に置いた偽物で、ネットワークは叩かない。
 */

const HOOK = new URL("./agent-guard-hook.mjs", import.meta.url).pathname;

function run(t, command, { prs = "[]", branch = "docs/9-x" } = {}) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "hook-bin-"));
  t.after(() => fs.rmSync(bin, { recursive: true, force: true }));
  const tool = (name, body) => fs.writeFileSync(path.join(bin, name), `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
  tool("gh", `process.stdout.write(${JSON.stringify(prs)});`);
  tool("git", `const a = process.argv.slice(2); if (a[0] === 'rev-parse') process.stdout.write(${JSON.stringify(`${branch}\n`)}); else process.stdout.write('');`);
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: "Bash", cwd: bin, tool_input: { command } }),
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() === "" ? null : JSON.parse(r.stdout);
}

const pr = JSON.stringify([{ number: 501, title: "docs: 先行（#9）", body: "", state: "OPEN", headRefName: "x/501" }]);

test("入口: gh pr create で先行 PR があれば ask を返す（配線）", (t) => {
  const out = run(t, 'gh pr create --title "x（#9）"', { prs: pr });
  assert.equal(out?.hookSpecificOutput.permissionDecision, "ask");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /PR #501/);
});

test("入口: 先行が無ければ何も返さない・gh pr list は引かない", (t) => {
  assert.equal(run(t, "gh pr create --title x"), null);
  assert.equal(run(t, "gh pr list", { prs: pr }), null);
});

test("入口: 本番デプロイは従来どおり ask", (t) => {
  const out = run(t, "bash deploy/deploy.sh");
  assert.equal(out?.hookSpecificOutput.permissionDecision, "ask");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /本番デプロイ/);
});

test("入口: --head の枝を自分の枝とし、その PR は先行に数えない", (t) => {
  const own = JSON.stringify([{ number: 501, title: "docs: 自分（#9）", body: "", state: "OPEN", headRefName: "docs/9-y" }]);
  assert.equal(run(t, "gh pr create --head docs/9-y", { prs: own, branch: "main" }), null);
  assert.equal(run(t, "gh pr create", { prs: own, branch: "docs/9-x" })?.hookSpecificOutput.permissionDecision, "ask");
});

test("入口: 本番デプロイと先行 PR の両方に当たれば、理由を 1 つの ask にまとめる", (t) => {
  const out = run(t, "bash deploy/deploy.sh && gh pr create", { prs: pr });
  const reason = out.hookSpecificOutput.permissionDecisionReason;
  assert.match(reason, /本番デプロイ/);
  assert.match(reason, /PR #501/);
});
