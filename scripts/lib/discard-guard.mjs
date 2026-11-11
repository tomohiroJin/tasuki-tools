/**
 * 未コミットの変更を消すコマンドの手前で人に聞く判定（#578・docs/adr/0037）。
 *
 * 対象は `git checkout -- <path>`・`git checkout -f`・`git restore <path>`（`--staged` だけは除く）・`git stash`（保存する形）。
 * **対象に未コミットの変更があるときだけ** `ask` を返す。変更が無ければ消えるものが無いので通す
 * （`docs/guides/procedures/adversarial-review.md` の「別の版から取り出す」手順は、取り出す先が無傷なら止まらない）。
 *
 * - 読み方は `scripts/lib/agent-guard.mjs` の字句の読み（`findCommandsMatching`）を使う。コマンドの**起動の位置**にある
 *   `git` だけを見るので、`grep 'git stash' …`・`echo git restore a.ts` のような読み取りの中の文字列には当てない
 * - 変更の有無は `git status --porcelain` を、入力の `cwd`（Claude Code が信用を確かめた作業場所）で引く。
 *   `git -C <dir>`・`--git-dir`・`--work-tree` で別の場所を指す形は、その場所を確かめない（許可の前に信用できない場所の
 *   git 設定を走らせないため。`docs/adr/0032` の追記と同じ）ので、読めないとして `ask` に倒す
 * - 確かめられなかった（git が無い・時間切れ・作業場所が無い）ときも `ask` に倒す。git の作業ツリーでない場所は消すものが無いので通す
 * - 歯止めであって壁ではない: `git reset --hard`（サブエージェントには別に聞く）・`git clean`・`rm`・エディタでの上書きは対象外
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { findCommandsMatching, GIT_ARG_OPTS, SHELL_TOOLS, isLongOption, beforeDashDash } from "./agent-guard.mjs";

/** 対象にする git の下位コマンドの宣言。 */
export const DISCARD_COMMANDS = [
  { id: "git-checkout-discard", program: "git", args: ["checkout"], argOpts: GIT_ARG_OPTS, why: "checkout で作業ツリーのファイルを上書きする" },
  { id: "git-restore-discard", program: "git", args: ["restore"], argOpts: GIT_ARG_OPTS, why: "restore で作業ツリーのファイルを上書きする" },
  { id: "git-stash-discard", program: "git", args: ["stash"], argOpts: GIT_ARG_OPTS, why: "stash で未コミットの変更を作業ツリーから外す" },
];

/** 単独または束ねた短い選択肢に、文字 `c` があるか（`-fq` の f）。 */
const hasShort = (w, c) => /^-[A-Za-z]+$/.test(w) && w.includes(c);
/** 保存しない stash の下位コマンド。 */
const STASH_NON_SAVING = new Set(["list", "show", "pop", "apply", "drop", "clear", "branch", "create", "store"]);

/** `--` の後ろ。無ければ null。 */
const afterDashDash = (rest) => {
  const k = rest.indexOf("--");
  return k === -1 ? null : rest.slice(k + 1);
};

/** git の全体の選択肢（`-C`・`--git-dir`・`--work-tree`）で別の場所を指しているか。 */
function pointsElsewhere(words, start) {
  return words.slice(0, start).some((w) => w === "-C" || /^-C./.test(w) || /^--(git-dir|work-tree)(=|$)/.test(w));
}

/** 1 つの当たりから、確かめる対象を取り出す。消さない形は null。 */
function targetOf(hit, exists) {
  const { words, start, id } = hit;
  const rest = words.slice(start + 1);
  let target = null;
  if (id === "git-checkout-discard") {
    const dd = afterDashDash(rest);
    if (dd !== null) target = dd.length > 0 ? { kind: "paths", paths: dd } : null;
    else if (beforeDashDash(rest).some((w) => hasShort(w, "f") || isLongOption(w, "--force"))) target = { kind: "all" };
    else {
      // `-- ` の無い `git checkout <x>` は、実在するパスのときだけファイルの取り出しと読む（それ以外は枝の切り替え）
      const operands = rest.filter((w) => !w.startsWith("-"));
      if (operands.length > 0 && operands.every((w) => exists(w))) target = { kind: "paths", paths: operands };
    }
  } else if (id === "git-restore-discard") {
    const opts = beforeDashDash(rest);
    const staged = opts.some((w) => hasShort(w, "S") || isLongOption(w, "--staged"));
    const worktree = opts.some((w) => hasShort(w, "W") || isLongOption(w, "--worktree"));
    if (staged && !worktree) return null;
    if (opts.some((w) => isLongOption(w, "--pathspec-from-file"))) return withElsewhere({ kind: "all" }, words, start);
    const dd = afterDashDash(rest);
    let paths = dd;
    if (paths === null) {
      paths = [];
      for (let i = 0; i < rest.length; i += 1) {
        const w = rest[i];
        if (w === "-s" || (isLongOption(w, "--source") && !w.includes("="))) i += 1;
        else if (!w.startsWith("-")) paths.push(w);
      }
    }
    if (paths.length > 0) target = { kind: "paths", paths };
  } else if (id === "git-stash-discard") {
    const sub = rest.find((w) => !w.startsWith("-"));
    if (sub !== undefined && STASH_NON_SAVING.has(sub)) return null;
    const dd = afterDashDash(rest);
    const untracked = beforeDashDash(rest).some((w) => hasShort(w, "u") || hasShort(w, "a") || isLongOption(w, "--include-untracked") || isLongOption(w, "--all"));
    target = dd !== null && dd.length > 0 ? { kind: "paths", paths: dd } : { kind: "all", ...(untracked ? { untracked: true } : {}) };
  }
  return target === null ? null : withElsewhere(target, words, start);
}

