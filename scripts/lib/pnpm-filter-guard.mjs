/**
 * `pnpm --filter <名前>` の名前が、workspace のどのパッケージにも当たらないときに聞く判定（#578・docs/adr/0037）。
 *
 * pnpm は、filter が 0 件に当たっても**成功（exit 0）で終わる**ことがある。実在しない名前（`@tasuki/tasuki-sync`。
 * 正しくは `@tasuki/sync`）を渡すと、テストが 1 本も走らないのに緑になる。そこで走らせる前に、名前を workspace と突き合わせる。
 *
 * - 照合は pnpm 11 で確かめた規則: 完全一致、スコープ無しの名前は `@*\/名前` にも当たる、`*` を含めば全文への glob
 *   （`sync*` は `@tasuki/sync` に当たらない）、`...`・`^`・`!` は依存の印と除外なので外して見る。
 *   `./dir`・`{dir}`・`[git ref]` は名前でないので当てに行かない（通す）
 * - workspace は `pnpm-workspace.yaml` の `packages:` の glob（`dir/*` と `dir`）を展開して、各 `package.json` の `name` を読む
 * - 一覧を引けないとき（workspace が見つからない）は通す。pnpm 自身が失敗する
 * - 歯止めであって壁ではない: `package.json` の scripts の中の `pnpm --filter` は読まない。`pnpm exec turbo run … --filter=…`・`pnpm turbo …` のように pnpm を経て turbo へ渡る `--filter` も pnpm の規則で照合する（turbo の文法とは違うので、名前が合わなければ聞く側に倒れる。実害のある誤検知は見つかっていない）
 */
import fs from "node:fs";
import path from "node:path";
import { findCommandsMatching, SHELL_TOOLS, beforeDashDash } from "./agent-guard.mjs";

const PNPM = [{ id: "pnpm", program: "pnpm", args: [], argOpts: [] }];

/**
 * コマンドの文字列に含まれる pnpm の `--filter` の値（`--filter X`・`--filter=X`・`-F X`・`--filter-prod X`）。
 * pnpm の語より後ろの、`--` より前だけを見る。
 */
export function filterPatterns(command) {
  const patterns = [];
  for (const hit of findCommandsMatching(command, PNPM)) {
    const head = hit.words.findIndex((w) => path.posix.basename(w) === "pnpm");
    const words = beforeDashDash(hit.words.slice(head + 1));
    for (let i = 0; i < words.length; i += 1) {
      const w = words[i];
      if (w === "--filter" || w === "--filter-prod" || w === "-F") {
        if (words[i + 1] !== undefined) patterns.push(words[i + 1]);
        i += 1;
      } else if (/^-F.+/.test(w) && !w.startsWith("--")) patterns.push(w.slice(2).replace(/^=/, ""));
      else if (w.startsWith("--filter=")) patterns.push(w.slice("--filter=".length));
      else if (w.startsWith("--filter-prod=")) patterns.push(w.slice("--filter-prod=".length));
    }
  }
  return patterns;
}

/** 依存の印（`...` と `^`）を外した名前の部分。 */
const core = (pattern) => pattern.replace(/^\.\.\.\^?/, "").replace(/\.\.\.$/, "").replace(/\^$/, "");

/** 名前の一覧のどれかに当たるか。名前でない形（除外・パス・git の参照）は当てに行かず true（通す）。 */
export function patternMatchesAny(pattern, names) {
  const p = core(pattern);
  if (p === "" || p.startsWith("!") || p.startsWith(".") || p.startsWith("{") || p.includes("[")) return true;
  if (p.includes("*")) {
    const re = new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
    return names.some((n) => re.test(n));
  }
  if (p.startsWith("@")) return names.includes(p);
  return names.some((n) => n === p || n.replace(/^@[^/]+\//, "") === p);
}

/** `pnpm-workspace.yaml` の `packages:` の項目（クォートを外した glob）。 */
function workspaceGlobs(text) {
  const globs = [];
  let inPackages = false;
  for (const line of text.split("\n")) {
    if (/^packages\s*:/.test(line)) inPackages = true;
    else if (/^\S/.test(line) && !/^-/.test(line)) inPackages = false;
    else if (inPackages) {
      const m = /^\s*-\s*["']?([^"'#]+?)["']?\s*(?:#.*)?$/.exec(line);
      if (m) globs.push(m[1]);
    }
  }
  return globs;
}

const readName = (dir) => {
  try {
    const name = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).name;
    return typeof name === "string" ? name : null;
  } catch {
    return null;
  }
};

/**
 * `cwd` から上へ `pnpm-workspace.yaml` を探し、workspace のパッケージ名（ルート自身を含む）を返す。見つからなければ null。
 * glob は `dir/*`（直下の各ディレクトリ）と `dir`（そのもの）だけ読む。
 */
export function readWorkspaceNames(cwd) {
  let dir = path.resolve(cwd);
  for (;;) {
    const file = path.join(dir, "pnpm-workspace.yaml");
    if (fs.existsSync(file)) {
      const names = [readName(dir)];
      const globs = workspaceGlobs(fs.readFileSync(file, "utf8"));
      // 展開の仕方を知らない形（`**`・除外 `!`・途中の `*`）があれば、名前の一覧を言い切れない
      if (globs.some((g) => g.startsWith("!") || (g.includes("*") && !/^[^*]+\/\*$/.test(g)))) return null;
      for (const glob of globs) {
        if (glob.endsWith("/*")) {
          const base = path.join(dir, glob.slice(0, -2));
          let entries = [];
          try {
            entries = fs.readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory());
          } catch {
            // 無いディレクトリは空として扱う
          }
          for (const e of entries) names.push(readName(path.join(base, e.name)));
        } else if (!glob.includes("*")) names.push(readName(path.join(dir, glob)));
      }
      return names.filter((n) => n !== null);
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function ask(reason) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: reason } };
}

/**
 * Claude Code の PreToolUse フックの入力から、どこにも当たらない `pnpm --filter` なら `ask` を返す。当たらなければ null。
 * @param {string} raw
 * @param {{ names?: string[] | null | ((cwd: string) => string[] | null) }} [deps] 名前の一覧（テストは配列か関数を渡す）
 */
export function decidePnpmFilterOutput(raw, { names = readWorkspaceNames } = {}) {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return null;
  }
  if (input === null || typeof input !== "object" || !SHELL_TOOLS.includes(input.tool_name)) return null;
  const command = input.tool_input?.command;
  if (typeof command !== "string") return null;
  const patterns = filterPatterns(command);
  if (patterns.length === 0) return null;
  const cwd = typeof input.cwd === "string" && input.cwd !== "" ? input.cwd : process.cwd();
  const all = Array.isArray(names) ? names : names(cwd);
  if (all === null) return null;
  const missing = patterns.filter((p) => !patternMatchesAny(p, all));
  if (missing.length === 0) return null;
  const hints = (p) => {
    const tail = core(p).replace(/^@[^/]+\//, "").replace(/^tasuki-/, "");
    return all.filter((n) => tail !== "" && n.includes(tail)).slice(0, 5);
  };
  const lines = missing.map((p) => `指定「${p}」に当たるパッケージがありません${hints(p).length > 0 ? `（近い名前: ${hints(p).join("・")}）` : ""}`);
  return ask(
    `pnpm --filter が、どのパッケージにも当たりません。pnpm は 0 件でも成功で終わるので、何も走らずに緑になります。${lines.join("。")}。名前は package.json の name で確かめてください（docs/adr/0037）。`,
  );
}
