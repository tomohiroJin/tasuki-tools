import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { decideCodexHookOutput } from "./codex-guard-hook.mjs";

/**
 * Codex の入口（scripts/codex-guard-hook.mjs・#578・docs/adr/0032 の追記）の自己テスト。
 * Codex は `permissionDecision: "ask"` を扱わず、コマンドが走ってしまう。止める出力は `deny` だけ。
 */

const HOOK = new URL("./codex-guard-hook.mjs", import.meta.url).pathname;
const input = (command, extra = {}) => JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", cwd: "/x", tool_input: { command }, ...extra });

describe("decideCodexHookOutput: 本番デプロイは deny", () => {
  const denied = [
    "bash deploy/deploy.sh",
    "./deploy/deploy.sh",
    "cd deploy && ./deploy.sh",
    "sudo systemctl restart tasuki",
    "sh -c 'systemctl restart tasuki'",
    "bash -lc \"cd deploy && ./deploy.sh\"",
    "env systemctl restart tasuki",
    "ssh host systemctl restart tasuki",
    "caddy reload",
  ];
  for (const cmd of denied) {
    test(cmd, () => {
      const out = decideCodexHookOutput(input(cmd));
      assert.equal(out?.hookSpecificOutput.hookEventName, "PreToolUse");
      assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
      assert.match(out.hookSpecificOutput.permissionDecisionReason, /本番デプロイ/);
    });
  }
});

describe("decideCodexHookOutput: 当たらなければ何も出さない", () => {
  for (const cmd of ["grep deploy.sh README.md", "cat deploy/README.md", "ls deploy", "git status"]) {
    test(cmd, () => assert.equal(decideCodexHookOutput(input(cmd)), null));
  }
  test("シェルでない道具は何も出さない", () => {
    assert.equal(decideCodexHookOutput(JSON.stringify({ tool_name: "apply_patch", tool_input: { command: "systemctl" } })), null);
  });
});

describe("decideCodexHookOutput: 読めなければ deny に倒す", () => {
  for (const [name, raw] of [
    ["壊れた JSON", "{ not json"],
    ["空の入力", ""],
    ["null", "null"],
    ["command が文字列でない", JSON.stringify({ tool_name: "Bash", tool_input: { command: 42 } })],
  ]) {
    test(name, () => assert.equal(decideCodexHookOutput(raw)?.hookSpecificOutput.permissionDecision, "deny"));
  }
});

describe("入口を実際に起動する", () => {
  const run = (stdin) => spawnSync(process.execPath, [HOOK], { input: stdin, encoding: "utf8" });

  test("本番デプロイは deny を標準出力へ書いて exit 0（ask は書かない）", () => {
    const r = run(input("bash deploy/deploy.sh"));
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
    assert.doesNotMatch(r.stdout, /"ask"/);
  });

  test("当たらなければ何も出さず exit 0", () => {
    const r = run(input("cat deploy/README.md"));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "");
  });

  test("壊れた入力は deny", () => {
    const r = run("{ broken");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, "deny");
  });

  test("先行 PR の確認など、本番デプロイ以外は流さない（gh pr create は何も出さない）", () => {
    const r = run(input('gh pr create --title "x（#9）"'));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "");
  });
});

describe("判定が想定外に投げても deny に倒す（fail-open にしない）", () => {
  test("判定が例外を投げたら deny", () => {
    const out = decideCodexHookOutput(input("ls"), () => {
      throw new Error("boom");
    });
    assert.equal(out?.hookSpecificOutput.permissionDecision, "deny");
  });
});

describe(".codex/hooks.json のコマンドを実際に走らせる（起動の失敗も deny）", () => {
  const REPO = new URL("../", import.meta.url).pathname;
  const hooksCommand = JSON.parse(fs.readFileSync(path.join(REPO, ".codex/hooks.json"), "utf8")).hooks.PreToolUse[0].hooks[0].command;

  /** 配線のコマンドを sh -c で走らせる。Codex は同じように走らせる（cwd はセッションの作業場所）。 */
  function runWired(t, { cwd, command = "bash deploy/deploy.sh", env = {} }) {
    const r = spawnSync("sh", ["-c", hooksCommand], { cwd, input: input(command), encoding: "utf8", env: { ...process.env, ...env } });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim() === "" ? null : JSON.parse(r.stdout);
  }
  const tmp = (t) => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "codex-wired-")));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
  };
  const decision = (out) => out?.hookSpecificOutput.permissionDecision;

  test("対照実行: リポジトリの中（サブディレクトリでも）なら、デプロイは deny・読み取りは何も出さない", (t) => {
    assert.equal(decision(runWired(t, { cwd: REPO })), "deny");
    assert.equal(decision(runWired(t, { cwd: path.join(REPO, "scripts") })), "deny");
    assert.equal(runWired(t, { cwd: REPO, command: "cat deploy/README.md" }), null);
  });

  test("cwd が Git のリポジトリの外なら deny（入口が見つからない）", (t) => {
    assert.equal(decision(runWired(t, { cwd: tmp(t) })), "deny");
  });

  test("リポジトリの中でも入口のファイルが無ければ deny", (t) => {
    const dir = tmp(t);
    spawnSync("git", ["init", "-q"], { cwd: dir });
    assert.equal(decision(runWired(t, { cwd: dir })), "deny");
  });

  test("node が起動に失敗しても（PATH に node が無い）deny", (t) => {
    const bin = tmp(t);
    // node だけ無い PATH。sh・git・printf は絶対パスで引けるよう、既存の PATH から node を除いた bin を作る
    for (const name of ["git", "sh", "printf"]) {
      const found = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" }).stdout.trim();
      if (found.startsWith("/")) fs.symlinkSync(found, path.join(bin, name));
    }
    assert.equal(decision(runWired(t, { cwd: REPO, env: { PATH: bin } })), "deny");
  });

  test("node が投げて非ゼロで終わっても deny（入口の代わりの node）", (t) => {
    const bin = tmp(t);
    fs.writeFileSync(path.join(bin, "node"), "#!/bin/sh\necho oops >&2\nexit 1\n", { mode: 0o755 });
    for (const name of ["git", "sh", "printf"]) {
      const found = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" }).stdout.trim();
      if (found.startsWith("/")) fs.symlinkSync(found, path.join(bin, name));
    }
    assert.equal(decision(runWired(t, { cwd: REPO, env: { PATH: bin } })), "deny");
  });
});
