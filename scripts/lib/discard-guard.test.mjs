import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DISCARD_COMMANDS, discardTargets, decideDiscardOutput, defaultIsDirty } from "./discard-guard.mjs";

const targets = (c, exists = () => false) => discardTargets(c, { exists });

describe("discardTargets: 未コミットの変更を消しうる git の呼び方", () => {
  test("宣言: id は重複せず、program が git", () => {
    assert.equal(new Set(DISCARD_COMMANDS.map((d) => d.id)).size, DISCARD_COMMANDS.length);
    assert.ok(DISCARD_COMMANDS.every((d) => d.program === "git"));
  });

  test("checkout -- <path> は path。-- の後だけを見る", () => {
    assert.deepEqual(targets("git checkout -- a.ts b.ts"), [{ kind: "paths", paths: ["a.ts", "b.ts"] }]);
    assert.deepEqual(targets("git checkout HEAD -- a.ts"), [{ kind: "paths", paths: ["a.ts"] }]);
    assert.deepEqual(targets("git checkout origin/main -- a.test.mjs"), [{ kind: "paths", paths: ["a.test.mjs"] }]);
  });

  test("checkout の -- 無しは、実在するパスのときだけ path（枝の切り替えは対象外）。. は全部", () => {
    assert.deepEqual(targets("git checkout main"), []);
    assert.deepEqual(targets("git checkout src/a.ts", (p) => p === "src/a.ts"), [{ kind: "paths", paths: ["src/a.ts"] }]);
    assert.deepEqual(targets("git checkout .", () => true), [{ kind: "paths", paths: ["."] }]);
    assert.deepEqual(targets("git checkout -b new"), []);
  });

  test("checkout -f / --force は作業ツリー全体を捨てる", () => {
    assert.deepEqual(targets("git checkout -f main"), [{ kind: "all" }]);
    assert.deepEqual(targets("git checkout --force main"), [{ kind: "all" }]);
  });

  test("restore <path> は path。--staged だけは対象外。--worktree 付きは対象。-s の値は path でない", () => {
    assert.deepEqual(targets("git restore a.ts"), [{ kind: "paths", paths: ["a.ts"] }]);
    assert.deepEqual(targets("git restore -- a.ts"), [{ kind: "paths", paths: ["a.ts"] }]);
    assert.deepEqual(targets("git restore --source=HEAD~1 a.ts"), [{ kind: "paths", paths: ["a.ts"] }]);
    assert.deepEqual(targets("git restore -s HEAD~1 a.ts"), [{ kind: "paths", paths: ["a.ts"] }]);
    assert.deepEqual(targets("git restore --staged a.ts"), []);
    assert.deepEqual(targets("git restore -S -- a.ts"), []);
    assert.deepEqual(targets("git restore --staged --worktree a.ts"), [{ kind: "paths", paths: ["a.ts"] }]);
    assert.deepEqual(targets("git restore ."), [{ kind: "paths", paths: ["."] }]);
  });

  test("stash は、保存する形（無印・push・save・-u）だけ。list・show・pop・apply・drop は対象外", () => {
    assert.deepEqual(targets("git stash"), [{ kind: "all" }]);
    assert.deepEqual(targets("git stash push -m x"), [{ kind: "all" }]);
    assert.deepEqual(targets("git stash save wip"), [{ kind: "all" }]);
    assert.deepEqual(targets("git stash -u"), [{ kind: "all", untracked: true }]);
    assert.deepEqual(targets("git stash push -- a.ts"), [{ kind: "paths", paths: ["a.ts"] }]);
    for (const c of ["git stash list", "git stash show -p", "git stash pop", "git stash apply", "git stash drop", "git stash clear"]) {
      assert.deepEqual(targets(c), [], c);
    }
  });

  test("すり抜け: 長いオプションの省略形（git は一意に決まれば受け付ける）", () => {
    for (const o of ["--st", "--sta", "--stag", "--staged"]) assert.deepEqual(targets(`git restore ${o} a.ts`), [], o);
    assert.deepEqual(targets("git restore --stag --work a.ts"), [{ kind: "paths", paths: ["a.ts"] }]);
    assert.deepEqual(targets("git restore -SW a.ts"), [{ kind: "paths", paths: ["a.ts"] }]);
    assert.deepEqual(targets("git restore -S a.ts"), []);
    for (const o of ["--sour", "--source"]) {
      assert.deepEqual(targets(`git restore ${o} HEAD~1 a.ts`), [{ kind: "paths", paths: ["a.ts"] }], o);
      assert.deepEqual(targets(`git restore ${o}=HEAD~1 a.ts`), [{ kind: "paths", paths: ["a.ts"] }], o);
    }
    assert.deepEqual(targets("git restore -sHEAD~1 a.ts"), [{ kind: "paths", paths: ["a.ts"] }]);
    assert.deepEqual(targets("git restore --pathspec-from-file=list.txt"), [{ kind: "all" }]);
    assert.deepEqual(targets("git restore --pathspec-from-file list.txt"), [{ kind: "all" }]);
    for (const o of ["--forc", "--force", "--f"]) assert.deepEqual(targets(`git checkout ${o} main`), [{ kind: "all" }], o);
    assert.deepEqual(targets("git checkout -fq main"), [{ kind: "all" }]);
    for (const o of ["--inc", "--include-untracked", "-u"]) assert.deepEqual(targets(`git stash push ${o}`), [{ kind: "all", untracked: true }], o);
    for (const o of ["--all", "--al", "-a"]) assert.deepEqual(targets(`git stash ${o}`), [{ kind: "all", untracked: true }], o);
  });

  test("すり抜け: 値を別の語に取るグローバルオプションを飛ばして下位コマンドを読む", () => {
    for (const g of ["--config-env a.b=HOME", "--config-env=a.b=HOME", "--attr-source HEAD", "-c core.x=y"]) {
      assert.deepEqual(targets(`git ${g} stash`), [{ kind: "all" }], g);
      assert.deepEqual(targets(`git ${g} restore a.ts`), [{ kind: "paths", paths: ["a.ts"] }], g);
    }
  });

  test("-C 付きは別の場所を指す（elsewhere）。読み取りコマンド内の文字列には当てない", () => {
    assert.deepEqual(targets("git -C ../wt checkout -- a.ts"), [{ kind: "paths", paths: ["a.ts"], elsewhere: true }]);
    assert.deepEqual(targets("git --git-dir=x stash"), [{ kind: "all", elsewhere: true }]);
    for (const c of ["grep 'git stash' docs/a.md", "echo git restore a.ts", "git status", "git diff -- a.ts", "git log -- a.ts", "cat checkout.txt"]) {
      assert.deepEqual(targets(c), [], c);
    }
  });
});

