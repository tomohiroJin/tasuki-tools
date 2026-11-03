import { test } from "node:test";
import assert from "node:assert/strict";
import {
  issueNumberFromBranch,
  issueNumbersFromTitle,
  findPriorWork,
  checkPriorWork,
  describePriorWork,
  SEARCH_LIMIT,
} from "./prior-work.mjs";

/** `scripts/lib/prior-work.mjs` の自己テスト（#504）。gh と git は偽物を渡し、ネットワークを叩かない。 */

const pr = (number, title, body = "", state = "OPEN", headRefName = `x/${number}`) => ({ number, title, body, state, headRefName });

function fakes({ prs = [], heads = [], ghFails = false, gitFails = false } = {}) {
  const calls = [];
  const gh = (args) => {
    calls.push(`gh ${args.join(" ")}`);
    if (ghFails) throw new Error("gh: not logged in\nmore");
    return JSON.stringify(prs);
  };
  const git = (args) => {
    calls.push(`git ${args.join(" ")}`);
    if (gitFails) throw new Error("fatal: unable to access");
    return heads.map((h) => `1111111111111111111111111111111111111111\trefs/heads/${h}\n`).join("");
  };
  return { gh, git, calls };
}

test("ブランチ名の番号は <type>/<番号>- と issue-<番号> の 2 つの形だけ", async () => {
  assert.equal(issueNumberFromBranch("docs/504-review-and-prior-pr-rules"), 504);
  assert.equal(issueNumberFromBranch("feature/508-check-fast-signals"), 508);
  assert.equal(issueNumberFromBranch("docs/issue-505-procedures"), 505);
  assert.equal(issueNumberFromBranch("fix/486"), 486);
});

test("ISSUE でない数字・番号の無い名前は null（実際の枝名を含む）", async () => {
  for (const b of ["main", "HEAD", "feature/v2-room", "fix/abc504def", "fix/504def", "chore/node-26-upgrade", "docs/2026-11-03-retro", "fix/pnpm-11-5", "renovate/non-breaking", "claude/trial-491-cloud-480", "504-foo", "claude/cool-ride-c0dfr1"]) {
    assert.equal(issueNumberFromBranch(b), null, b);
  }
});

test("題から #番号 をすべて取る", async () => {
  assert.deepEqual(issueNumbersFromTitle("docs: 規則を足す（#504）と #491"), [504, 491]);
  assert.deepEqual(issueNumbersFromTitle("題に番号なし"), []);
  assert.deepEqual(issueNumbersFromTitle("#504 と #504"), [504]);
});

test("PR は題か本文の完全一致だけを拾い、番号が前方一致の別 ISSUE と本文中の数字は拾わない", async () => {
  const { gh, git } = fakes({
    prs: [
      pr(501, "docs: 試し（#491）", "#504〜#509 を出す"),
      pr(190, "docs: 件数をやめる（#187）", "テスト総数は 2,480 件"),
      pr(600, "feat: 別件（#5040）"),
      pr(700, "feat: 別件", "see #50"),
    ],
  });
  const r = await findPriorWork(504, { gh, git, ownBranch: "docs/504-x" });
  assert.deepEqual(r.prs.map((p) => p.number), [501]);
  assert.equal(r.state, "found");
});

test("自分の枝とその PR は除く", async () => {
  const { gh, git } = fakes({
    prs: [pr(900, "docs: 自分（#504）", "", "OPEN", "docs/504-x"), pr(501, "他（#504）")],
    heads: ["docs/504-x", "docs/504-other"],
  });
  const r = await findPriorWork(504, { gh, git, ownBranch: "docs/504-x" });
  assert.deepEqual(r.prs.map((p) => p.number), [501]);
  assert.deepEqual(r.branches, ["docs/504-other"]);
});

test("枝は番号の完全一致（5040・1504 は拾わず、<type>/504- と issue-504 は拾う）", async () => {
  const { gh, git } = fakes({ heads: ["a/5040-x", "a/1504-x", "a/b-504", "a/504-x", "a/issue-504-y", "a/504"] });
  const r = await findPriorWork(504, { gh, git, ownBranch: "none" });
  assert.deepEqual(r.branches, ["a/504-x", "a/issue-504-y", "a/504"]);
});

test("何も無ければ none。検索に当たった件数を持つ", async () => {
  const { gh, git } = fakes({ prs: [pr(1, "無関係（#2）")] });
  const r = await findPriorWork(504, { gh, git, ownBranch: "x" });
  assert.equal(r.state, "none");
  assert.equal(r.total, 1);
  assert.equal(r.truncated, false);
});

test("検索が上限に当たったら切れた可能性として扱う", async () => {
  const many = Array.from({ length: SEARCH_LIMIT }, (_, i) => pr(i + 1, "無関係"));
  const { gh, git } = fakes({ prs: many });
  const r = await findPriorWork(4, { gh, git, ownBranch: "x" });
  assert.equal(r.truncated, true);
});

test("gh の呼び出しは fetch せず、上限と検索語を指定し、枝は ls-remote を使う", async () => {
  const { gh, git, calls } = fakes();
  await findPriorWork(480, { gh, git, ownBranch: "x" });
  assert.ok(calls.some((c) => c.startsWith("gh pr list --state all --limit 1000 --search #480 in:title,body --json")));
  assert.ok(calls.includes("git ls-remote --heads origin"));
  assert.ok(!calls.some((c) => c.includes("fetch")));
});

