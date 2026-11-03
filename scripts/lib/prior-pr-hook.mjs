/**
 * `gh pr create` の直前に、同じ ISSUE の先行する PR・枝があれば人に聞く判定（#504・`docs/adr/0032` の追記）。
 *
 * Claude Code の PreToolUse フック（`scripts/agent-guard-hook.mjs`）から、本番デプロイの判定
 * （`decideHookOutput`）の後に呼ばれる。デプロイの判定は変えない。引き方は `scripts/lib/prior-work.mjs`（check:fast と共通）。
 *
 * - 番号はブランチ名と `--title` の `#番号` の両方から取る。どこにも無ければ引かずに通す（番号の無い PR は確かめようがない）
 * - 先行があれば `ask`。**引けなかったとき（gh が無い・未認証・ネットワークが無い）も `ask`**。
 *   読めないときは当てる側に倒す `docs/adr/0032` と同じ。`gh pr create` 自身も gh とネットワークを要するので、
 *   引けない環境で聞いても余計な手間はほぼ増えない
 * - 判定は純粋関数。gh と git を呼ぶ `lookup` と `currentBranch` は引数で受け取る
 */
import { findCommandsMatching, SHELL_TOOLS } from "./agent-guard.mjs";
import { describePriorWork, findPriorWork, issueNumberFromBranch, issueNumbersFromTitle, defaultRunners } from "./prior-work.mjs";

/** 先行 PR を確かめる対象のコマンド。 */
export const PR_CREATE = Object.freeze([{ id: "gh-pr-create", program: "gh", args: ["pr", "create"] }]);

/** `gh pr create` の語から `--title` / `-t` の値を取る。無ければ null。 */
export function extractTitle(words) {
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    if (w === "--title" || w === "-t") return words[i + 1] ?? null;
    if (w.startsWith("--title=")) return w.slice("--title=".length);
  }
  return null;
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
  const numbers = new Set();
  const fromBranch = issueNumberFromBranch(branch);
  if (fromBranch !== null) numbers.add(fromBranch);
  for (const h of hits) {
    const title = extractTitle(h.words);
    if (title !== null) for (const n of issueNumbersFromTitle(title)) numbers.add(n);
  }
  if (numbers.size === 0) return null;

  const result = lookup({ numbers: [...numbers], branch });
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
