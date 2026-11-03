/**
 * `gh pr create` の直前に、同じ ISSUE の先行する PR・枝があれば人に聞く判定（#504・`docs/adr/0032` の追記）。
 *
 * Claude Code の PreToolUse フック（`scripts/agent-guard-hook.mjs`）から、本番デプロイの判定
 * （`decideHookOutput`）が当たらなかったときだけ呼ばれる（当たれば先行 PR の確認は流さない。fail-open にしないため）。引き方は `scripts/lib/prior-work.mjs`（check:fast と共通）。
 *
 * - 番号はブランチ名（`<type>/<番号>-`・`issue-<番号>`）と `--title`（`-t<値>`・`--title=<値>` も）の最初の `#番号` の最大 2 つ
 *   （同じなら 1 つ）。2 つは並列に引く（待ちは gh と git の各 10 秒の上限の長い方 1 回分。全体は 15 秒で打ち切って ask）。どこにも無ければ引かずに通す（番号の無い PR は確かめようがない）
 * - 自分の枝は `--head`（`-H`）があればそれ、無ければ作業場所の今の枝。作業場所は、コマンドの先頭の `cd <dir> &&`（`;`）を解釈して直す。
 *   ただし許可の前に git・gh を走らせるので、`cd` の先はこのリポジトリに登録された worktree（`git worktree list`）のときだけ使い、
 *   違えば何も流さずに `ask`（`cd` が途中・`~`/変数/`-`・`git -C` は読まない。ADR-0032 の残余）
 * - 先行が無くても、検索が上限に当たって切れていれば「無い」と言い切れないので `ask`
 * - 先行があれば `ask`。**引けなかったとき（gh が無い・未認証・ネットワークが無い）も `ask`**。
 *   読めないときは当てる側に倒す `docs/adr/0032` と同じ。`gh pr create` 自身も gh とネットワークを要するので、
 *   引けない環境で聞いても余計な手間はほぼ増えない
 * - 判定は純粋関数。gh と git を呼ぶ `lookup` と `currentBranch` は引数で受け取る
 */
import fs from "node:fs";
import path from "node:path";
import { findCommandsMatching, SHELL_TOOLS } from "./agent-guard.mjs";
import { describePriorWork, findPriorWork, issueNumberFromBranch, issueNumbersFromTitle, defaultRunners } from "./prior-work.mjs";

/** 先行 PR を確かめる対象のコマンド。 */
export const PR_CREATE = Object.freeze([
  { id: "gh-pr-create", program: "gh", args: ["pr", "create"], argOpts: ["-R", "--repo"] },
  { id: "gh-pr-create", program: "gh", args: ["pr", "new"], argOpts: ["-R", "--repo"] },
]);

/** 値を取らない短い選択肢（`gh pr create --help` の -d・-e・-f・-w）。`-dt` のように束ねてよいのはこれだけ。 */
const BOOLEAN_SHORT = "[defw]";
/** 値を次の語に取る選択肢。その値を題と読み違えない（`-b "-t x"`）ために飛ばす。 */
const VALUE_OPTIONS = new Set([
  "-a", "--assignee", "--attach", "-B", "--base", "-b", "--body", "-F", "--body-file", "-H", "--head", "-l", "--label",
  "-m", "--milestone", "-p", "--project", "--recover", "-r", "--reviewer", "-T", "--template", "-R", "--repo",
]);

/**
 * `gh pr create` の語から `--title` / `-t` と `--head` / `-H` の値を取る。無ければ null。複数あれば最後（gh と同じ）。
 * 題の形: `--title X`・`--title=X`・`-t X`・`-tX`・`-dt X`（値を取らない選択肢との束ね）。
 * `-Tmytemplate`・`-btest`・`-rteam/#3` のように、別の選択肢の値に t が混ざる形は題と読まない。
 * head は `owner:branch` の形なら branch の部分。
 * @returns {{ title: string | null, head: string | null }}
 */
