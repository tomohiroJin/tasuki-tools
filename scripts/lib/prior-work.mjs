/**
 * 同じ ISSUE の先行する PR・枝を引き、人に知らせる材料を作る（#504・`docs/adr/0030` 決定 5 の追記）。
 *
 * 呼び出しは 2 つある。`scripts/local-check.mjs`（check:fast の知らせ）と、`gh pr create` の直前に聞く
 * Claude Code のフック（`scripts/lib/prior-pr-hook.mjs`）。**引き方はここの 1 つだけ**にする。
 *
 * 引き方（`AGENTS.md`「作業の始めに」と同じ）:
 * - PR: 題と本文に `#<番号>` があり、後ろに数字が続かないもの（`#504` は `#5040` や本文の「2,480」に当たらない）
 * - 枝: `git ls-remote --heads origin`。**`git fetch` はしない**（共有のリモート追跡の参照を消さない。`scripts/lib/base-freshness.mjs`）
 * - 自分の枝と、その枝の PR は除く
 *
 * **知らせるだけで止めない。** gh が無い・未認証・ネットワークが無いときは、失敗でなく「未実行」と理由を返す。
 * gh と git は引数で受け取る（`(args) => stdout`。失敗なら投げる）。テストは偽物を渡す。
 */
import { execFileSync } from "node:child_process";

/** PR の検索の上限。これに当たったら切れている可能性がある。 */
export const SEARCH_LIMIT = 1000;

const firstLine = (text) => String(text).trim().split("\n")[0];

/** ブランチ名の最初の番号（`docs/504-x`・`claude/trial-491-cloud-480` は 491）。語に混ざった数字（`abc504def`）は取らない。 */
export function issueNumberFromBranch(branch) {
  const m = /(?:^|[/-])(\d{1,7})(?=[/-]|$)/.exec(String(branch));
  return m ? Number(m[1]) : null;
}

/** 題の `#番号` をすべて（重複なし・出現順）。 */
export function issueNumbersFromTitle(title) {
  const numbers = [...String(title).matchAll(/#(\d{1,7})(?!\d)/g)].map((m) => Number(m[1]));
  return [...new Set(numbers)];
}

/**
 * @param {number} number
 * @param {{ gh: (args: string[]) => string, git: (args: string[]) => string, ownBranch: string }} deps
 * @returns {{ state: "found" | "none" | "unknown", number: number, prs: object[], branches: string[],
 *   total: number | null, truncated: boolean, errors: string[] }}
 */
export function findPriorWork(number, { gh, git, ownBranch }) {
  const errors = [];
  let prs = [];
  let total = null;
  try {
    const listed = JSON.parse(
      gh(["pr", "list", "--state", "all", "--limit", String(SEARCH_LIMIT), "--search", `#${number} in:title,body`,
        "--json", "number,title,body,state,headRefName"]),
    );
    if (!Array.isArray(listed)) throw new Error("想定と違う出力");
    total = listed.length;
    const exact = new RegExp(`#${number}(?!\\d)`);
    prs = listed.filter((p) => exact.test(`${p.title}\n${p.body ?? ""}`) && p.headRefName !== ownBranch);
  } catch (error) {
    errors.push(`gh pr list: ${firstLine(error.message)}`);
  }
  let branches = [];
  try {
    const exact = new RegExp(`(?:^|[/-])${number}(?!\\d)`);
    branches = git(["ls-remote", "--heads", "origin"])
      .split("\n")
      .map((line) => /\trefs\/heads\/(.+)$/.exec(line)?.[1])
      .filter((name) => name !== undefined && name !== ownBranch && exact.test(name));
  } catch (error) {
    errors.push(`git ls-remote: ${firstLine(error.message)}`);
  }
  const state = prs.length + branches.length > 0 ? "found" : errors.length > 0 ? "unknown" : "none";
  return { state, number, prs, branches, total, truncated: total !== null && total >= SEARCH_LIMIT, errors };
}

const STATE_LABEL = { OPEN: "開いている", MERGED: "マージ済み", CLOSED: "閉じた" };

/**
 * ブランチ名から番号を取って引き、知らせの行にする。
 * @returns {{ state: "found" | "none" | "not-run", lines: string[] }}
 */
export function checkPriorWork({ branch, gh, git }) {
  const number = issueNumberFromBranch(branch);
  if (number === null) {
    return { state: "not-run", lines: [`⚠ 同じ ISSUE の先行 PR の確認は未実行です（ブランチ名 ${branch} に ISSUE 番号がありません）`] };
  }
  return describePriorWork(findPriorWork(number, { gh, git, ownBranch: branch }));
}

/** {@link findPriorWork} の結果を知らせの行にする（フックは複数の番号を引くので、ここを共有する）。 */
export function describePriorWork(r) {
  const lines = [];
  if (r.state === "unknown") {
    return { state: "not-run", lines: [`⚠ 同じ ISSUE #${r.number} の先行 PR の確認は未実行です（${r.errors.join("・")}）`] };
  }
  if (r.state === "found") {
    lines.push(`⚠ 同じ ISSUE #${r.number} の他の PR・枝があります。作業の途中なら、続ける前に人へ伝えてください`);
    for (const p of r.prs) lines.push(`  - PR #${p.number}（${STATE_LABEL[p.state] ?? p.state}）${p.title}`);
    for (const b of r.branches) lines.push(`  - 枝 ${b}`);
  } else {
    lines.push(`同じ ISSUE #${r.number} の他の PR・枝はありません（検索に当たった ${r.total ?? 0} 件を確認）`);
  }
  if (r.errors.length > 0) lines.push(`⚠ 一部を確かめられませんでした（${r.errors.join("・")}）`);
  if (r.truncated) lines.push(`⚠ 検索が上限（${SEARCH_LIMIT} 件）に当たりました。切れている可能性があります`);
  return { state: r.state, lines };
}

/** 本番の gh と git。どちらも `cwd` で実行し、15 秒で打ち切る。 */
export function defaultRunners(cwd) {
  const run = (cmd) => (args) =>
    execFileSync(cmd, args, { cwd, encoding: "utf8", timeout: 15_000, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  return { gh: run("gh"), git: run("git") };
}