/** 別の場所を指す git（`-C`・`--git-dir`・`--work-tree`）なら印を付ける。 */
function withElsewhere(target, words, start) {
  return pointsElsewhere(words, start) ? { ...target, elsewhere: true } : target;
}

/**
 * コマンドの文字列から、未コミットの変更を消しうる対象を取り出す。
 * @param {string} command
 * @param {{ exists?: (p: string) => boolean }} [deps] `git checkout <x>` の `<x>` が実在するパスかを返す
 * @returns {({ kind: "all", untracked?: true, elsewhere?: true } | { kind: "paths", paths: string[], elsewhere?: true })[]}
 */
export function discardTargets(command, { exists = () => false } = {}) {
  return findCommandsMatching(command, DISCARD_COMMANDS)
    .map((hit) => targetOf(hit, exists))
    .filter((t) => t !== null);
}

const describeTarget = (t) => (t.kind === "paths" ? t.paths.join("・") : "作業ツリー全体");

function ask(reason) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: reason } };
}

/**
 * Claude Code の PreToolUse フックの入力から、未コミットの変更を消す操作なら `ask` を返す。当たらなければ null。
 * @param {string} raw
 * @param {{ exists?: (p: string) => boolean, isDirty: (cwd: string, target: object) => Promise<"yes" | "no" | "unknown"> | "yes" | "no" | "unknown", cwd?: string }} deps
 */
export async function decideDiscardOutput(raw, { exists, isDirty, cwd: defaultCwd = process.cwd() }) {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return null; // 読めない入力は本番デプロイの判定が ask に倒している
  }
  if (input === null || typeof input !== "object" || !SHELL_TOOLS.includes(input.tool_name)) return null;
  const command = input.tool_input?.command;
  if (typeof command !== "string") return null;
  const cwd = typeof input.cwd === "string" && input.cwd !== "" ? input.cwd : defaultCwd;
  const found = discardTargets(command, { exists: exists ?? ((p) => fs.existsSync(path.resolve(cwd, p))) });
  for (const target of found) {
    const state = target.elsewhere ? "unknown" : await isDirty(cwd, target);
    if (state === "no") continue;
    const why =
      state === "yes"
        ? `${describeTarget(target)} に未コミットの変更があります。消える前にコミットするか、退避してください。`
        : `${describeTarget(target)} に未コミットの変更があるか確かめられませんでした（別の場所を指す・git が答えなかった）。`;
    return ask(`未コミットの変更を消しうる操作です: ${why}消してよいと人が決めたときだけ承認してください（docs/adr/0037）。`);
  }
  return null;
}

/** git の問い合わせの上限（ミリ秒）。 */
const GIT_TIMEOUT_MS = 5000;

/**
 * 対象に未コミットの変更があるか。本番の `isDirty`。
 * @returns {Promise<"yes" | "no" | "unknown">}
 */
export function defaultIsDirty(cwd, target) {
  const args = ["status", "--porcelain", `--untracked-files=${target.untracked ? "normal" : "no"}`];
  if (target.kind === "paths") args.push("--", ...target.paths);
  return new Promise((resolve) => {
    const child = execFile("git", args, { cwd, timeout: GIT_TIMEOUT_MS, encoding: "utf8", windowsHide: true }, (error, stdout) => {
      if (!error) return resolve(stdout.trim() === "" ? "no" : "yes");
      // 作業ツリーでない場所（git は 128 で終わる）は、消すものが無い。場所が無い・git が無い・時間切れは確かめられなかった
      if (!error.killed && error.code === 128 && fs.existsSync(cwd)) return resolve("no");
      return resolve("unknown");
    });
    child.stdin?.end();
  });
}
