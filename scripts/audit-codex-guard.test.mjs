import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CODEX_HOOK_COMMAND, checkCodexHooks } from "./audit-codex-guard.mjs";
import { EXPECTED_CODEX_HOOKS, ROOT_FAILURE_OUTPUT } from "./lib/codex-guard.mjs";
import { spawnSync } from "node:child_process";

const clone = () => structuredClone(EXPECTED_CODEX_HOOKS);
const entry = (j) => j.hooks.PreToolUse[0].hooks[0];
/** .codex/hooks.json の書式（2 字下げ・末尾に改行）。 */
const fmt = (j) => `${JSON.stringify(j, null, 2)}\n`;
const problems = (j) => checkCodexHooks(fmt(j));

describe("checkCodexHooks: .codex/hooks.json は正準の文字列と文字列ごと比べて一致するものだけ通す", () => {
  test("期待する形は通る", () => {
    assert.deepEqual(problems(clone()), []);
  });

  test("キーが重複したファイルは落とす（JSON.parse は後ろのキーを採るので、構造の比較だけでは通ってしまう）", () => {
    const text = fmt(clone());
    const dup = text.replace('{\n  "hooks"', '{\n  "hooks": { "PreToolUse": [] },\n  "hooks"');
    assert.notEqual(dup, text);
    assert.equal(checkCodexHooks(dup).length, 1);
    assert.equal(checkCodexHooks(text.replace('"type": "command"', '"type": "command", "type": "command"')).length, 1);
  });

  test("書式が違う（キーの順・字下げ・末尾の改行なし）ものも落とす（文字列ごとの比較）", () => {
    assert.equal(checkCodexHooks(JSON.stringify(clone())).length, 1);
    assert.equal(checkCodexHooks(fmt(clone()).trimEnd()).length, 1);
  });

  test("実リポジトリの .codex/hooks.json は通る", () => {
    const text = fs.readFileSync(new URL("../.codex/hooks.json", import.meta.url), "utf8");
    assert.deepEqual(checkCodexHooks(text), []);
  });

  test("期待の形は起動の失敗を deny に倒す包みを含む", () => {
    assert.match(CODEX_HOOK_COMMAND, /out="\$\(node .*codex-guard-hook\.mjs"\)" && printf '%s' "\$out" \|\| printf '%s' '\{"hookSpecificOutput":\{.*"permissionDecision":"deny"/);
  });

  test("JSON として読めなければ落とす", () => {
    assert.equal(checkCodexHooks("{ hooks: ").length, 1);
  });

  const broken = {
    "PreToolUse が空": (j) => (j.hooks.PreToolUse = []),
    "matcher が Bash でない": (j) => (j.hooks.PreToolUse[0].matcher = "Edit"),
    "matcher が * （広い）": (j) => (j.hooks.PreToolUse[0].matcher = "*"),
    "コマンドが違う": (j) => (entry(j).command = "node scripts/other.mjs"),

    "node の出力の後に非ゼロで終わると JSON が 2 つ連なる旧い包み（|| だけ）": (j) => (entry(j).command = entry(j).command.replace(/out="\$\((node [^)]*)\)" && printf '%s' "\$out" \|\|/, "$1 ||")),
    "入口の無い版の許し（exit 0）を外した": (j) => (entry(j).command = entry(j).command.replace(/\[ -f [^;]*; /, "")),
    "ルートが引けないときの deny を外した": (j) => (entry(j).command = entry(j).command.replace(` || { printf '%s' '${ROOT_FAILURE_OUTPUT}'; exit 0; }`, "")),
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
      // コマンドを書き換えた case は、意図した形で壊れている（変わっていて、シェルの構文として読める）ことを確かめる
      const cmd = j.hooks.PreToolUse?.[0]?.hooks?.[0]?.command;
      if (cmd !== undefined && cmd !== CODEX_HOOK_COMMAND) {
        assert.equal(spawnSync("sh", ["-n", "-c", cmd]).status, 0, `${name}: 壊したコマンドの構文が壊れている`);
      }
    });
  }
});