test("gh が失敗しても枝の結果は残し、PR は確かめられなかったと言う", async () => {
  const { gh, git } = fakes({ ghFails: true, heads: ["docs/504-other"] });
  const r = await findPriorWork(504, { gh, git, ownBranch: "x" });
  assert.equal(r.state, "found");
  assert.match(r.errors[0], /^gh pr list: gh: not logged in$/);
});

test("片方だけ失敗して何も見つからないときも unknown（none と区別する。確かめていない側が残る）", async () => {
  const { gh, git } = fakes({ ghFails: true });
  assert.equal((await findPriorWork(504, { gh, git, ownBranch: "x" })).state, "unknown");
  const b = fakes({ gitFails: true });
  assert.equal((await findPriorWork(504, { gh: b.gh, git: b.git, ownBranch: "x" })).state, "unknown");
});

test("両方失敗なら unknown", async () => {
  const { gh, git } = fakes({ ghFails: true, gitFails: true });
  const r = await findPriorWork(504, { gh, git, ownBranch: "x" });
  assert.equal(r.state, "unknown");
  assert.equal(r.errors.length, 2);
});

test("gh の出力が JSON でなければ失敗として扱う", async () => {
  const git = () => "";
  const r = await findPriorWork(504, { gh: () => "not json", git, ownBranch: "x" });
  assert.match(r.errors[0], /^gh pr list:/);
});

test("checkPriorWork: 番号の無いブランチは ⚠ なしの案内 1 行（未実行の ⚠ ではない）", async () => {
  const { gh, git, calls } = fakes();
  const r = await checkPriorWork({ branch: "renovate/non-breaking", gh, git });
  assert.equal(r.state, "no-number");
  assert.equal(r.lines.length, 1);
  assert.match(r.lines[0], /^同じ ISSUE の先行 PR の確認は省きました（ブランチ名 renovate\/non-breaking に ISSUE 番号がありません）$/);
  assert.equal(calls.length, 0);
});

test("checkPriorWork: 見つかれば人へ伝えるよう促す行を出す", async () => {
  const { gh, git } = fakes({ prs: [pr(501, "docs: 試し（#491）", "#504〜", "MERGED")], heads: ["docs/504-other"] });
  const r = await checkPriorWork({ branch: "docs/504-x", gh, git });
  assert.equal(r.state, "found");
  assert.match(r.lines[0], /^⚠ 同じ ISSUE #504 の他の PR・枝があります/);
  assert.ok(r.lines.some((l) => l.includes("PR #501（マージ済み）docs: 試し（#491）")));
  assert.ok(r.lines.some((l) => l.includes("枝 docs/504-other")));
  assert.ok(r.lines.some((l) => l.includes("続ける前に人へ伝えてください")));
});

test("checkPriorWork: 無ければ ⚠ なしで件数を出す", async () => {
  const { gh, git } = fakes({ prs: [pr(1, "無関係")] });
  const r = await checkPriorWork({ branch: "docs/504-x", gh, git });
  assert.equal(r.state, "none");
  assert.equal(r.lines.some((l) => l.includes("⚠")), false);
  assert.match(r.lines[0], /同じ ISSUE #504 の他の PR・枝はありません（検索に当たった 1 件を確認）/);
});

test("checkPriorWork: 上限に当たれば切れた可能性を ⚠ で出す", async () => {
  const many = Array.from({ length: SEARCH_LIMIT }, (_, i) => pr(i + 1, "無関係"));
  const { gh, git } = fakes({ prs: many });
  const r = await checkPriorWork({ branch: "docs/4-x", gh, git });
  assert.ok(r.lines.some((l) => l.startsWith("⚠") && l.includes("上限") && l.includes("切れている可能性")));
});

test("checkPriorWork: 確かめられなかったときは未実行と理由を出す", async () => {
  const { gh, git } = fakes({ ghFails: true, gitFails: true });
  const r = await checkPriorWork({ branch: "docs/504-x", gh, git });
  assert.equal(r.state, "not-run");
  assert.match(r.lines[0], /^⚠ 同じ ISSUE #504 の先行 PR の確認は未実行です（gh pr list: gh: not logged in・git ls-remote: fatal: unable to access）/);
});

test("枝は issueNumberFromBranch と同じ規則で読む（node-26・日付・renovate は ISSUE 26・11 の先行ではない）", async () => {
  const heads = ["chore/node-26-upgrade", "renovate/node-26.x", "docs/2026-11-03-retro", "docs/26-real", "docs/issue-26-x", "fix/pnpm-11-5"];
  const a = await findPriorWork(26, { ...fakes({ heads }), ownBranch: "x" });
  assert.deepEqual(a.branches, ["docs/26-real", "docs/issue-26-x"]);
  const b = await findPriorWork(11, { ...fakes({ heads }), ownBranch: "x" });
  assert.deepEqual(b.branches, []);
});

test("gh と git は並列に呼ぶ（片方の完了を待たずにもう片方を始める）", async () => {
  const order = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const gh = async () => { order.push("gh-start"); await gate; order.push("gh-end"); return "[]"; };
  const git = async () => { order.push("git-start"); release(); return ""; };
  await findPriorWork(504, { gh, git, ownBranch: "x" });
  assert.deepEqual(order, ["gh-start", "git-start", "gh-end"]);
});

test("describePriorWork: 先行が無くても切れていれば truncated を返す", async () => {
  const many = Array.from({ length: SEARCH_LIMIT }, (_, i) => pr(i + 1, "無関係"));
  const r = describePriorWork(await findPriorWork(4, { ...fakes({ prs: many }), ownBranch: "x" }));
  assert.equal(r.state, "none");
  assert.equal(r.truncated, true);
});