export function parseCreateOptions(words) {
  let title = null;
  let head = null;
  const bare = (v) => (v === null ? null : v.slice(v.lastIndexOf(":") + 1));
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    if (w === "--title") {
      title = words[i + 1] ?? null;
      i += 1;
    } else if (w.startsWith("--title=")) {
      title = w.slice("--title=".length);
    } else if (w === "--head" || w === "-H") {
      head = bare(words[i + 1] ?? null);
      i += 1;
    } else if (w.startsWith("--head=")) {
      head = bare(w.slice("--head=".length));
    } else if (/^-H.+/.test(w)) {
      head = bare(w.slice(2));
    } else if (VALUE_OPTIONS.has(w)) {
      i += 1;
    } else {
      const m = new RegExp(`^-${BOOLEAN_SHORT}*t(.*)$`).exec(w);
      if (m) {
        if (m[1] === "") {
          title = words[i + 1] ?? null;
          i += 1;
        } else {
          title = m[1];
        }
      }
    }
  }
  return { title, head };
}

/** `gh pr create` の語から題を取る（{@link parseCreateOptions}）。 */
export function extractTitle(words) {
  return parseCreateOptions(words).title;
}

/**
 * コマンドの先頭の `cd <dir> &&`（`;`）を解釈して、gh と git を走らせる作業場所を直す。
 * 読めない形（`cd` が途中・`~`・変数・`-`・コマンド置換・引数なし）は元の作業場所のまま返す。
 */
export function effectiveCwd(command, cwd) {
  const m = /^\s*cd\s+(?:"([^"$`]*)"|'([^']*)'|([^\s;&|"'`$()<>~-][^\s;&|"'`$()<>]*))\s*(?:&&|;)/.exec(command);
  const dir = m ? (m[1] ?? m[2] ?? m[3]) : undefined;
  if (dir === undefined || dir === "") return cwd;
  return path.resolve(cwd, dir);
}

function ask(reason) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: reason } };
}

/** コマンドが `gh pr create`（`gh pr new`）を含むか。デプロイの `ask` に「先行 PR の確認は省いた」と添えるかの判定に使う。 */
export function mentionsPrCreate(raw) {
  try {
    const input = JSON.parse(raw);
    const command = input?.tool_input?.command;
    return SHELL_TOOLS.includes(input?.tool_name) && typeof command === "string" && findCommandsMatching(command, PR_CREATE).length > 0;
  } catch {
    return false;
  }
}

/**
 * @param {string} raw 標準入力の中身
 * @param {{ cwd: string, currentBranch: (dir: string) => string | Promise<string>,
 *   registeredWorktrees: (cwd: string) => string[] | Promise<string[]>,
 *   lookup: (q: { numbers: number[], branch: string, dir: string }) =>
 *     { state: string, lines: string[], truncated?: boolean } | Promise<{ state: string, lines: string[], truncated?: boolean }> }} deps
 * @returns {Promise<object | null>} `ask` の出力か、何も返さないなら null
 */
