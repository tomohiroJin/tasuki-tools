#!/usr/bin/env node
/**
 * AI ツールの入口が正本（AGENTS.md）とずれていないかを見る検査（#483・docs/adr/0030 決定 3）。
 *
 * ## 何を見るか
 *
 * 1. **AGENTS.md の原則の見出しが、憲法の見出しと一致する**（ローマ数字・表題・順序）。
 *    `docs/adr/0002` 決定 5 は改版のたびに両者を突き合わせることを MUST としているが、
 *    これまでは人の目だけで守っていた
 * 2. **宣言した入口（{@link ENTRY_FILES}）が追跡下にあり、正本へ向き、薄い**。
 *    向け方は Markdown のリンクか、行頭の `@AGENTS.md`（Claude Code・Gemini CLI の取り込み。
 *    本文が読み込まれるので、リンクより強い）。コードブロックと HTML コメントの中は数えない。
 *    薄さは空でない行の数（{@link MAX_ENTRY_LINES} 以下）と文字数（{@link MAX_ENTRY_CHARS} 以下）で測る。
 *    入口に規則を書き始めると正本が 2 つになる（憲法 原則 VIII）
 * 3. **宣言していない入口が無い**。ツールが規則として読む置き場（{@link isEntryCandidate}）に
 *    当たる追跡下のファイルは、宣言に載っているか正本そのものでなければならない
 * 4. **スキル（{@link SKILLS_DIR}）が手順書（{@link PROCEDURES_DIR}）へ向ける薄い入口である**（#489）。
 *    手順の正本は手順書に置き、スキルは frontmatter（`name`・`description`）と、手順書へのリンクを持つ
 *    数行の本文だけにする。`SKILL.md` 以外のファイル（スクリプト・参照文書）は置かない。
 *    見方は入口（2）と同じ。リンクだけを数え、行数と文字数で薄さを測る
 *
 * ## 何を見ていないか — **「足りる」とは言わない**
 *
 * - **入口の中身の意味を読まない。** 上限の中に規則を 1 つ書けば通る。行数と文字数は歯止めであって証明ではない
 * - **ツールが入口を実際に読み込むかは見ない。** リンクは案内であって読み込みではない。
 *   取り込み（`@AGENTS.md`）を解するツールでは取り込みで書く（`docs/adr/0030` 決定 3）
 * - **AGENTS.md の本文が憲法・ADR と矛盾していないかは見ない。** 見るのは原則の見出しだけ
 * - **スキルの description が手順書の中身と合っているかは見ない。** 長さだけを測る
 * - **スキルの置き場は `.claude/skills/` だけ。** 他のツールのスキルの置き場を足したら {@link SKILLS_DIR} の扱いを広げる
 * - **候補の置き場は既知のものだけ。** 新しいツールが別の名前を読むようになったら、
 *   {@link isEntryCandidate} に足す（足し忘れは検知できない。残余として受け入れる）
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
// コードフェンスの剥がし方（CommonMark のフェンスの長さを見る）も同じ理由で取り込む。
import { CONSTITUTION_PATH, extractPrinciples, stripCodeFences } from "./audit-plan-gate.mjs";

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

/** どの階層に置いてもツールが読む名前（ファイル名で完全一致）。 */
const CANDIDATE_BASENAMES = new Set(["AGENTS.md", "AGENTS.override.md", "CLAUDE.md", "CLAUDE.local.md", "GEMINI.md"]);
/** リポジトリ直下からの置き場で決まるもの（完全一致）。 */
const CANDIDATE_PATHS = new Set([".github/copilot-instructions.md", ".cursorrules", ".windsurfrules"]);
/** 配下のどのファイルもツールが規則として読む置き場（前方一致）。 */
const CANDIDATE_DIRS = [".claude/rules/", ".cursor/rules/", ".github/instructions/"];

/**
 * 候補を絞る前の列挙。**ここは広く取り、判定は {@link isEntryCandidate} に寄せる。**
 * git の pathspec の `*` は `/` を跨ぐので、`*CLAUDE.md` は `docs/NOTCLAUDE.md` まで拾う。
 * 名前の判定をパターンに任せると、その取り違えをテストで見られない。
 */
export const ENTRY_CANDIDATE_PATTERNS = ["*.md", ".cursorrules", ".windsurfrules", ".cursor/rules/*", ".claude/rules/*", ".github/instructions/*"];

/** ツールが規則として読みうるファイルか。宣言に無いものが追跡下に現れたら落とす。 */
export function isEntryCandidate(rel) {
  return (
    CANDIDATE_BASENAMES.has(path.posix.basename(rel)) ||
    CANDIDATE_PATHS.has(rel) ||
    CANDIDATE_DIRS.some((dir) => rel.startsWith(dir))
  );
}

