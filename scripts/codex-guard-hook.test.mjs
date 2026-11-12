import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { decideCodexHookOutput } from "./codex-guard-hook.mjs";
import { CODEX_HOOK_COMMAND } from "./lib/codex-guard.mjs";

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
  test("tool_name で絞らない（matcher が Bash に絞っているので二重のふるいにしない）: 名前が違う・欠けていても command があれば判定する", () => {
    for (const extra of [{ tool_name: "exec_command" }, { tool_name: undefined }, { tool_name: "Monitor" }])
      assert.equal(decideCodexHookOutput(input("systemctl restart tasuki", extra))?.hookSpecificOutput.permissionDecision, "deny", JSON.stringify(extra));
    assert.equal(decideCodexHookOutput(input("ls", { tool_name: "exec_command" })), null);
  });

  test("command が無い・文字列でないときは deny（Bash の matcher からしか呼ばれない前提）", () => {
    for (const raw of [JSON.stringify({ tool_name: "apply_patch", tool_input: {} }), JSON.stringify({ tool_name: "Bash" }), JSON.stringify({ tool_input: { command: ["ls"] } })])
      assert.equal(decideCodexHookOutput(raw)?.hookSpecificOutput.permissionDecision, "deny", raw);
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
  // 配線のコマンドの正本は lib の CODEX_HOOK_COMMAND。hooks.json が同じ値であることは下の 1 件で見る（audit-codex-guard も完全一致で見る）
  const hooksCommand = CODEX_HOOK_COMMAND;
  test("実リポジトリの .codex/hooks.json のコマンドは lib の値と同じ", () => {
    assert.equal(JSON.parse(fs.readFileSync(path.join(REPO, ".codex/hooks.json"), "utf8")).hooks.PreToolUse[0].hooks[0].command, CODEX_HOOK_COMMAND);
  });

  /** 配線のコマンドを sh -c で走らせる。実測（2026-11-12）で、Codex は `$(git rev-parse …)` を展開した（コマンドはシェルを通る）。まだ分からないのは、フックを走らせる cwd（ここではセッションの作業場所と仮定している）など。 */
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
  /** 指定のコマンドだけを持つ PATH（node の代わりを置ける）。git・sh・printf は本物へ symlink する。 */
  const pathWith = (t, nodeScript) => {
    const bin = tmp(t);
    for (const name of ["git", "sh", "printf"]) {
      const found = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" }).stdout.trim();
      if (found.startsWith("/")) fs.symlinkSync(found, path.join(bin, name));
    }
    if (nodeScript !== undefined) fs.writeFileSync(path.join(bin, "node"), nodeScript, { mode: 0o755 });
    return bin;
  };
  const decision = (out) => out?.hookSpecificOutput.permissionDecision;

  test("対照実行: リポジトリの中（サブディレクトリでも）なら、デプロイは deny・読み取りは何も出さない", (t) => {
    assert.equal(decision(runWired(t, { cwd: REPO })), "deny");
    assert.equal(decision(runWired(t, { cwd: path.join(REPO, "scripts") })), "deny");
    assert.equal(runWired(t, { cwd: REPO, command: "cat deploy/README.md" }), null);
  });

  test("cwd がどのリポジトリにも属さない場所なら deny（Git のルートが引けない。親のリポジトリの中・GIT_WORK_TREE だけの設定は固定しない）", (t) => {
    assert.equal(decision(runWired(t, { cwd: tmp(t) })), "deny");
    // 外では ordinary なコマンドも止まる（安全側に倒す判断。ADR-0032 の追記・#578 のレビュー）
    assert.equal(decision(runWired(t, { cwd: tmp(t), command: "ls" })), "deny");
  });

  test("入口のファイルが無い版（歯止めが入る前のコミット・bisect）の作業ツリーでは、何も出さない（ls・git switch - まで deny にして Codex 自身で戻れなくしない）", (t) => {
    const dir = tmp(t);
    spawnSync("git", ["init", "-q"], { cwd: dir });
    for (const command of ["ls", "git switch -", "git status", "bash deploy/deploy.sh"]) assert.equal(runWired(t, { cwd: dir, command }), null, command);
  });

  describe("いまの版（.codex/hooks.json が在る）で入口だけが欠けたときは deny（通さない）", () => {
    /** .codex/hooks.json だけがある git リポジトリ。入口の状態は mutate で作る。 */
    const repoWithHooks = (t, mutate) => {
      const dir = tmp(t);
      spawnSync("git", ["init", "-q"], { cwd: dir });
      fs.mkdirSync(path.join(dir, ".codex"));
      fs.writeFileSync(path.join(dir, ".codex/hooks.json"), "{}\n");
      fs.mkdirSync(path.join(dir, "scripts"));
      mutate(path.join(dir, "scripts/codex-guard-hook.mjs"));
      return dir;
    };
    const states = {
      "入口が無い（git mv・作業ツリーから消した・古いコミットの部分的な書き戻し）": () => {},
      "入口の場所がディレクトリ": (f) => fs.mkdirSync(f),
      "入口が壊れた symlink": (f) => fs.symlinkSync("/nonexistent-target", f),
    };
    for (const [name, mutate] of Object.entries(states)) {
      for (const command of ["bash deploy/deploy.sh", "sudo systemctl restart tasuki"]) {
        test(`${name}: ${command}`, (t) => {
          const out = runWired(t, { cwd: repoWithHooks(t, mutate), command });
          assert.equal(decision(out), "deny");
          assert.match(out.hookSpecificOutput.permissionDecisionReason, /入口（scripts\/codex-guard-hook\.mjs）が欠けています/);
        });
      }
    }
    test(".codex/hooks.json が壊れた symlink で入口も無いときも deny（[ -L ] の分岐）", (t) => {
      const dir = tmp(t);
      spawnSync("git", ["init", "-q"], { cwd: dir });
      fs.mkdirSync(path.join(dir, ".codex"));
      fs.symlinkSync("/nonexistent-target", path.join(dir, ".codex/hooks.json"));
      const out = runWired(t, { cwd: dir, command: "bash deploy/deploy.sh" });
      assert.equal(decision(out), "deny");
      assert.match(out.hookSpecificOutput.permissionDecisionReason, /入口（scripts\/codex-guard-hook\.mjs）が欠けています/);
    });
    test("対照実行: .codex/hooks.json も入口も無い古い版では、同じコマンドも何も出さない（戻れる）", (t) => {
      const dir = tmp(t);
      spawnSync("git", ["init", "-q"], { cwd: dir });
      assert.equal(runWired(t, { cwd: dir, command: "sudo systemctl restart tasuki" }), null);
    });
  });

  test("入口が在って node が失敗したら deny（入口の無い版の許しは、入口が在るときには効かない）", (t) => {
    const dir = tmp(t);
    spawnSync("git", ["init", "-q"], { cwd: dir });
    fs.mkdirSync(path.join(dir, "scripts"));
    fs.writeFileSync(path.join(dir, "scripts/codex-guard-hook.mjs"), "throw new Error('broken');\n");
    assert.equal(decision(runWired(t, { cwd: dir })), "deny");
  });

  test("Git のルートが引けないときの deny の理由に、人が端末で戻す方法がある", (t) => {
    const out = runWired(t, { cwd: tmp(t) });
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /端末/);
  });

  test("node が起動に失敗しても（PATH に node が無い）deny", (t) => {
    assert.equal(decision(runWired(t, { cwd: REPO, env: { PATH: pathWith(t) } })), "deny");
  });

  test("node が投げて非ゼロで終わっても deny（入口の代わりの node）", (t) => {
    assert.equal(decision(runWired(t, { cwd: REPO, env: { PATH: pathWith(t, "#!/bin/sh\necho oops >&2\nexit 1\n") } })), "deny");
  });

  test("node が出力を書いた後に非ゼロで終わっても、JSON は 1 つだけ（2 つ連なると Codex が失敗とみなして通す）", (t) => {
    const stub = `#!/bin/sh\nprintf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"first"}}'\nexit 1\n`;
    const r = spawnSync("sh", ["-c", hooksCommand], { cwd: REPO, input: input("ls"), encoding: "utf8", env: { ...process.env, PATH: pathWith(t, stub) } });
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.hookSpecificOutput.permissionDecision, "deny");
    assert.doesNotMatch(parsed.hookSpecificOutput.permissionDecisionReason, /first/);
  });

  test("node が成功したときは、その出力をそのまま返す", (t) => {
    const stub = `#!/bin/sh\nprintf '%s' '{"ok":1}'\n`;
    const r = spawnSync("sh", ["-c", hooksCommand], { cwd: REPO, input: input("ls"), encoding: "utf8", env: { ...process.env, PATH: pathWith(t, stub) } });
    assert.equal(r.stdout, '{"ok":1}');
  });

  test("書き込みが投げても入口は exit 0（例外を全部捕まえる）", (t) => {
    const preload = path.join(tmp(t), "throw-write.mjs");
    fs.writeFileSync(preload, 'process.stdout.write = () => { throw new Error("x"); };\n');
    const r = spawnSync(process.execPath, ["--import", preload, HOOK], { input: input("bash deploy/deploy.sh"), encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  });
});

describe("範囲は本番デプロイだけ（サブエージェントの判定を持ち込まない。PR #583 とのマージ後も）", () => {
  for (const cmd of ["git push origin HEAD", "git switch -c x", "git checkout -b x", "git reset --hard", "pnpm --filter foo test"]) {
    test(`agent_id つきの ${cmd} は何も出さない`, () => {
      assert.equal(decideCodexHookOutput(input(cmd, { agent_id: "a1", agent_type: "worker" })), null);
    });
  }
  test("agent_id つきでも本番デプロイは deny", () => {
    assert.equal(decideCodexHookOutput(input("bash deploy/deploy.sh", { agent_id: "a1" }))?.hookSpecificOutput.permissionDecision, "deny");
  });
  test("読む形の systemctl status・bash -n deploy.sh も deny（Codex では聞く道が無く、Claude Code の ask で通せた形も拒む。ADR-0032 の追記）", () => {
    for (const cmd of ["systemctl status tasuki", "systemctl --version", "bash -n deploy/deploy.sh"])
      assert.equal(decideCodexHookOutput(input(cmd))?.hookSpecificOutput.permissionDecision, "deny", cmd);
  });
});
