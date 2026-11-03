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
import { spawn } from "node:child_process";

/** PR の検索の上限。これに当たったら切れている可能性がある。 */
export const SEARCH_LIMIT = 1000;

const firstLine = (text) => String(text).trim().split("\n")[0];

/**
 * ブランチ名の ISSUE 番号。取る形は 2 つだけ: `<type>/<番号>-…`（`docs/504-x`）と `issue-<番号>`（`docs/issue-505-x`）。
 * ISSUE でない数字（`chore/node-26-upgrade`・`fix/pnpm-11-5`。日付 `docs/2026-11-03-retro` は `-NN-NN` が続く形を除く）や
 * 語に混ざった数字は取らず null（未実行）にする。
 */
export function issueNumberFromBranch(branch) {
  const m = /^[^/]+\/(\d{1,7})(?=-|$)(?!-\d{2}-\d{2})/.exec(String(branch)) ?? /(?:^|[/-])issue-(\d{1,7})(?!\d)/.exec(String(branch));
  return m ? Number(m[1]) : null;
}

/** 題の `#番号` をすべて（重複なし・出現順）。 */
export function issueNumbersFromTitle(title) {
  const numbers = [...String(title).matchAll(/#(\d{1,7})(?!\d)/g)].map((m) => Number(m[1]));
  return [...new Set(numbers)];
}

/**
 * @param {number} number
 * @param {{ gh: (args: string[]) => string | Promise<string>, git: (args: string[]) => string | Promise<string>, ownBranch: string }} deps
 *   gh と git は文字列か Promise を返す（失敗なら投げる／棄却する）。2 つは並列に引く（待ちを長い方の 1 回分にする）
 * @returns {Promise<{ state: "found" | "none" | "unknown", number: number, prs: object[], branches: string[],
 *   total: number | null, truncated: boolean, errors: string[] }>}
 */
export async function findPriorWork(number, { gh, git, ownBranch }) {
  const errors = [];
  // body は完全一致の判定（`#番号` が本文だけにある PR）に要るので取る
  const [ghResult, gitResult] = await Promise.allSettled([
    (async () => gh(["pr", "list", "--state", "all", "--limit", String(SEARCH_LIMIT), "--search", `#${number} in:title,body`,
      "--json", "number,title,body,state,headRefName"]))(),
    (async () => git(["ls-remote", "--heads", "origin"]))(),
  ]);
  let prs = [];
  let total = null;
  try {
    if (ghResult.status === "rejected") throw ghResult.reason;
    const listed = JSON.parse(ghResult.value);
    if (!Array.isArray(listed)) throw new Error("想定と違う出力");
    total = listed.length;
    const exact = new RegExp(`#${number}(?!\\d)`);
    prs = listed.filter((p) => exact.test(`${p.title}\n${p.body ?? ""}`) && p.headRefName !== ownBranch);
  } catch (error) {
    errors.push(`gh pr list: ${firstLine(error.message)}`);
  }
  let branches = [];
  try {
    if (gitResult.status === "rejected") throw gitResult.reason;
    // 枝の番号の読み方は issueNumberFromBranch と同じ 1 つにする（緩い照合だと node-26 や日付の枝まで当たる）
    branches = gitResult.value
      .split("\n")
      .map((line) => /\trefs\/heads\/(.+)$/.exec(line)?.[1])
      .filter((name) => name !== undefined && name !== ownBranch && issueNumberFromBranch(name) === number);
  } catch (error) {
    errors.push(`git ls-remote: ${firstLine(error.message)}`);
  }
  const state = prs.length + branches.length > 0 ? "found" : errors.length > 0 ? "unknown" : "none";
  return { state, number, prs, branches, total, truncated: total !== null && total >= SEARCH_LIMIT, errors };
}

const STATE_LABEL = { OPEN: "開いている", MERGED: "マージ済み", CLOSED: "閉じた" };

/**
 * ブランチ名から番号を取って引き、知らせの行にする。
 * 番号の無い枝（main・renovate/* ほか）は、確かめるつもりが無いので ⚠ を付けない 1 行の案内にする（`no-number`）。
 * 確かめるつもりで確かめられなかったとき（gh の失敗ほか）だけ ⚠ の未実行（`not-run`）にする。
 * @returns {Promise<{ state: "found" | "none" | "not-run" | "no-number", lines: string[] }>}
 */
export async function checkPriorWork({ branch, gh, git }) {
  const number = issueNumberFromBranch(branch);
  if (number === null) {
    return { state: "no-number", lines: [`同じ ISSUE の先行 PR の確認は省きました（ブランチ名 ${branch} に ISSUE 番号がありません）`] };
  }
  return describePriorWork(await findPriorWork(number, { gh, git, ownBranch: branch }));
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
  return { state: r.state, lines, truncated: r.truncated };
}

/** 子プロセス 1 つの壁時計の上限（ミリ秒）。超えたら SIGKILL で確実に終わらせ、失敗として扱う。 */
export const CHILD_TIMEOUT_MS = 10_000;

/**
 * コマンドを走らせ、標準出力を返す。標準入力は閉じ（`ignore`）、`timeoutMs` で SIGKILL する（SIGTERM を無視する子も終わる）。
 * 失敗（起動できない・非ゼロ終了・時間切れ・出力が大きすぎる）は投げる。
 */
export function runCommand(cmd, args, { cwd, timeoutMs = CHILD_TIMEOUT_MS, maxBytes = 64 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      reject(error);
      return;
    }
    const out = [];
    const err = [];
    let size = 0;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(reject, new Error(`${cmd}: ${timeoutMs / 1000} 秒で打ち切りました（時間切れ）`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        child.kill("SIGKILL");
        finish(reject, new Error(`${cmd}: 出力が大きすぎます`));
      } else out.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (err.length < 64) err.push(chunk);
    });
    child.on("error", (error) => finish(reject, error));
    child.on("close", (code) => {
      if (code === 0) finish(resolve, Buffer.concat(out).toString("utf8"));
      else finish(reject, new Error(`${cmd}: ${firstLine(Buffer.concat(err).toString("utf8")) || `exit ${code}`}`));
    });
  });
}

/** 本番の gh と git。どちらも `cwd` で実行する。Promise を返す（並列に引くため）。上限は {@link CHILD_TIMEOUT_MS}。 */
export function defaultRunners(cwd) {
  const run = (cmd) => (args) => runCommand(cmd, args, { cwd });
  return { gh: run("gh"), git: run("git") };
}