describe("decideDiscardOutput", () => {
  const mk = (command, extra = {}) => JSON.stringify({ tool_name: "Bash", cwd: "/w", tool_input: { command }, ...extra });
  const dirtyIf = (yes) => async () => yes;

  test("対象に未コミットの変更があれば ask。理由に対象と、コミットか退避の案内を書く", async () => {
    const out = await decideDiscardOutput(mk("git checkout -- a.ts"), { exists: () => false, isDirty: dirtyIf("yes") });
    assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /a\.ts/);
  });

  test("変更が無ければ通す（別の版から取る手順を壊さない）", async () => {
    assert.equal(await decideDiscardOutput(mk("git checkout origin/main -- a.test.mjs"), { exists: () => false, isDirty: dirtyIf("no") }), null);
    assert.equal(await decideDiscardOutput(mk("git stash"), { isDirty: dirtyIf("no") }), null);
  });

  test("確かめられなかった（unknown）ときは ask に倒す", async () => {
    const out = await decideDiscardOutput(mk("git restore a.ts"), { exists: () => false, isDirty: dirtyIf("unknown") });
    assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
  });

  test("別の場所（-C）を指すときは、そこを確かめられないので ask に倒す", async () => {
    const out = await decideDiscardOutput(mk("git -C ../wt restore a.ts"), { exists: () => false, isDirty: dirtyIf("no") });
    assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
  });

  test("対象でないコマンド・シェル以外の道具は null。isDirty を呼ばない", async () => {
    const never = async () => { throw new Error("呼ばれた"); };
    assert.equal(await decideDiscardOutput(mk("git status"), { isDirty: never }), null);
    assert.equal(await decideDiscardOutput(mk("git restore --staged a.ts"), { isDirty: never }), null);
    assert.equal(await decideDiscardOutput(JSON.stringify({ tool_name: "Read", tool_input: {} }), { isDirty: never }), null);
    assert.equal(await decideDiscardOutput("not json", { isDirty: never }), null);
  });

  test("isDirty には cwd と対象を渡す", async () => {
    const seen = [];
    await decideDiscardOutput(mk("git checkout -- a.ts"), { exists: () => false, isDirty: async (...a) => (seen.push(a), "no") });
    assert.deepEqual(seen, [["/w", { kind: "paths", paths: ["a.ts"] }]]);
  });
});

describe("defaultIsDirty: 実際の git で", () => {
  const git = (cwd, ...a) => execFileSync("git", a, { cwd, stdio: "pipe", encoding: "utf8" });
  function repo(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "discard-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    git(dir, "init", "-q");
    git(dir, "config", "user.email", "t@example.com");
    git(dir, "config", "user.name", "t");
    fs.writeFileSync(path.join(dir, "a.ts"), "1");
    fs.writeFileSync(path.join(dir, "b.ts"), "1");
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "init");
    return dir;
  }

  test("対象のパスだけを見る。きれいなら no、触ったパスなら yes、全体なら yes", async (t) => {
    const dir = repo(t);
    assert.equal(await defaultIsDirty(dir, { kind: "paths", paths: ["a.ts"] }), "no");
    assert.equal(await defaultIsDirty(dir, { kind: "all" }), "no");
    fs.writeFileSync(path.join(dir, "a.ts"), "2");
    assert.equal(await defaultIsDirty(dir, { kind: "paths", paths: ["a.ts"] }), "yes");
    assert.equal(await defaultIsDirty(dir, { kind: "paths", paths: ["b.ts"] }), "no");
    assert.equal(await defaultIsDirty(dir, { kind: "paths", paths: ["."] }), "yes");
    assert.equal(await defaultIsDirty(dir, { kind: "all" }), "yes");
  });

  test("追跡していない新規ファイルは、-u の stash だけが対象", async (t) => {
    const dir = repo(t);
    fs.writeFileSync(path.join(dir, "new.ts"), "x");
    assert.equal(await defaultIsDirty(dir, { kind: "all" }), "no");
    assert.equal(await defaultIsDirty(dir, { kind: "all", untracked: true }), "yes");
  });

  test("git の作業ツリーでない場所は no（消すものが無い）。無い場所は unknown", async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "discard-nogit-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    assert.equal(await defaultIsDirty(dir, { kind: "all" }), "no");
    assert.equal(await defaultIsDirty(path.join(dir, "missing"), { kind: "all" }), "unknown");
  });
});
