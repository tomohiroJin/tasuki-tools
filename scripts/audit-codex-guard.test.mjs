import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CODEX_HOOK_COMMAND, checkCodexHooks } from "./audit-codex-guard.mjs";
import { EXPECTED_CODEX_HOOKS } from "./lib/codex-guard.mjs";

const clone = () => structuredClone(EXPECTED_CODEX_HOOKS);
const entry = (j) => j.hooks.PreToolUse[0].hooks[0];
const problems = (j) => checkCodexHooks(JSON.stringify(j));

describe("checkCodexHooks: .codex/hooks.json は期待する形と構造ごと完全一致のものだけ通す", () => {
  test("期待する形は通る。キーの順が違っても通る", () => {
    assert.deepEqual(problems(clone()), []);
    const reordered = { hooks: { PreToolUse: [{ hooks: [{ command: CODEX_HOOK_COMMAND, type: "command" }], matcher: "Bash" }] } };
    assert.deepEqual(problems(reordered), []);
  });

  test("実リポジトリの .codex/hooks.json は通る", () => {
    const text = fs.readFileSync(new URL("../.codex/hooks.json", import.meta.url), "utf8");
    assert.deepEqual(checkCodexHooks(text), []);
  });

  test("期待の形は起動の失敗を deny に倒す包みを含む", () => {
    assert.match(CODEX_HOOK_COMMAND, /^out="\$\(node .*codex-guard-hook\.mjs"\)" && printf '%s' "\$out" \|\| printf '%s' '\{"hookSpecificOutput":\{.*"permissionDecision":"deny"/);
  });

  test("JSON として読めなければ落とす", () => {
    assert.equal(checkCodexHooks("{ hooks: ").length, 1);
  });

  const broken = {
    "PreToolUse が空": (j) => (j.hooks.PreToolUse = []),
    "matcher が Bash でない": (j) => (j.hooks.PreToolUse[0].matcher = "Edit"),
    "matcher が * （広い）": (j) => (j.hooks.PreToolUse[0].matcher = "*"),
    "コマンドが違う": (j) => (entry(j).command = "node scripts/other.mjs"),

    "node の出力の後に非ゼロで終わると JSON が 2 つ連なる旧い包み（|| だけ）": (j) => (entry(j).command = entry(j).command.replace(/^out="\$\((.*?)\)" && printf '%s' "\$out" \|\|/, "$1 ||")),
    "Claude Code の入口（ask）へ置き換えた": (j) => (entry(j).command = 'node "${CLAUDE_PROJECT_DIR}/scripts/agent-guard-hook.mjs"'),
    "Claude Code の入口を併記した": (j) => j.hooks.PreToolUse[0].hooks.push({ type: "command", command: 'node "${CLAUDE_PROJECT_DIR}/scripts/agent-guard-hook.mjs"' }),
    "timeout: 0 を足した": (j) => (entry(j).timeout = 0),
    "async: true を足した": (j) => (entry(j).async = true),
    "allow を返す別の PreToolUse のフックを足した": (j) => j.hooks.PreToolUse.push({ matcher: "Bash", hooks: [{ type: "command", command: "echo allow" }] }),
    "SessionStart で規則を流すフックを足した": (j) => (j.hooks.SessionStart = [{ hooks: [{ type: "command", command: "cat docs/rules.md" }] }]),
    "PostToolUse を足した": (j) => (j.hooks.PostToolUse = []),
    "トップのキーを足した": (j) => (j.disabled = true),
  };
  for (const [name, mutate] of Object.entries(broken)) {
    test(`落とす: ${name}`, () => {
      const j = clone();
      mutate(j);
      assert.equal(problems(j).length, 1, name);
    });
  }
});
