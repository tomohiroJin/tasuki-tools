import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { filterPatterns, patternMatchesAny, decidePnpmFilterOutput, readWorkspaceNames } from "./pnpm-filter-guard.mjs";

const NAMES = ["@tasuki/sync", "@tasuki/sync-client", "@tasuki/ui", "@tasuki/timer-web", "tasuki"];

describe("filterPatterns: pnpm のコマンドから --filter の値を取る", () => {
  test("--filter X・--filter=X・-F X・--filter-prod X を取る。pnpm 以外・-- の後ろは見ない", () => {
    assert.deepEqual(filterPatterns("pnpm --filter @tasuki/sync test"), ["@tasuki/sync"]);
    assert.deepEqual(filterPatterns("pnpm --filter=sync test"), ["sync"]);
    assert.deepEqual(filterPatterns("pnpm -F sync test"), ["sync"]);
    assert.deepEqual(filterPatterns("pnpm --filter-prod sync build"), ["sync"]);
    assert.deepEqual(filterPatterns("pnpm -Fsync test"), ["sync"]);
    assert.deepEqual(filterPatterns("pnpm -F=sync test"), ["sync"]);
    assert.deepEqual(filterPatterns("pnpm --filter 'a b' test"), ["a b"]);
    assert.deepEqual(filterPatterns("pnpm -r --filter a --filter b test"), ["a", "b"]);
    assert.deepEqual(filterPatterns("cd x && pnpm --filter a build; pnpm --filter b test"), ["a", "b"]);
    assert.deepEqual(filterPatterns("CI=1 pnpm --filter a test"), ["a"]);
    assert.deepEqual(filterPatterns("pnpm test -- --filter nope"), []);
    assert.deepEqual(filterPatterns("turbo --filter a build"), []);
    assert.deepEqual(filterPatterns("grep -- '--filter x' README.md"), []);
    assert.deepEqual(filterPatterns("echo pnpm --filter a"), []);
    assert.deepEqual(filterPatterns("pnpm test"), []);
  });
});

describe("patternMatchesAny: pnpm の名前の照合", () => {
  test("完全一致・スコープ無しの名前は @*/名前 にも当たる（pnpm 11 で確認）", () => {
    assert.ok(patternMatchesAny("@tasuki/sync", NAMES));
    assert.ok(patternMatchesAny("sync", NAMES));
    assert.ok(patternMatchesAny("tasuki", NAMES));
  });
  test("実在しない名前は当たらない（@tasuki/tasuki-sync は実在しない）", () => {
    assert.equal(patternMatchesAny("@tasuki/tasuki-sync", NAMES), false);
    assert.equal(patternMatchesAny("tasuki-sync", NAMES), false);
    assert.equal(patternMatchesAny("syn", NAMES), false);
  });
  test("glob（* は全文に対して）・依存の印（... と ^）・除外（!）・パスと git の参照は名前でないので当てに行かない", () => {
    assert.ok(patternMatchesAny("@tasuki/*", NAMES));
    assert.ok(patternMatchesAny("*sync", NAMES));
    assert.equal(patternMatchesAny("sync*", NAMES), false);
    assert.equal(patternMatchesAny("@tasuki/nope*", NAMES), false);
    assert.ok(patternMatchesAny("...@tasuki/sync", NAMES));
    assert.ok(patternMatchesAny("@tasuki/sync^...", NAMES));
    assert.ok(patternMatchesAny("...^@tasuki/sync", NAMES));
    assert.equal(patternMatchesAny("...^@tasuki/nope", NAMES), false);
    assert.equal(patternMatchesAny("...@tasuki/nope", NAMES), false);
    for (const p of ["!@tasuki/nope", "./packages/ui", "../x", "{packages/ui}", "[origin/main]", "...[origin/main]"]) {
      assert.ok(patternMatchesAny(p, NAMES), p);
    }
  });
});

describe("decidePnpmFilterOutput", () => {
  const mk = (command, extra = {}) => JSON.stringify({ tool_name: "Bash", cwd: "/w", tool_input: { command }, ...extra });
  test("どのパッケージにも当たらない --filter は ask。理由に値と近い名前を書く", () => {
    const out = decidePnpmFilterOutput(mk("pnpm --filter @tasuki/tasuki-sync test"), { names: NAMES });
    assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /@tasuki\/tasuki-sync/);
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /@tasuki\/sync/);
  });
  test("当たる・--filter が無い・pnpm でないときは null。名前の一覧を引かない", () => {
    assert.equal(decidePnpmFilterOutput(mk("pnpm --filter @tasuki/sync test"), { names: NAMES }), null);
    const never = () => { throw new Error("呼ばれた"); };
    assert.equal(decidePnpmFilterOutput(mk("pnpm test"), { names: never }), null);
    assert.equal(decidePnpmFilterOutput(mk("git status"), { names: never }), null);
    assert.equal(decidePnpmFilterOutput(JSON.stringify({ tool_name: "Read", tool_input: {} }), { names: never }), null);
    assert.equal(decidePnpmFilterOutput("not json", { names: never }), null);
  });
  test("名前の一覧を引けない（workspace が見つからない）ときは通す（pnpm 自身が失敗する）", () => {
    assert.equal(decidePnpmFilterOutput(mk("pnpm --filter x test"), { names: () => null }), null);
  });
  test("複数の --filter は、当たらないものだけを理由に書く", () => {
    const out = decidePnpmFilterOutput(mk("pnpm --filter @tasuki/ui --filter nope test"), { names: NAMES });
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /nope/);
    assert.doesNotMatch(out.hookSpecificOutput.permissionDecisionReason, /指定「@tasuki\/ui」/);
  });
});

describe("readWorkspaceNames: 実際の workspace から名前を読む", () => {
  test("pnpm-workspace.yaml の packages の glob を展開して package.json の name を集める。上の階層から探す", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ws-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n  - "apps/*"\n  - "e2e"\n\nallowBuilds:\n  x: true\n');
    fs.writeFileSync(path.join(root, "package.json"), '{"name":"root"}');
    for (const [d, n] of [["packages/a", "@s/a"], ["apps/b", "@s/b"], ["e2e", "@s/e2e"], ["other/c", "@s/c"]]) {
      fs.mkdirSync(path.join(root, d), { recursive: true });
      fs.writeFileSync(path.join(root, d, "package.json"), JSON.stringify({ name: n }));
    }
    fs.mkdirSync(path.join(root, "packages/no-pkg"), { recursive: true });
    assert.deepEqual(readWorkspaceNames(path.join(root, "packages/a")).sort(), ["@s/a", "@s/b", "@s/e2e", "root"]);
    // 行頭に置いた配列（`packages:` と同じ桁の `- "apps/*"`）も節の中
    fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), 'packages:\n- "packages/*"\n- "apps/*"\n- "e2e"\n\nallowBuilds:\n  x: true\n');
    assert.deepEqual(readWorkspaceNames(root).sort(), ["@s/a", "@s/b", "@s/e2e", "root"]);
    // 読めない glob（** や除外）があるときは、名前の一覧を言い切れないので null（pnpm に任せる）
    fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), 'packages:\n  - "packages/**"\n');
    assert.equal(readWorkspaceNames(root), null);
    fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n  - "!packages/x"\n');
    assert.equal(readWorkspaceNames(root), null);
    assert.equal(readWorkspaceNames(os.tmpdir() + "/definitely-not-a-workspace-xyz"), null);
  });
});
