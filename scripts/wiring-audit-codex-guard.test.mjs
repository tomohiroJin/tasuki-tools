/**
 * audit-codex-guard.mjs が、実際に追跡下のファイルを見ていることの配線テスト（#578）。
 * 純粋関数の単体テストだけでは、main が `.codex/hooks.json` や入口の追跡を見なくなった状態を検知できない。
 * 追跡済みの一時の git リポジトリに監査と入口を複製して、実際に起動する。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { CODEX_HOOKS_PATH, CODEX_HOOK_SCRIPT, CODEX_HOOK_LIBS } from "./audit-codex-guard.mjs";

const REPO = new URL("../", import.meta.url).pathname;
const AUDIT = "scripts/audit-codex-guard.mjs";

function fixture(t, { hooksText } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wiring-codex-guard-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const files = [AUDIT, "scripts/lib/scan-targets.mjs", CODEX_HOOKS_PATH, CODEX_HOOK_SCRIPT, ...CODEX_HOOK_LIBS];
  for (const rel of files) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.copyFileSync(path.join(REPO, rel), path.join(dir, rel));
  }
  if (hooksText !== undefined) fs.writeFileSync(path.join(dir, CODEX_HOOKS_PATH), hooksText);
  const git = (...a) => execFileSync("git", a, { cwd: dir, stdio: "pipe", encoding: "utf8" });
  git("init", "-q");
  git("add", "-f", ".");
  return { dir, git, run: () => spawnSync(process.execPath, [path.join(dir, AUDIT)], { cwd: dir, encoding: "utf8" }) };
}

test("対照実行: 配線が揃っていれば緑", (t) => {
  const r = fixture(t).run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("実リポジトリの .codex/hooks.json を実際に読む（配線が外れていれば赤）", (t) => {
  const r = fixture(t, { hooksText: JSON.stringify({ hooks: { PreToolUse: [] } }) }).run();
  assert.notEqual(r.status, 0, r.stdout);
  assert.match(r.stderr, /\.codex\/hooks\.json: 期待する形/);
});

test("Codex の入口が追跡下から外れたら赤", (t) => {
  const f = fixture(t);
  f.git("rm", "--cached", "-q", CODEX_HOOK_SCRIPT);
  const r = f.run();
  assert.notEqual(r.status, 0, r.stdout);
  assert.match(r.stderr, /scripts\/codex-guard-hook\.mjs が追跡下にありません/);
});

test("入口が読み込む部品が追跡下から外れたら赤", (t) => {
  const f = fixture(t);
  f.git("rm", "--cached", "-q", "scripts/lib/agent-guard.mjs");
  const r = f.run();
  assert.notEqual(r.status, 0, r.stdout);
  assert.match(r.stderr, /scripts\/lib\/agent-guard\.mjs が追跡下にありません/);
});

test("hooks.json が追跡下に無ければ赤", (t) => {
  const f = fixture(t);
  f.git("rm", "--cached", "-q", CODEX_HOOKS_PATH);
  const r = f.run();
  assert.notEqual(r.status, 0, r.stdout);
  assert.match(r.stderr, /\.codex\/hooks\.json が追跡下にありません/);
});

test("入口が追跡下のまま作業ツリーから消えたら赤（main が作業ツリーを実際に見る）", (t) => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.dir, CODEX_HOOK_SCRIPT));
  const r = f.run();
  assert.notEqual(r.status, 0, r.stdout);
  assert.match(r.stderr, /scripts\/codex-guard-hook\.mjs が作業ツリーに通常のファイルとして在りません/);
});

test("入口が追跡下のまま作業ツリーでディレクトリに置き換わったら赤", (t) => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.dir, CODEX_HOOK_SCRIPT));
  fs.mkdirSync(path.join(f.dir, CODEX_HOOK_SCRIPT));
  const r = f.run();
  assert.notEqual(r.status, 0, r.stdout);
  assert.match(r.stderr, /scripts\/codex-guard-hook\.mjs が作業ツリーに通常のファイルとして在りません/);
});