/** 入口の空でない行の上限。いまの入口は見出し・1 文・取り込みの 3 行まで。 */
export const MAX_ENTRY_LINES = 5;

/** 入口の文字数の上限（前後の空白を除く）。1 行に規則を詰め込む抜け道を狭める。 */
export const MAX_ENTRY_CHARS = 300;

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
  // **重複を先に名指しする。** Map は後の方で上書きするので、重複したまま突き合わせると
  // 表題の違いを見落とし、分かりにくい「順序が違います」だけが出る（#485 のレビュー）。
  const counts = new Map();
  for (const a of agents) counts.set(a.numeral, (counts.get(a.numeral) ?? 0) + 1);
  for (const [numeral, count] of counts) {
    if (count > 1) problems.push(`原則 ${numeral} が AGENTS.md に ${count} 本あります`);
  }
  if (problems.length > 0) return problems;
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
 * 入口が正本を指しているか。Markdown のリンクか、行頭の `@パス`（取り込み）のどれか 1 つで足りる。
 *
 * 行き先は入口の置き場から解く。`.github/` の下から `(AGENTS.md)` と書くと
 * `.github/AGENTS.md` を指すので、向いていないと判定する。
 * **コードブロックと HTML コメントの中は数えない。** 描画もされず読み込まれもしない（#485 のレビュー）。
 */
export function linksToSource(rel, text) {
  return linkTargets(rel, text).includes(SOURCE_PATH);
}

/**
 * 本文が向けている行き先（リポジトリ直下からのパス）。Markdown のリンクと、行頭の `@パス`（取り込み）。
 * 行き先はファイルの置き場から解く。コードブロックと HTML コメントの中は数えない。
 */