export async function decidePriorPrOutput(raw, { cwd, currentBranch, registeredWorktrees, lookup }) {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return null; // 読めない入力は本番デプロイの判定が ask に倒している
  }
  if (input === null || typeof input !== "object" || !SHELL_TOOLS.includes(input.tool_name)) return null;
  const command = input.tool_input?.command;
  if (typeof command !== "string") return null;
  const hits = findCommandsMatching(command, PR_CREATE).filter((h) => h.id === "gh-pr-create");
  if (hits.length === 0) return null;

  const dir = effectiveCwd(command, cwd);
  // 許可の前に走るので、信用できない場所の git 設定（core.fsmonitor・core.sshCommand）を実行しない。
  // `cd` の先は、このリポジトリに登録済みの worktree（と本体）のときだけ使う。違えば何も流さずに聞く
  if (dir !== cwd) {
    let trusted = false;
    try {
      const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
      trusted = (await registeredWorktrees(cwd)).some((w) => real(w) === real(dir));
    } catch {
      trusted = false;
    }
    if (!trusted) {
      return ask(`コマンドの先頭の cd の先 ${dir} は、このリポジトリに登録された worktree ではありません。信用できない場所の git 設定を、人の承認の前に実行しないよう、同じ ISSUE の先行 PR の確認は省きました。人の確認が要ります（docs/adr/0032 の追記）。`);
    }
  }
  const options = hits.map((h) => parseCreateOptions(h.words));
  let branch;
  try {
    branch = (await currentBranch(dir)) || "";
  } catch {
    branch = "";
  }
  // 自分の枝は --head があればそれ（別の枝の PR を作るとき）。無ければ作業場所の今の枝
  const own = options.map((o) => o.head).filter((h) => h !== null).at(-1) ?? branch;
  const numbers = [];
  const fromBranch = issueNumberFromBranch(own);
  if (fromBranch !== null) numbers.push(fromBranch);
  // 題の番号も引く（ブランチの番号と違う ISSUE を題に書くことがある）。最大 2 つ・同じなら 1 つ
  for (const o of options) {
    const fromTitle = o.title === null ? undefined : issueNumbersFromTitle(o.title)[0];
    if (fromTitle !== undefined && !numbers.includes(fromTitle)) {
      numbers.push(fromTitle);
      break;
    }
  }
  if (numbers.length === 0) return null;

  const result = await lookup({ numbers, branch: own, dir });
  // 切れているときは「無い」と言い切れないので、先行が無くても聞く（引けなかったときと同じ考え方）
  if (result.state === "none" && result.truncated !== true) return null;
  return ask(`${result.lines.join("\n")}\n同じ ISSUE の作業が重なっていないか、人の確認が要ります（AGENTS.md「作業の始めに」・docs/adr/0030 決定 5）。`);
}

/** 先行 PR の確認全体の壁時計の上限（ミリ秒）。子プロセスの上限（`CHILD_TIMEOUT_MS`）より長く、Claude Code のフックの既定の時間切れ（60 秒）より十分短い。 */
export const OVERALL_TIMEOUT_MS = 15_000;

/**
 * {@link decidePriorPrOutput} を全体の上限つきで呼ぶ。上限に当たったら `ask`（確かめられなかったので聞く）。
 * 上限の中に終わらなくても、フックの呼び出し側が先に本番デプロイの判定を済ませているので、そちらは遅れない。
 */
export async function decidePriorPrOutputWithin(raw, deps, limitMs = OVERALL_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve("timeout"), limitMs);
  });
  try {
    const result = await Promise.race([decidePriorPrOutput(raw, deps), timeout]);
    if (result === "timeout") {
      return ask(`同じ ISSUE の先行 PR の確認が ${limitMs / 1000} 秒の上限に当たり、確かめられませんでした。人の確認が要ります（docs/adr/0032 の追記）。`);
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

/** 本番の、このリポジトリに登録された worktree の一覧（`git worktree list --porcelain`）。`cwd` で流す。 */
export function defaultRegisteredWorktrees() {
  return async (cwd) =>
    (await defaultRunners(cwd).git(["worktree", "list", "--porcelain"]))
      .split("\n")
      .filter((l) => l.startsWith("worktree "))
      .map((l) => l.slice("worktree ".length));
}

/** 本番の lookup。番号ごとに並列に引き、知らせの行をまとめる。作業場所は問い合わせの `dir`。 */
export function defaultLookup() {
  return async ({ numbers, branch, dir }) => {
    const { gh, git } = defaultRunners(dir);
    const parts = await Promise.all(numbers.map(async (n) => describePriorWork(await findPriorWork(n, { gh, git, ownBranch: branch }))));
    const state = parts.some((p) => p.state === "found") ? "found" : parts.some((p) => p.state === "not-run") ? "not-run" : "none";
    return { state, lines: parts.flatMap((p) => p.lines), truncated: parts.some((p) => p.truncated === true) };
  };
}

/** 本番の現在のブランチ。 */
export function defaultCurrentBranch() {
  return async (dir) => (await defaultRunners(dir).git(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
}
