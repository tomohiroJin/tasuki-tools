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

function run(t, command, { prs = "[]", branch = "docs/9-x", ghMarker = null } = {}) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "hook-bin-"));
  t.after(() => fs.rmSync(bin, { recursive: true, force: true }));
  const tool = (name, body) => fs.writeFileSync(path.join(bin, name), `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
  tool("gh", `${ghMarker ? `require("node:fs").writeFileSync(${JSON.stringify(ghMarker)}, "x");` : ""}process.stdout.write(${JSON.stringify(prs)});`);
  tool("git", `const a = process.argv.slice(2); if (a[0] === 'rev-parse') process.stdout.write(${JSON.stringify(`${branch}\n`)}); else if (a[0] === 'worktree') process.stdout.write('worktree ' + process.cwd() + '\\n'); else process.stdout.write('');`);
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

test("入口: 本番デプロイに当たるコマンドでは先行 PR の確認（gh）を流さず、デプロイの ask をすぐ返す", (t) => {
  const marker = path.join(os.tmpdir(), `hook-gh-called-${process.pid}-${Date.now()}`);
  t.after(() => fs.rmSync(marker, { force: true }));
  const out = run(t, "bash deploy/deploy.sh && gh pr create", { prs: pr, ghMarker: marker });
  const reason = out.hookSpecificOutput.permissionDecisionReason;
  assert.match(reason, /本番デプロイ/);
  assert.match(reason, /先行 PR の確認は省きました/);
  assert.equal(fs.existsSync(marker), false, "gh が呼ばれた");
  const plain = run(t, "systemctl restart x", { ghMarker: marker });
  assert.doesNotMatch(plain.hookSpecificOutput.permissionDecisionReason, /省きました/);
});

test("入口: cd の先が登録外なら、そこでは何も流さずに ask", (t) => {
  const out = run(t, "cd /tmp && gh pr create --title 'x（#9）'", { prs: pr });
  assert.equal(out?.hookSpecificOutput.permissionDecision, "ask");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /worktree ではありません/);
});

/** SIGTERM を無視し、孫（別のセッションに移った sleep と、同じグループの sleep）が出力の管を握ったままにする偽の gh を置いて起動する。 */
function runWithStubbornGh(t, command) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "hook-stubborn-"));
  t.after(() => fs.rmSync(bin, { recursive: true, force: true }));
  const tool = (name, body) => fs.writeFileSync(path.join(bin, name), `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
  tool(
    "gh",
    `const { spawn } = require("node:child_process");
process.on("SIGTERM", () => {});
spawn("sleep", ["30"], { stdio: "inherit" });
spawn("sleep", ["30"], { stdio: "inherit", detached: true });
setInterval(() => {}, 1000);`,
  );
  tool("git", `const a = process.argv.slice(2); if (a[0] === 'rev-parse') process.stdout.write('docs/9-x\\n'); else process.stdout.write('');`);
  const started = Date.now();
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: "Bash", cwd: bin, tool_input: { command } }),
    encoding: "utf8",
    timeout: 40_000,
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
  });
  return { r, elapsed: Date.now() - started };
}

test("入口: 孫が出力の管を握ったままでも、子の上限（10 秒）の少し上で ask を書いて終わる", (t) => {
  const { r, elapsed } = runWithStubbornGh(t, 'gh pr create --title "x（#9）"');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, "ask");
  assert.ok(elapsed < 16_000, `終わるまでに ${elapsed} ms かかった（フックの時間切れを超えうる）`);
});
