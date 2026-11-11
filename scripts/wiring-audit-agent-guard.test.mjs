/**
 * audit-agent-guard.mjs が、入口の import をたどった部品の追跡を見ていることの配線テスト（#578）。
 * 純粋関数の単体テストだけでは、main が `collectEntryDependencies` を呼ばなくなった状態を検知できない。
 * 追跡下のファイルだけを持つ一時の git リポジトリに監査と入口の部品を複製して、実際に起動する。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { collectEntryDependencies, HOOK_SCRIPT } from "./audit-agent-guard.mjs";
import { GUARDED_COMMANDS } from "./lib/agent-guard.mjs";

const REPO = new URL("../", import.meta.url).pathname;
const read = (rel) => {
  try {
    return fs.readFileSync(path.join(REPO, rel), "utf8");
  } catch {
    return null;
  }
};

/** 監査が見るファイルをすべて複製した一時リポジトリ（追跡済み）。 */
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wiring-agent-guard-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const files = new Set([
    ".claude/settings.json",
    "scripts/audit-agent-guard.mjs",
    ...collectEntryDependencies("scripts/audit-agent-guard.mjs", read),
    HOOK_SCRIPT,
    ...collectEntryDependencies(HOOK_SCRIPT, read),
  ]);
  for (const rel of files) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.copyFileSync(path.join(REPO, rel), path.join(dir, rel));
  }
  for (const g of GUARDED_COMMANDS.filter((d) => d.script)) {
    fs.mkdirSync(path.dirname(path.join(dir, g.script)), { recursive: true });
    fs.writeFileSync(path.join(dir, g.script), "#!/bin/sh\n");
  }
  const git = (...a) => execFileSync("git", a, { cwd: dir, stdio: "pipe", encoding: "utf8" });
  git("init", "-q");
  git("add", "-f", ".");
  return { dir, git, run: () => spawnSync(process.execPath, [path.join(dir, "scripts/audit-agent-guard.mjs")], { cwd: dir, encoding: "utf8" }) };
}

test("対照実行: 入口の部品がすべて追跡下なら緑", (t) => {
  const r = fixture(t).run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("入口が import でたどる部品（先行 PR の確認の部品に限らない）が追跡下から外れたら赤", (t) => {
  const f = fixture(t);
  f.git("rm", "--cached", "-q", "scripts/lib/closing-keywords.mjs");
  const r = f.run();
  assert.notEqual(r.status, 0, r.stdout);
  assert.match(r.stderr, /scripts\/lib\/closing-keywords\.mjs が追跡下にありません/);
});
