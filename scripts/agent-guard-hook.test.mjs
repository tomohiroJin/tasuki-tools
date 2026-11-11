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

function run(t, command, { prs = "[]", branch = "docs/9-x", ghMarker = null, agentId = undefined } = {}) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "hook-bin-"));
  t.after(() => fs.rmSync(bin, { recursive: true, force: true }));
  const tool = (name, body) => fs.writeFileSync(path.join(bin, name), `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, "pnpm-workspace.yaml"), 'packages:\n  - "apps/*"\n');
  fs.writeFileSync(path.join(bin, "package.json"), '{"name":"root"}');
  tool("gh", `${ghMarker ? `require("node:fs").writeFileSync(${JSON.stringify(ghMarker)}, "x");` : ""}process.stdout.write(${JSON.stringify(prs)});`);
  tool("git", `const a = process.argv.slice(2); if (a[0] === 'rev-parse') process.stdout.write(${JSON.stringify(`${branch}\n`)}); else if (a[0] === 'worktree') process.stdout.write('worktree ' + process.cwd() + '\\n'); else process.stdout.write('');`);
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: "Bash", cwd: bin, ...(agentId ? { agent_id: agentId } : {}), tool_input: { command } }),
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

/** 本物の git で作った作業ツリーの cwd と、偽の gh（先行 PR は無い）で入口を起動する（#578 の判定の配線）。 */
function runInRepo(t, input, { files = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hook-repo-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const sh = (...a) => spawnSync("git", a, { cwd: dir, encoding: "utf8" });
  sh("init", "-q");
  sh("config", "user.email", "t@example.com");
  sh("config", "user.name", "t");
  for (const [name, body] of Object.entries({ "a.ts": "1", ...files })) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), body);
  }
  sh("add", ".");
  sh("commit", "-qm", "init");
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "hook-bin-"));
  t.after(() => fs.rmSync(bin, { recursive: true, force: true }));
  fs.writeFileSync(path.join(bin, "gh"), `#!${process.execPath}\nprocess.stdout.write("[]");\n`, { mode: 0o755 });
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: "Bash", cwd: dir, ...input }),
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
  });
  assert.equal(r.status, 0, r.stderr);
  return { dir, out: r.stdout.trim() === "" ? null : JSON.parse(r.stdout), reason: r.stdout.trim() === "" ? "" : JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason };
}

test("入口: サブエージェント（agent_id あり）の git push は ask、まとめ役（agent_id なし）は通す（#578）", (t) => {
  const sub = runInRepo(t, { agent_id: "a1", agent_type: "general-purpose", tool_input: { command: "git push origin HEAD" } });
  assert.equal(sub.out?.hookSpecificOutput.permissionDecision, "ask");
  assert.match(sub.reason, /サブエージェント/);
  assert.equal(runInRepo(t, { tool_input: { command: "git push origin HEAD" } }).out, null);
});

test("入口: 未コミットの変更を消す git は、変更があるときだけ ask（#578）", (t) => {
  assert.equal(runInRepo(t, { tool_input: { command: "git checkout -- a.ts" } }).out, null);
  assert.equal(runInRepo(t, { tool_input: { command: "git stash" } }).out, null);
  // 変更を作ってから同じコマンドを流す
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hook-dirty-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const sh = (...a) => spawnSync("git", a, { cwd: dir, encoding: "utf8" });
  sh("init", "-q");
  sh("config", "user.email", "t@example.com");
  sh("config", "user.name", "t");
  fs.writeFileSync(path.join(dir, "a.ts"), "1");
  sh("add", ".");
  sh("commit", "-qm", "init");
  fs.writeFileSync(path.join(dir, "a.ts"), "2");
  for (const command of ["git checkout -- a.ts", "git restore a.ts", "git stash"]) {
    const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ tool_name: "Bash", cwd: dir, tool_input: { command } }), encoding: "utf8" });
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, "ask", command);
  }
  const staged = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ tool_name: "Bash", cwd: dir, tool_input: { command: "git restore --staged a.ts" } }), encoding: "utf8" });
  assert.equal(staged.stdout.trim(), "");
});

test("入口: どのパッケージにも当たらない pnpm --filter は ask、当たれば通す（#578）", (t) => {
  const files = { "pnpm-workspace.yaml": 'packages:\n  - "apps/*"\n', "apps/sync/package.json": '{"name":"@s/sync"}' };
  assert.equal(runInRepo(t, { tool_input: { command: "pnpm --filter @s/tasuki-sync test" } }, { files }).out?.hookSpecificOutput.permissionDecision, "ask");
  assert.equal(runInRepo(t, { tool_input: { command: "pnpm --filter @s/sync test" } }, { files }).out, null);
});

test("入口: gh pr create の本文・コミットの閉鎖キーワードを ask で知らせる。単独の閉鎖は通す（#578）", (t) => {
  const bad = runInRepo(t, { tool_input: { command: 'gh pr create --title "x（#9）" --body "説明に Fixes #5 と書いた"' } });
  assert.equal(bad.out?.hookSpecificOutput.permissionDecision, "ask");
  assert.match(bad.reason, /閉鎖キーワード/);
  assert.equal(runInRepo(t, { tool_input: { command: 'gh pr create --title x --body "Closes #5"' } }).out, null);
});

test("入口 I1: 未コミットの判定が当たっても、gh pr create の先行 PR の知らせと閉鎖キーワードの知らせを捨てず、理由を全部まとめる", (t) => {
  const out = run(t, 'GIT_DIR=x git stash; gh pr create --title "x（#9）" --body "説明に Fixes #9 と書く"', { prs: pr });
  assert.equal(out?.hookSpecificOutput.permissionDecision, "ask");
  const reason = out.hookSpecificOutput.permissionDecisionReason;
  assert.match(reason, /未コミットの変更/);
  assert.match(reason, /PR #501/);
  assert.match(reason, /閉鎖キーワード/);
});

test("入口 I1: pnpm --filter の判定が当たっても先行 PR の知らせを捨てない", (t) => {
  const out = run(t, 'pnpm --filter @nope/none test; gh pr create --title "x（#9）"', { prs: pr });
  const reason = out.hookSpecificOutput.permissionDecisionReason;
  assert.match(reason, /--filter/);
  assert.match(reason, /PR #501/);
});

test("入口 コードレビュー 3: サブエージェントの ask が出ても、先行 PR・閉鎖キーワードの知らせを捨てない（近道は本番デプロイだけ）", (t) => {
  const bin = null;
  const out = run(t, 'git push -u origin x && gh pr create --title "x（#9）" --body "説明に fixes #5 と書く"', { prs: pr, agentId: "a1" });
  const reason = out.hookSpecificOutput.permissionDecisionReason;
  assert.match(reason, /サブエージェント/);
  assert.match(reason, /PR #501/);
  assert.match(reason, /閉鎖キーワード/);
});
