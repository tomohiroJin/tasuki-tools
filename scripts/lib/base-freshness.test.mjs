import { test } from "node:test";
import assert from "node:assert/strict";
import { checkBaseFreshness } from "./base-freshness.mjs";

/** `scripts/lib/base-freshness.mjs` の自己テスト（#508）。git は偽物を渡す。 */

const LOCAL = "1111111111111111111111111111111111111111";
const REMOTE = "2222222222222222222222222222222222222222";

function fakeGit({ remotes = "origin\n", local = LOCAL, remote = `${REMOTE}\trefs/heads/main\n`, lsRemoteFails = false } = {}) {
  const calls = [];
  const git = (args) => {
    calls.push(args.join(" "));
    if (args[0] === "remote") return remotes;
    if (args[0] === "rev-parse") {
      if (local === null) throw new Error("not found");
      return `${local}\n`;
    }
    if (args[0] === "ls-remote") {
      if (lsRemoteFails) throw new Error("fatal: unable to access 'https://example.invalid/'\nmore");
      return remote;
    }
    throw new Error(`unexpected: ${args.join(" ")}`);
  };
  return { git, calls };
}

test("リモートの枝と違えば古いと知らせ、fetch を促す", () => {
  const { git, calls } = fakeGit();
  const r = checkBaseFreshness("origin/main", git);
  assert.equal(r.state, "stale");
  assert.match(r.message, /^⚠ 基準 origin\/main（11111111）が、リモートの main（22222222）と違います/);
  assert.match(r.message, /git fetch origin/);
  assert.ok(calls.includes("ls-remote origin refs/heads/main"));
});

test("同じなら古くない", () => {
  const { git } = fakeGit({ remote: `${LOCAL}\trefs/heads/main\n` });
  assert.equal(checkBaseFreshness("origin/main", git).state, "fresh");
});

test("枝の名前に / を含む基準も、最初の / でリモートと枝に分ける", () => {
  const { git, calls } = fakeGit({ remote: `${LOCAL}\trefs/heads/feature/x\n` });
  assert.equal(checkBaseFreshness("origin/feature/x", git).state, "fresh");
  assert.ok(calls.includes("ls-remote origin refs/heads/feature/x"));
});

test("確かめられないときは、そう知らせる（古くないとは言わない）", () => {
  const failed = checkBaseFreshness("origin/main", fakeGit({ lsRemoteFails: true }).git);
  assert.equal(failed.state, "unknown");
  assert.match(failed.message, /^⚠ 基準 origin\/main がリモートと同じか確かめられませんでした.*unable to access/);
  assert.doesNotMatch(failed.message, /more/);
  const missing = checkBaseFreshness("origin/main", fakeGit({ remote: "" }).git);
  assert.equal(missing.state, "unknown");
  assert.match(missing.message, /^⚠ /); // check:fast は ⚠ の行を最後の一覧のあとに出し直す
  assert.doesNotMatch(checkBaseFreshness("origin/main", fakeGit({ remote: `${LOCAL}\trefs/heads/main\n` }).git).message, /⚠/);
});

test("リモートの追跡ブランチでない基準は見ない（ネットワークに出ない）", () => {
  for (const base of ["HEAD", "abc1234", "main", "upstream/main", "origin/HEAD", "origin/main~3", "origin/main^"]) {
    const { git, calls } = fakeGit();
    assert.equal(checkBaseFreshness(base, git), null, base);
    assert.ok(!calls.some((c) => c.startsWith("ls-remote")), base);
  }
  assert.equal(checkBaseFreshness("origin/main", fakeGit({ local: null }).git), null);
});
