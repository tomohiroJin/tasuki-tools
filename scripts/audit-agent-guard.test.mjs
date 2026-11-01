import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { HOOK_COMMAND, checkClaudeSettings, checkDeclarations } from "./audit-agent-guard.mjs";

const MATCHER = "Bash|Monitor";

function settings(overrides = {}) {
  return JSON.stringify({
    hooks: { PreToolUse: [{ matcher: MATCHER, hooks: [{ type: "command", command: HOOK_COMMAND }] }] },
    ...overrides,
  });
}

describe("checkClaudeSettings: .claude/settings.json がフックを配線しているか", () => {
  test("シェルを走らせる道具（Bash・Monitor）の PreToolUse に入口のスクリプトが配線されていれば問題なし", () => {
    assert.deepEqual(checkClaudeSettings(settings()), []);
  });

  test("matcher が Bash と Monitor を含む正規表現（Monitor|Bash|Edit）・* でも通る", () => {
    for (const matcher of ["Monitor|Bash|Edit", "*", ""]) {
      const text = JSON.stringify({ hooks: { PreToolUse: [{ matcher, hooks: [{ type: "command", command: HOOK_COMMAND }] }] } });
      assert.deepEqual(checkClaudeSettings(text), [], `matcher ${JSON.stringify(matcher)}`);
    }
  });

  test("JSON として読めなければ落とす", () => {
    assert.equal(checkClaudeSettings("{ hooks: ").length, 1);
  });

  test("PreToolUse が無い・空なら落とす", () => {
    assert.equal(checkClaudeSettings("{}").length, 1);
    assert.equal(checkClaudeSettings(JSON.stringify({ hooks: { PreToolUse: [] } })).length, 1);
  });

  test("matcher がシェルを走らせる道具のどれかに当たらなければ落とす（Bash だけ・Monitor だけ・Edit・Bashx）", () => {
    for (const matcher of ["Bash", "Monitor", "Edit", "Bashx", "Write|Edit"]) {
      const text = JSON.stringify({ hooks: { PreToolUse: [{ matcher, hooks: [{ type: "command", command: HOOK_COMMAND }] }] } });
      assert.equal(checkClaudeSettings(text).length, 1, `matcher ${matcher}`);
    }
  });

  test("コマンドが入口のスクリプトと違えば落とす（別のスクリプト・PostToolUse に置いた）", () => {
    const other = JSON.stringify({ hooks: { PreToolUse: [{ matcher: MATCHER, hooks: [{ type: "command", command: "node scripts/other.mjs" }] }] } });
    assert.equal(checkClaudeSettings(other).length, 1);
    const post = JSON.stringify({ hooks: { PostToolUse: [{ matcher: MATCHER, hooks: [{ type: "command", command: HOOK_COMMAND }] }] } });
    assert.equal(checkClaudeSettings(post).length, 1);
  });

  test("disableAllHooks を true にしていたら、配線があっても落とす", () => {
    assert.equal(checkClaudeSettings(settings({ disableAllHooks: true })).length, 1);
  });
});

describe("checkDeclarations: 止めるスクリプトの宣言と deploy/ の実体", () => {
  const decls = [
    { id: "deploy-script", script: "deploy/deploy.sh" },
    { id: "systemctl", program: "systemctl" },
  ];

  test("宣言したスクリプトが追跡下にあり、deploy/ の実行するスクリプトが全部宣言されていれば問題なし", () => {
    assert.deepEqual(checkDeclarations(decls, ["deploy/deploy.sh", "deploy/lib/common.sh"]), []);
  });

  test("deploy/ に宣言の無いスクリプトを足したら落とす（lib/ の読み込まれる部品は除く）", () => {
    const problems = checkDeclarations(decls, ["deploy/deploy.sh", "deploy/lib/common.sh", "deploy/rollback.sh"]);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /deploy\/rollback\.sh/);
  });

  test("宣言したスクリプトが追跡下に無ければ落とす（移した・消した）", () => {
    const problems = checkDeclarations(decls, ["deploy/lib/common.sh"]);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /deploy\/deploy\.sh/);
  });
});

describe("リポジトリの実物", () => {
  test("追跡下の .claude/settings.json がフックを配線している", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    assert.deepEqual(checkClaudeSettings(fs.readFileSync(path.join(root, ".claude/settings.json"), "utf8")), []);
  });
});
