import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CODEX_HOOK_COMMAND, checkCodexHooks } from "./audit-codex-guard.mjs";

function hooks(overrides = {}, command = CODEX_HOOK_COMMAND, matcher = "Bash") {
  return JSON.stringify({ hooks: { PreToolUse: [{ matcher, hooks: [{ type: "command", command }] }] }, ...overrides });
}

test("コマンドは起動の失敗を deny に倒す包み（入口が失敗したときだけ || の後ろが走る）", () => {
  assert.match(CODEX_HOOK_COMMAND, /scripts\/codex-guard-hook\.mjs" \|\| printf '%s' '\{"hookSpecificOutput":\{.*"permissionDecision":"deny"/);
});

describe("checkCodexHooks: .codex/hooks.json が Codex の入口へ配線されているか", () => {
  test("Bash の PreToolUse に Codex の入口があれば問題なし", () => {
    assert.deepEqual(checkCodexHooks(hooks()), []);
  });

  test("matcher が * や空・Bash を含む正規表現でも通る", () => {
    for (const m of ["*", "", "Bash|apply_patch"]) assert.deepEqual(checkCodexHooks(hooks({}, CODEX_HOOK_COMMAND, m)), [], m);
  });

  test("JSON として読めなければ落とす", () => {
    assert.equal(checkCodexHooks("{ hooks: ").length, 1);
  });

  test("PreToolUse が無い・空なら落とす", () => {
    assert.equal(checkCodexHooks("{}").length, 1);
    assert.equal(checkCodexHooks(JSON.stringify({ hooks: { PreToolUse: [] } })).length, 1);
  });

  test("matcher が Bash に当たらなければ落とす", () => {
    for (const m of ["Edit", "Bashx", "apply_patch"]) assert.equal(checkCodexHooks(hooks({}, CODEX_HOOK_COMMAND, m)).length, 1, m);
  });

  test("Claude Code の入口（ask を返す）を配線していたら落とす（Codex では止まらない）", () => {
    assert.equal(checkCodexHooks(hooks({}, 'node "${CLAUDE_PROJECT_DIR}/scripts/agent-guard-hook.mjs"')).length, 1);
  });

  test("コマンドが違う・PostToolUse に置いたら落とす", () => {
    assert.equal(checkCodexHooks(hooks({}, "node scripts/other.mjs")).length, 1);
    const post = JSON.stringify({ hooks: { PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: CODEX_HOOK_COMMAND }] }] } });
    assert.equal(checkCodexHooks(post).length, 1);
  });
});
