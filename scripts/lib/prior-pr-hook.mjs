/**
 * `gh pr create` の直前に、同じ ISSUE の先行する PR・枝があれば人に聞く判定（#504・`docs/adr/0032` の追記）。
 *
 * Claude Code の PreToolUse フック（`scripts/agent-guard-hook.mjs`）から、本番デプロイの判定
 * （`decideHookOutput`）の後に呼ばれる。デプロイの判定は変えない。引き方は `scripts/lib/prior-work.mjs`（check:fast と共通）。
 *
 * - 番号はブランチ名（`<type>/<番号>-`・`issue-<番号>`）を優先し、無ければ `--title`（`-t<値>`・`--title=<値>` も）の最初の `#番号`。1 つに絞る（待ち時間の上限）。どこにも無ければ引かずに通す（番号の無い PR は確かめようがない）
 * - 先行があれば `ask`。**引けなかったとき（gh が無い・未認証・ネットワークが無い）も `ask`**。
 *   読めないときは当てる側に倒す `docs/adr/0032` と同じ。`gh pr create` 自身も gh とネットワークを要するので、
 *   引けない環境で聞いても余計な手間はほぼ増えない
 * - 判定は純粋関数。gh と git を呼ぶ `lookup` と `currentBranch` は引数で受け取る
 */
import { findCommandsMatching, SHELL_TOOLS } from "./agent-guard.mjs";
import { describePriorWork, findPriorWork, issueNumberFromBranch, issueNumbersFromTitle, defaultRunners } from "./prior-work.mjs";

/** 先行 PR を確かめる対象のコマンド。 */
export const PR_CREATE = Object.freeze([{ id: "gh-pr-create", program: "gh", args: ["pr", "create"] }, { id: "gh-pr-create", program: "gh", args: ["pr", "new"] }]);

/** 値を取らない短い選択肢（`gh pr create --help` の -d・-e・-f・-w）。`-dt` のように束ねてよいのはこれだけ。 */
const BOOLEAN_SHORT = "[defw]";
/** 値を次の語に取る選択肢。その値を題と読み違えない（`-b "-t x"`）ために飛ばす。 */
const VALUE_OPTIONS = new Set([
  "-a", "--assignee", "--attach", "-B", "--base", "-b", "--body", "-F", "--body-file", "-H", "--head", "-l", "--label",
  "-m", "--milestone", "-p", "--project", "--recover", "-r", "--reviewer", "-T", "--template", "-R", "--repo",
]);

/**
 * `gh pr create` の語から `--title` / `-t` の値を取る。無ければ null。複数あれば最後（gh と同じ）。
 * 取る形: `--title X`・`--title=X`・`-t X`・`-tX`・`-dt X`（値を取らない選択肢との束ね）。
 * `-Tmytemplate`・`-btest`・`-rteam/#3` のように、別の選択肢の値に t が混ざる形は題と読まない。
 */
export function extractTitle(words) {
  let title = null;
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    if (w === "--title") {
      title = words[i + 1] ?? null;
      i += 1;
    } else if (w.startsWith("--title=")) {
      title = w.slice("--title=".length);
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
  return title;
}

function ask(reason) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: reason } };
}

/**
 * @param {string} raw 標準入力の中身
 * @param {{ currentBranch: () => string, lookup: (q: { numbers: number[], branch: string }) => { state: string, lines: string[] } }} deps
 * @returns {object | null} `ask` の出力か、何も返さないなら null
 */
export function decidePriorPrOutput(raw, { currentBranch, lookup }) {
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

  let branch;
  try {
    branch = currentBranch();
  } catch {
    branch = "";
  }
  // 番号は 1 つに絞る（ブランチ優先、無ければ題の最初）。引くたびに gh と git の待ちが要り、フックの時間切れに届くため
  let number = issueNumberFromBranch(branch);
  for (const h of hits) {
    if (number !== null) break;
    const title = extractTitle(h.words);
    if (title !== null) number = issueNumbersFromTitle(title)[0] ?? null;
  }
  if (number === null) return null;

  const result = lookup({ numbers: [number], branch });
  if (result.state === "none") return null;
  return ask(`${result.lines.join("\n")}\n同じ ISSUE の作業が重なっていないか、人の確認が要ります（AGENTS.md「作業の始めに」・docs/adr/0030 決定 5）。`);
}

/** 本番の lookup。番号ごとに引き、知らせの行をまとめる。 */
export function defaultLookup(cwd) {
  const { gh, git } = defaultRunners(cwd);
  return ({ numbers, branch }) => {
    const parts = numbers.map((n) => describePriorWork(findPriorWork(n, { gh, git, ownBranch: branch })));
    const state = parts.some((p) => p.state === "found") ? "found" : parts.some((p) => p.state === "not-run") ? "not-run" : "none";
    return { state, lines: parts.flatMap((p) => p.lines) };
  };
}

/** 本番の現在のブランチ。 */
export function defaultCurrentBranch(cwd) {
  return () => defaultRunners(cwd).git(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
}
