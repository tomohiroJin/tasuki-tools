/**
 * `gh pr create` の直前に、閉鎖キーワードの事故を知らせる判定（#578・docs/adr/0037）。
 *
 * GitHub は PR 本文とコミットメッセージの `Closes #N`・`Fixes #N`・`Resolves #N`（`close`/`fix`/`resolve` の活用形・
 * `owner/repo#N`・ISSUE の URL も）を、マージで ISSUE を閉じる指示と読む。事故は両方向にある。
 *
 * - **効かない**: バッククォートで囲むと、GitHub はインラインコードとして扱い、閉じない（マージしても ISSUE が残る）
 * - **勝手に効く**: 説明のつもりで地の文に書くと指示になる。squash マージはブランチ上の全コミットメッセージを
 *   マージコミットの本文へ連結するので、コミットメッセージの閉鎖キーワードは PR 本文を直しても防げない
 *
 * 見るもの: コマンドの全文（`--body` の文字列とヒアドキュメントの中を含む）、`--body-file` の中身、
 * 枝のコミットメッセージ（`git log origin/main..HEAD`）。**行頭の単独の閉鎖**（`Closes #578`・`- Closes #578`）は
 * PR 本文では意図した閉鎖として通す。コミットメッセージでは、行頭でも squash の本文に連結されるので知らせる。
 * 知らせるだけで止めない（`ask`）。コミットが引けないときは、その分を飛ばす（本文の検査は続ける）。
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { findCommandsMatching, SHELL_TOOLS } from "./agent-guard.mjs";
import { PR_CREATE } from "./prior-pr-hook.mjs";

const KEYWORD = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?[ \t]+((?:https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(?:issues|pull)\/\d+)|(?:[\w.-]+\/[\w.-]+)?#\d+)/gi;

/** 閉鎖キーワードの行頭の単独（箇条書き・引用・`--body` の引用符の直後を含む）か。 */
function isStandalone(prefix) {
  const stripped = prefix.replace(/^.*(?:^|\s)(?:--body|-b)[=\s]*/, "");
  return /^[\s"'\-*>$()]*$/.test(stripped);
}

/**
 * テキストの中の、GitHub が閉鎖と読む形を探す。
 * @param {string} text
 * @param {"body" | "commit" | "title"} source `body` は行頭の単独を意図した閉鎖として除く
 * @returns {{ kind: "prose" | "code", ref: string, keyword: string, line: number }[]}
 *   `code` はバッククォートの中・コードブロックの中（GitHub は閉じない）、`prose` は閉じる指示になる地の文
 */
export function findClosingKeywords(text, source = "body") {
  const found = [];
  let fenced = false;
  text.split("\n").forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return;
    }
    for (const m of line.matchAll(KEYWORD)) {
      const prefix = line.slice(0, m.index);
      const inCode = fenced || (prefix.match(/`/g) ?? []).length % 2 === 1;
      if (!inCode && source === "body" && isStandalone(prefix)) continue;
      found.push({ kind: inCode ? "code" : "prose", ref: m[1], keyword: m[0].trim(), line: index + 1 });
    }
  });
  return found;
}

function ask(reason) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: reason } };
}

/** `--body-file X`・`--body-file=X`・`-F X` の値（標準入力 `-` は読まない）。 */
function bodyFiles(words) {
  const files = [];
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    if ((w === "--body-file" || w === "-F") && words[i + 1] !== undefined) files.push(words[i + 1]);
    else if (w.startsWith("--body-file=")) files.push(w.slice("--body-file=".length));
  }
  return files.filter((f) => f !== "-");
}

/**
 * @param {string} raw 標準入力の中身
 * @param {{ cwd?: string, readFile?: (p: string) => string | null, commitMessages?: (cwd: string) => { hash: string, message: string }[] }} [deps]
 * @returns {object | null} `ask` の出力か、何も無ければ null
 */
export function decideClosingKeywordOutput(raw, { cwd: fallback = process.cwd(), readFile = defaultReadFile, commitMessages = defaultCommitMessages } = {}) {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return null;
  }
  if (input === null || typeof input !== "object" || !SHELL_TOOLS.includes(input.tool_name)) return null;
  const command = input.tool_input?.command;
  if (typeof command !== "string") return null;
  const hits = findCommandsMatching(command, PR_CREATE);
  if (hits.length === 0) return null;
  const cwd = typeof input.cwd === "string" && input.cwd !== "" ? input.cwd : fallback;

  const lines = [];
  const describe = (f, where) =>
    f.kind === "code"
      ? `${where}: 「${f.keyword}」はバッククォートかコードブロックの中で、GitHub は閉じません。閉じたいなら外してください`
      : `${where}: 「${f.keyword}」は地の文で、マージ（squash は全コミットの本文を連結）で ${f.ref} を勝手に閉じます。言及だけなら「自動クローズの語」のように言い換えてください`;

  for (const f of findClosingKeywords(command, "body")) lines.push(describe(f, `コマンドの本文（${f.line} 行目）`));
  for (const hit of hits) {
    for (const file of bodyFiles(hit.words)) {
      let text = null;
      try {
        text = readFile(path.resolve(cwd, file));
      } catch {
        text = null;
      }
      if (text !== null) for (const f of findClosingKeywords(text, "body")) lines.push(describe(f, `${file}（${f.line} 行目）`));
    }
  }
  let commits = [];
  try {
    commits = commitMessages(cwd);
  } catch {
    commits = []; // 引けない環境では、コミットの分を飛ばす（本文の検査は続ける）
  }
  for (const c of commits) {
    for (const f of findClosingKeywords(c.message, "commit")) lines.push(describe(f, `コミット ${c.hash.slice(0, 7)} のメッセージ`));
  }
  if (lines.length === 0) return null;
  return ask(`閉鎖キーワードの事故になりうる記述があります（PR を立てる前に直せます）。\n${lines.join("\n")}\n人の確認が要ります（docs/adr/0037）。`);
}

function defaultReadFile(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/** 枝のコミット（origin/main からの分）のメッセージ。取れなければ投げる。 */
export function defaultCommitMessages(cwd) {
  const out = execFileSync("git", ["log", "origin/main..HEAD", "--max-count=200", "--format=%H%x1f%B%x1e"], {
    cwd,
    encoding: "utf8",
    timeout: 5000,
    stdio: ["ignore", "pipe", "ignore"],
  });
  return out
    .split("\x1e")
    .map((rec) => rec.replace(/^\n/, ""))
    .filter((rec) => rec.trim() !== "")
    .map((rec) => {
      const [hash, ...rest] = rec.split("\x1f");
      return { hash: hash.trim(), message: rest.join("\x1f") };
    });
}
