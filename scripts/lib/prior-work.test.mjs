import { test } from "node:test";
import assert from "node:assert/strict";
import {
  issueNumberFromBranch,
  issueNumbersFromTitle,
  findPriorWork,
  checkPriorWork,
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

test("ブランチ名から最初の番号を取る", () => {
  assert.equal(issueNumberFromBranch("docs/504-review-and-prior-pr-rules"), 504);
  assert.equal(issueNumberFromBranch("claude/trial-491-cloud-480"), 491);
  assert.equal(issueNumberFromBranch("504-foo"), 504);
});

test("ブランチ名に番号が無ければ null（main・HEAD・語に混ざった数字）", () => {
  assert.equal(issueNumberFromBranch("main"), null);
  assert.equal(issueNumberFromBranch("HEAD"), null);
  assert.equal(issueNumberFromBranch("feature/v2-room"), null);
  assert.equal(issueNumberFromBranch("fix/abc504def"), null);
});

test("題から #番号 をすべて取る", () => {
  assert.deepEqual(issueNumbersFromTitle("docs: 規則を足す（#504）と #491"), [504, 491]);
  assert.deepEqual(issueNumbersFromTitle("題に番号なし"), []);
  assert.deepEqual(issueNumbersFromTitle("#504 と #504"), [504]);
});

test("PR は題か本文の完全一致だけを拾い、番号が前方一致の別 ISSUE と本文中の数字は拾わない", () => {
  const { gh, git } = fakes({
    prs: [
      pr(501, "docs: 試し（#491）", "#504〜#509 を出す"),
      pr(190, "docs: 件数をやめる（#187）", "テスト総数は 2,480 件"),
      pr(600, "feat: 別件（#5040）"),
      pr(700, "feat: 別件", "see #50"),
    ],
  });
  const r = findPriorWork(504, { gh, git, ownBranch: "docs/504-x" });
  assert.deepEqual(r.prs.map((p) => p.number), [501]);
  assert.equal(r.state, "found");
});

test("自分の枝とその PR は除く", () => {
  const { gh, git } = fakes({
    prs: [pr(900, "docs: 自分（#504）", "", "OPEN", "docs/504-x"), pr(501, "他（#504）")],
    heads: ["docs/504-x", "claude/trial-504-cloud"],
  });
  const r = findPriorWork(504, { gh, git, ownBranch: "docs/504-x" });
  assert.deepEqual(r.prs.map((p) => p.number), [501]);
  assert.deepEqual(r.branches, ["claude/trial-504-cloud"]);
});

test("枝は番号の完全一致（5040・1504 は拾わず、先頭の 504-x と /504 は拾う）", () => {
  const { gh, git } = fakes({ heads: ["a/5040-x", "a/1504-x", "504-top", "a/b-504", "a/504/c", "a/504"] });
  const r = findPriorWork(504, { gh, git, ownBranch: "none" });
  assert.deepEqual(r.branches, ["504-top", "a/b-504", "a/504/c", "a/504"]);
});

test("何も無ければ none。検索に当たった件数を持つ", () => {
  const { gh, git } = fakes({ prs: [pr(1, "無関係（#2）")] });
  const r = findPriorWork(504, { gh, git, ownBranch: "x" });
  assert.equal(r.state, "none");
  assert.equal(r.total, 1);
  assert.equal(r.truncated, false);
});

test("検索が上限に当たったら切れた可能性として扱う", () => {
  const many = Array.from({ length: SEARCH_LIMIT }, (_, i) => pr(i + 1, "無関係"));
  const { gh, git } = fakes({ prs: many });
  const r = findPriorWork(4, { gh, git, ownBranch: "x" });
  assert.equal(r.truncated, true);
});

test("gh の呼び出しは fetch せず、上限と検索語を指定し、枝は ls-remote を使う", () => {
  const { gh, git, calls } = fakes();
  findPriorWork(480, { gh, git, ownBranch: "x" });
  assert.ok(calls.some((c) => c.startsWith("gh pr list --state all --limit 1000 --search #480 in:title,body --json")));
  assert.ok(calls.includes("git ls-remote --heads origin"));
  assert.ok(!calls.some((c) => c.includes("fetch")));
});

test("gh が失敗しても枝の結果は残し、PR は確かめられなかったと言う", () => {
  const { gh, git } = fakes({ ghFails: true, heads: ["claude/trial-504-cloud"] });
  const r = findPriorWork(504, { gh, git, ownBranch: "x" });
  assert.equal(r.state, "found");
  assert.match(r.errors[0], /^gh pr list: gh: not logged in$/);
});

test("片方だけ失敗して何も見つからないときも unknown（none と区別する。確かめていない側が残る）", () => {
  const { gh, git } = fakes({ ghFails: true });
  assert.equal(findPriorWork(504, { gh, git, ownBranch: "x" }).state, "unknown");
  const b = fakes({ gitFails: true });
  assert.equal(findPriorWork(504, { gh: b.gh, git: b.git, ownBranch: "x" }).state, "unknown");
});

test("両方失敗なら unknown", () => {
  const { gh, git } = fakes({ ghFails: true, gitFails: true });
  const r = findPriorWork(504, { gh, git, ownBranch: "x" });
  assert.equal(r.state, "unknown");
  assert.equal(r.errors.length, 2);
});

test("gh の出力が JSON でなければ失敗として扱う", () => {
  const git = () => "";
  const r = findPriorWork(504, { gh: () => "not json", git, ownBranch: "x" });
  assert.match(r.errors[0], /^gh pr list:/);
});

test("checkPriorWork: 番号の無いブランチは失敗でなく未実行", () => {
  const { gh, git } = fakes();
  const r = checkPriorWork({ branch: "main", gh, git });
  assert.equal(r.state, "not-run");
  assert.match(r.lines[0], /^⚠ 同じ ISSUE の先行 PR の確認は未実行です（ブランチ名 main に ISSUE 番号がありません）/);
});

test("checkPriorWork: 見つかれば人へ伝えるよう促す行を出す", () => {
  const { gh, git } = fakes({ prs: [pr(501, "docs: 試し（#491）", "#504〜", "MERGED")], heads: ["claude/trial-504-cloud"] });
  const r = checkPriorWork({ branch: "docs/504-x", gh, git });
  assert.equal(r.state, "found");
  assert.match(r.lines[0], /^⚠ 同じ ISSUE #504 の他の PR・枝があります/);
  assert.ok(r.lines.some((l) => l.includes("PR #501（マージ済み）docs: 試し（#491）")));
  assert.ok(r.lines.some((l) => l.includes("枝 claude/trial-504-cloud")));
  assert.ok(r.lines.some((l) => l.includes("続ける前に人へ伝えてください")));
});

test("checkPriorWork: 無ければ ⚠ なしで件数を出す", () => {
  const { gh, git } = fakes({ prs: [pr(1, "無関係")] });
  const r = checkPriorWork({ branch: "docs/504-x", gh, git });
  assert.equal(r.state, "none");
  assert.equal(r.lines.some((l) => l.includes("⚠")), false);
  assert.match(r.lines[0], /同じ ISSUE #504 の他の PR・枝はありません（検索に当たった 1 件を確認）/);
});

test("checkPriorWork: 上限に当たれば切れた可能性を ⚠ で出す", () => {
  const many = Array.from({ length: SEARCH_LIMIT }, (_, i) => pr(i + 1, "無関係"));
  const { gh, git } = fakes({ prs: many });
  const r = checkPriorWork({ branch: "docs/4-x", gh, git });
  assert.ok(r.lines.some((l) => l.startsWith("⚠") && l.includes("上限") && l.includes("切れている可能性")));
});

test("checkPriorWork: 確かめられなかったときは未実行と理由を出す", () => {
  const { gh, git } = fakes({ ghFails: true, gitFails: true });
  const r = checkPriorWork({ branch: "docs/504-x", gh, git });
  assert.equal(r.state, "not-run");
  assert.match(r.lines[0], /^⚠ 同じ ISSUE #504 の先行 PR の確認は未実行です（gh pr list: gh: not logged in・git ls-remote: fatal: unable to access）/);
});