export function linkTargets(rel, text) {
  const dir = path.posix.dirname(rel);
  const visible = stripCodeFences(text).replace(/<!--[\s\S]*?-->/g, "");
  const targets = [
    ...[...visible.matchAll(/\]\(\s*([^)\s#]+)(?:#[^)\s]*)?(?:\s+"[^"]*")?\s*\)/g)].map((m) => m[1]),
    ...[...visible.matchAll(/^\s*@(\S+)\s*$/gm)].map((m) => m[1]),
  ];
  return targets.map((t) => path.posix.normalize(path.posix.join(dir, t)));
}

/** 1 つの入口を見る。 */
export function checkEntry(rel, text) {
  const problems = [];
  if (!linksToSource(rel, text)) {
    problems.push(`${rel}: ${SOURCE_PATH} へのリンクも取り込み（@AGENTS.md）もありません    ← 規則は書かず、正本へ向けてください`);
  }
  problems.push(...checkThin(rel, text, `規則は ${SOURCE_PATH} に書いてください（憲法 原則 VIII）`));
  return problems;
}

/** 空でない行の数と文字数（前後の空白を除く）が上限の中か。入口とスキルの本文で同じ物差しを使う。 */
function checkThin(rel, text, hint) {
  const problems = [];
  const lines = text.split("\n").filter((l) => l.trim() !== "").length;
  if (lines > MAX_ENTRY_LINES) {
    problems.push(`${rel}: 空でない行が ${lines} 行あります（上限 ${MAX_ENTRY_LINES} 行）    ← ${hint}`);
  }
  const chars = [...text.trim()].length;
  if (chars > MAX_ENTRY_CHARS) {
    problems.push(`${rel}: ${chars} 文字あります（上限 ${MAX_ENTRY_CHARS} 文字）    ← ${hint}`);
  }
  return problems;
}

/** スキルの置き場（Claude Code）。配下は `<名前>/SKILL.md` だけを置く。 */
export const SKILLS_DIR = ".claude/skills/";

/** 手順書の置き場。手順の正本はここで、スキルはここへ向ける（#489）。 */
export const PROCEDURES_DIR = "docs/guides/procedures/";

/**
 * スキルの description の文字数の上限。description はツールがスキルを選ぶための一文であり、
 * 手順を詰め込む場所ではない。
 */
export const MAX_SKILL_DESCRIPTION_CHARS = 200;

/** 先頭の `---` で囲まれた frontmatter を `key: value` の行として読む。無ければ null。 */
function splitFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return null;
  const fields = new Map();
  for (const line of m[1].split(/\r?\n/)) {
    const f = /^([A-Za-z_-]+):\s*(.*?)\s*$/.exec(line);
    if (f) fields.set(f[1], f[2].replace(/^(["'])(.*)\1$/, "$2"));
  }
  return { fields, body: text.slice(m[0].length) };
}

/**
 * 1 つのスキルのファイルを見る。
 *
 * @param {string} rel - リポジトリ直下からのパス（{@link SKILLS_DIR} の配下）
 * @param {string} text - ファイルの中身
 * @param {string[]} procedures - 追跡下の手順書（{@link PROCEDURES_DIR} の配下）
 */
export function checkSkill(rel, text, procedures) {
  const m = new RegExp(`^${SKILLS_DIR.replace(/\./g, "\\.")}([^/]+)/SKILL\\.md$`).exec(rel);
  if (!m) {
    return [`${rel}: スキルの置き場に SKILL.md 以外のファイルがあります    ← 手順は ${PROCEDURES_DIR} に書き、スキルは <名前>/SKILL.md だけにしてください`];
  }
  const problems = [];
  const parsed = splitFrontmatter(text);
  if (!parsed) {
    problems.push(`${rel}: frontmatter（name・description）がありません`);
  } else {
    const name = parsed.fields.get("name");
    if (name !== m[1]) problems.push(`${rel}: name「${name ?? ""}」がディレクトリ名「${m[1]}」と違います`);
    const description = parsed.fields.get("description");
    if (!description) problems.push(`${rel}: description がありません`);
    else if ([...description].length > MAX_SKILL_DESCRIPTION_CHARS) {
      problems.push(
        `${rel}: description が ${[...description].length} 文字あります（上限 ${MAX_SKILL_DESCRIPTION_CHARS} 文字）    ← 手順は ${PROCEDURES_DIR} に書いてください`,
      );
    }
  }
  const body = parsed ? parsed.body : text;
  const known = new Set(procedures);
  if (!linkTargets(rel, body).some((t) => t.startsWith(PROCEDURES_DIR) && known.has(t))) {
    problems.push(`${rel}: 本文に手順書へのリンクがありません（${PROCEDURES_DIR} の追跡下のファイル）    ← 手順は書かず、手順書へ向けてください`);
  }
  problems.push(...checkThin(rel, body, `手順は ${PROCEDURES_DIR} に書いてください（憲法 原則 VIII）`));
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
  const candidates = listTrackedFiles(REPO_ROOT, ENTRY_CANDIDATE_PATTERNS).filter(isEntryCandidate);
  // git の pathspec の `*` は `/` を跨ぐので、配下のどの階層のファイルも拾う。
  const skills = listTrackedFiles(REPO_ROOT, [`${SKILLS_DIR}*`]);
  const procedures = listTrackedFiles(REPO_ROOT, [`${PROCEDURES_DIR}*`]);

  // 走査量は成否によらず必ず出す（ADR-0014 決定 6）。
  console.log(
    `[audit-agent-entries] 走査対象: 入口 ${ENTRY_FILES.length} 件 / 候補 ${candidates.length} 件 / スキル ${skills.length} 件 / 手順書 ${procedures.length} 件 / 原則 憲法 ${constitution.length} 本・${SOURCE_PATH} ${agents.length} 本`,
  );

  // 0 件ガード（ADR-0014 決定 8）。候補には正本そのものが入るので 0 件は壊れている。
  const empty = findEmptyScanDimensions([
    { label: "入口の宣言", count: ENTRY_FILES.length },
    { label: "候補", count: candidates.length },
    { label: "憲法の原則", count: constitution.length },
    { label: `${SOURCE_PATH} の原則`, count: agents.length },
    // スキルと手順書は #489 で置いた。0 件は列挙の取り違え（置き場の改名を含む）とみなす。
    // スキルを全部やめるなら、この行と SKILLS_DIR の扱いも一緒に外す。
    { label: "スキル", count: skills.length },
    { label: "手順書", count: procedures.length },
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
  for (const rel of skills) problems.push(...checkSkill(rel, read(rel), procedures));

  if (problems.length > 0) {
    console.error(`[audit-agent-entries] AI ツールの入口が正本とずれています（${problems.length} 件）`);
    for (const p of problems) console.error(`  ${p}`);
    console.error(`  根拠: docs/adr/0030 決定 3 / docs/adr/0002 決定 5 / 憲法 原則 VIII / ${PROCEDURES_DIR}README.md`);
    process.exit(1);
  }
  console.log(
    `[audit-agent-entries] OK（入口 ${ENTRY_FILES.length} 件が ${SOURCE_PATH} へ向き、スキル ${skills.length} 件が手順書へ向き、原則 ${agents.length} 本が憲法と一致）`,
  );
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
