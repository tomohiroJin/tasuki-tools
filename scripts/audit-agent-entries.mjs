#!/usr/bin/env node
/**
 * AI ツールの入口が正本（AGENTS.md）とずれていないかを見る検査（#483・docs/adr/0030 決定 3）。
 *
 * ## 何を見るか
 *
 * 1. **AGENTS.md の原則の見出しが、憲法の見出しと一致する**（ローマ数字・表題・順序）。
 *    `docs/adr/0002` 決定 5 は改版のたびに両者を突き合わせることを MUST としているが、
 *    これまでは人の目だけで守っていた
 * 2. **宣言した入口（{@link ENTRY_FILES}）が追跡下にあり、正本へリンクで向き、薄い**。
 *    薄さは空でない行の数（{@link MAX_ENTRY_LINES} 以下）で測る。入口に規則を書き始めると
 *    正本が 2 つになる（憲法 原則 VIII）
 * 3. **宣言していない入口が無い**。ツールが読むファイル名（{@link ENTRY_CANDIDATE_PATTERNS}）に
 *    当たる追跡下のファイルは、宣言に載っているか正本そのものでなければならない
 *
 * ## 何を見ていないか — **「足りる」とは言わない**
 *
 * - **入口の中身の意味を読まない。** 5 行以内に規則を 1 つ書けば通る。行数は歯止めであって証明ではない
 * - **AGENTS.md の本文が憲法・ADR と矛盾していないかは見ない。** 見るのは原則の見出しだけ
 * - **候補のファイル名は既知のものだけ。** 新しいツールが別の名前を読むようになったら、
 *   {@link ENTRY_CANDIDATE_PATTERNS} に足す（足し忘れは検知できない。残余として受け入れる）
 *
 * 設計方針: 判定は純粋関数、実 I/O と `process.exit` は `main()` の薄い配線だけに置く。
 * 追加依存は禁止。
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { listTrackedFiles, findEmptyScanDimensions } from "./lib/scan-targets.mjs";
import { isDirectRun } from "./lib/direct-run.mjs";
// 憲法の見出しの読み方は audit-plan-gate.mjs を正本にする（写すと 2 つの検査で読み方がずれうる）。
import { CONSTITUTION_PATH, extractPrinciples } from "./audit-plan-gate.mjs";

/** AI 向けの規則の正本。 */
export const SOURCE_PATH = "AGENTS.md";

/**
 * 正本へ向ける薄い入口。**足すときは、そのツールが AGENTS.md を直接読まないことを確かめてから。**
 * 直接読むツール（Cursor・Codex など）のためにファイルを足すと、入口が増えるだけになる。
 */
export const ENTRY_FILES = [
  { path: "CLAUDE.md", tool: "Claude Code" },
  { path: "GEMINI.md", tool: "Gemini CLI" },
  { path: ".github/copilot-instructions.md", tool: "GitHub Copilot" },
];

/**
 * ツールが読みうるファイル名。宣言に無いものが追跡下に現れたら落とす。
 * git の pathspec の `*` は `/` を跨ぐので、`*CLAUDE.md` は下の階層の `CLAUDE.md` も拾う。
 */
export const ENTRY_CANDIDATE_PATTERNS = [
  "*AGENTS.md",
  "*CLAUDE.md",
  "*GEMINI.md",
  ".github/copilot-instructions.md",
  ".github/instructions/*",
  ".cursorrules",
  ".cursor/rules/*",
  ".windsurfrules",
];

/** 入口の空でない行の上限。いまの入口は見出しと 1 文の 2 行。 */
export const MAX_ENTRY_LINES = 5;

/**
 * AGENTS.md の「絶対規則」節の直下にある `- I. 表題` の箇条書きを読む。
 *
 * 節は次の見出し（レベルを問わない）で終わる。`### AI 運用規則` の箇条書きを
 * 原則と取り違えないため。**0 件を返しうる**（節の見出しが変わったとき）。
 */
export function extractAgentsPrinciples(text) {
  const principles = [];
  let inSection = false;
  for (const line of text.split("\n")) {
    if (/^#{1,6}\s/.test(line)) {
      inSection = /^##\s+絶対規則\s*$/.test(line);
      continue;
    }
    if (!inSection) continue;
    const m = /^-\s+([IVXLC]+)\.\s+(.+?)\s*$/.exec(line);
    if (m) principles.push({ numeral: m[1], title: m[2] });
  }
  return principles;
}

/** 憲法と AGENTS.md の原則を突き合わせ、問題の文言を返す。 */
export function comparePrinciples(constitution, agents) {
  const problems = [];
  const agentsBy = new Map(agents.map((p) => [p.numeral, p]));
  const constitutionBy = new Map(constitution.map((p) => [p.numeral, p]));
  for (const p of constitution) {
    const a = agentsBy.get(p.numeral);
    if (!a) problems.push(`原則 ${p.numeral}「${p.title}」が AGENTS.md にありません`);
    else if (a.title !== p.title) {
      problems.push(`原則 ${p.numeral} の表題が違います: AGENTS.md「${a.title}」/ 憲法「${p.title}」`);
    }
  }
  for (const a of agents) {
    if (!constitutionBy.has(a.numeral)) problems.push(`原則 ${a.numeral}「${a.title}」は憲法にありません`);
  }
  if (problems.length === 0) {
    const order = (list) => list.map((p) => p.numeral).join(" ");
    if (order(constitution) !== order(agents)) {
      problems.push(`原則の順序が違います: AGENTS.md「${order(agents)}」/ 憲法「${order(constitution)}」`);
    }
  }
  return problems;
}

/**
 * 入口のどれかの Markdown リンクが正本を指しているか。
 *
 * リンク先は入口の置き場から解く。`.github/` の下から `(AGENTS.md)` と書くと
 * `.github/AGENTS.md` を指すので、向いていないと判定する。
 */
export function linksToSource(rel, text) {
  const dir = path.posix.dirname(rel);
  for (const m of text.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) {
    if (path.posix.normalize(path.posix.join(dir, m[1])) === SOURCE_PATH) return true;
  }
  return false;
}

/** 1 つの入口を見る。 */
export function checkEntry(rel, text) {
  const problems = [];
  if (!linksToSource(rel, text)) {
    problems.push(`${rel}: ${SOURCE_PATH} へのリンクがありません    ← 規則は書かず、正本へ向けてください`);
  }
  const lines = text.split("\n").filter((l) => l.trim() !== "").length;
  if (lines > MAX_ENTRY_LINES) {
    problems.push(
      `${rel}: 空でない行が ${lines} 行あります（上限 ${MAX_ENTRY_LINES} 行）    ← 規則は ${SOURCE_PATH} に書いてください（憲法 原則 VIII）`,
    );
  }
  return problems;
}

/** 候補のうち、宣言にも正本にも当たらないもの。 */
export function findUndeclaredEntries(trackedCandidates, entries) {
  const declared = new Set(entries.map((e) => e.path));
  return trackedCandidates.filter((rel) => rel !== SOURCE_PATH && !declared.has(rel));
}

const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

function main() {
  const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
  const constitution = extractPrinciples(read(CONSTITUTION_PATH));
  const agents = extractAgentsPrinciples(read(SOURCE_PATH));
  const candidates = listTrackedFiles(REPO_ROOT, ENTRY_CANDIDATE_PATTERNS);

  // 走査量は成否によらず必ず出す（ADR-0014 決定 6）。
  console.log(
    `[audit-agent-entries] 走査対象: 入口 ${ENTRY_FILES.length} 件 / 候補 ${candidates.length} 件 / 原則 憲法 ${constitution.length} 本・${SOURCE_PATH} ${agents.length} 本`,
  );

  // 0 件ガード（ADR-0014 決定 8）。候補には正本そのものが入るので 0 件は壊れている。
  const empty = findEmptyScanDimensions([
    { label: "入口の宣言", count: ENTRY_FILES.length },
    { label: "候補", count: candidates.length },
    { label: "憲法の原則", count: constitution.length },
    { label: `${SOURCE_PATH} の原則`, count: agents.length },
  ]);
  if (empty.length > 0) {
    console.error(`[audit-agent-entries] 走査対象が 0 件です（${empty.join(" / ")}）。検査が空振りしています`);
    process.exit(1);
  }

  const problems = comparePrinciples(constitution, agents).map((p) => `${SOURCE_PATH}: ${p}`);
  const tracked = new Set(listTrackedFiles(REPO_ROOT, ENTRY_FILES.map((e) => e.path)));
  for (const entry of ENTRY_FILES) {
    if (!tracked.has(entry.path)) {
      problems.push(`${entry.path}: 宣言した入口（${entry.tool}）が追跡下にありません`);
      continue;
    }
    problems.push(...checkEntry(entry.path, read(entry.path)));
  }
  for (const rel of findUndeclaredEntries(candidates, ENTRY_FILES)) {
    problems.push(`${rel}: 宣言されていない入口です    ← 消すか、ENTRY_FILES に足して薄い入口にしてください`);
  }

  if (problems.length > 0) {
    console.error(`[audit-agent-entries] AI ツールの入口が正本とずれています（${problems.length} 件）`);
    for (const p of problems) console.error(`  ${p}`);
    console.error(`  根拠: docs/adr/0030 決定 3 / docs/adr/0002 決定 5 / 憲法 原則 VIII`);
    process.exit(1);
  }
  console.log(`[audit-agent-entries] OK（入口 ${ENTRY_FILES.length} 件が ${SOURCE_PATH} へ向き、原則 ${agents.length} 本が憲法と一致）`);
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
