#!/usr/bin/env node
/**
 * 部品層の写しと規則を見る検査（#320・設計正本 §5・`docs/adr/0022` 決定 6）。
 *
 * ## 何を見るか
 *
 *   0. **走査対象の健全性**（`docs/adr/0014` 決定 1・8）: web アプリの宣言（{@link WEB_APPS}）と
 *      `vite.config.ts` の実在から導いた実体を照合する。スタイルのファイルは `apps/*` と `packages/*` の
 *      追跡下から導出し、`.css` 以外の拡張子があれば落とす。アプリごと・部品層の件数が 0 なら落とす
 *   1. **画面の CSS**（トークン層と部品層を除く全部。要素層を含む）:
 *      - 入力欄の型（`select` / `input` / `textarea` / `option`）か `::picker(` を含むセレクタの規則は落とす
 *      - 部品の入力欄（`.ui-input` / `.ui-select`）に字の大きさを書いたら落とす（16px の下限）
 *      - どちらも直前の `/* ui-exempt: 理由 *\/` で外せる。理由が空・何も免除していない申告は落とす
 *   2. **部品の CSS**（`packages/ui/src/components/`）: セレクタは `.ui-` のクラスから始める・入れ子と
 *      `@scope` / `@layer` を使わない・`::picker(` を一覧に同居させない・`outline` は選択肢だけ・
 *      つまみ（`--*`）を宣言しない・生の色を書かない。**申告では外せない**
 *   3. **死んだ部品**: 部品の CSS に定義した `.ui-*` を、2 つ以上のアプリの `src` 配下の `.tsx` が使う
 *
 * ## 何を見ていないか —— 「足りる」とは言わない
 *
 * - **クラス名で書いた写し**（`.hub-input` の形・帯・一言・パネルなど）。CSS だけからは、そのクラスを
 *   どの要素に当てるか分からない。レビューと `packages/ui/README.md` が担う（ADR 0022 決定 6）
 * - `index.html` の `<style>` と `style` 属性、TSX の `style={{}}`、Tailwind のクラス（設計正本 D8 の残る穴）
 * - 属性だけのセレクタ（`[type='text']`）。型を名指ししない書き方は、画面の CSS では見逃す
 * - **属性セレクタで部品を名指しする書き方**（`[class~=ui-input] { font-size: … }`）は D10 の 2 を素通りする
 *   （{@link screenRuleViolations} の `onPart` はクラス選択子だけを見る）
 *
 * 設計方針: 判定は純粋関数、実 I/O と `process.exit` は `main()` の薄い配線だけに置く。
 * **依存は postcss と postcss-selector-parser だけ**（ADR 0022 決定 7。scripts の「追加依存は禁止」の例外）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import { diffTargets, findEmptyScanDimensions, listRepoFiles } from "./lib/scan-targets.mjs";
import { isDirectRun } from "./lib/direct-run.mjs";
import { listWebAppDirs } from "./audit-web-sync-boundary.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** web アプリの宣言。実体（`vite.config.ts` の実在）と全単射で照合する。 */
export const WEB_APPS = ["apps/landing", "apps/poker-web", "apps/timer-web", "apps/topic-web"];

/** 部品層。ここは「画面の CSS」から外し、部品の規則で見る。 */
export const COMPONENTS_DIR = "packages/ui/src/components/";
/** トークン層。変数と `@font-face` だけなので、どちらの規則でも見ない（stylelint が要素・クラスを禁じている）。 */
const TOKENS_DIR = "packages/ui/src/tokens/";

/** 共有部品のある要素の型。`label` は入れない（要素層の `label` があり、画面ごとの配置で触る）。 */
const FIELD_TYPES = new Set(["select", "input", "textarea", "option"]);
/** 字の大きさを画面に上書きさせない部品のクラス（16px の下限）。 */
const FIELD_PART_CLASSES = new Set(["ui-input", "ui-select"]);

/** `.css` 以外のスタイルの拡張子。Vite はこれらもそのまま扱うので、見えないまま写しが入る。 */
const FOREIGN_STYLE = /\.(pcss|postcss|scss|sass|less|styl|stylus|sss)$/i;

/**
 * 識別子の CSS エスケープを解く。`s\65lect` は `select` と同じ型を選ぶ。
 * postcss-selector-parser が解いた値を返す版もあるので、2 度通しても変わらない形にしてある。
 */
export function unescapeIdent(s) {
  return s.replace(/\\([0-9a-fA-F]{1,6})\s?|\\([^\n])/g, (_, hex, ch) =>
    hex ? String.fromCodePoint(parseInt(hex, 16)) : ch,
  );
}

function parseSelector(selector) {
  return selectorParser().astSync(selector);
}

/**
 * セレクタのどこかに入力欄の型か `::picker(` があるか。
 *
 * **`walk` は擬似クラスの引数の中まで降りる**ので、`:is(select)`・`:where()`・`:not()`・`:has()`・
 * `:global()` を 1 つの仕組みで拾える。型は大文字小文字を区別せず、エスケープを解いて比べる
 * （HTML の型名は大文字小文字を区別しない）。
 */
export function touchesFieldElement(selector) {
  let hit = false;
  parseSelector(selector).walk((node) => {
    if (node.type === "tag" && FIELD_TYPES.has(unescapeIdent(node.value).toLowerCase())) hit = true;
    if (node.type === "pseudo" && node.value.toLowerCase().startsWith("::picker")) hit = true;
  });
  return hit;
}

/** セレクタに現れるクラス名（エスケープを解いたもの）。 */
export function classesOf(selector) {
  const out = new Set();
  parseSelector(selector).walkClasses((c) => out.add(unescapeIdent(c.value)));
  return out;
}

/**
 * 直近の祖先 rule。`@media` 等のアットルールは飾りなので飛ばして辿る（設計正本 D10 の 1）。
 * 祖先が rule を挟まずに root へ着けば `null`（`&` を解決する相手が無い＝トップレベル）。
 */
function parentRuleOf(node) {
  const p = node.parent;
  if (!p || p.type === "root") return null;
  if (p.type === "rule") return p;
  return parentRuleOf(p);
}

/**
 * rule の解決済みセレクタ一覧。
 *
 * **`&` を祖先の解決済みセレクタへ置換してから判定する**（設計正本 D10 の 1）。`&` を持たない子は
 * 子孫結合（`親 子`）として繋ぐ。祖先が無ければ自分のセレクタそのまま。**親のセレクタが一覧
 * （`a, b { … }`）なら、組み合わせを全部作る**（`.a, .b { & x {} }` は `.a x` と `.b x` の両方）。
 */
function resolvedSelectorsOf(rule) {
  const parent = parentRuleOf(rule);
  if (!parent) return rule.selectors;
  const parentResolved = resolvedSelectorsOf(parent);
  const out = [];
  for (const own of rule.selectors) {
    for (const p of parentResolved) {
      out.push(own.includes("&") ? own.split("&").join(p) : `${p} ${own}`);
    }
  }
  return out;
}

/**
 * 祖先に `@scope` があり、その引数（`(…)` の中身。`to (…)` を含む全部）のどれかが入力欄の型に
 * 当たるか（設計正本 D10 の 1・レビュー指摘）。当たった引数を返す（無ければ `undefined`）。
 *
 * `@scope (select) { :scope { … } }` は `:scope` 自身が `select` を指す。`@scope (.x) to (input) { … }`
 * のような終端の引数も同じ仕組みで見る（終端は範囲を狭める側だが、過小検出より過剰検出を選ぶ）。
 */
function scopeTouchOf(node) {
  let p = node.parent;
  while (p) {
    if (p.type === "atrule" && /^scope$/i.test(p.name)) {
      const args = [...p.params.matchAll(/\(([^()]*)\)/g)].map((m) => m[1]);
      for (const arg of args) {
        try {
          if (touchesFieldElement(arg)) return arg.trim();
        } catch {
          // 解析できない引数（構文が読めない）は無視する。落とすのは検出できた側だけ。
        }
      }
    }
    p = p.parent;
  }
  return undefined;
}

/** 追跡下のスタイルのファイルを、画面の CSS・部品の CSS・`.css` 以外に仕分ける。 */
export function classifyStyleFiles(rels) {
  const screen = [];
  const components = [];
  const foreign = [];
  for (const rel of [...rels].sort()) {
    if (FOREIGN_STYLE.test(rel)) foreign.push(rel);
    else if (!/\.css$/i.test(rel)) continue;
    else if (rel.startsWith(COMPONENTS_DIR)) components.push(rel);
    else if (!rel.startsWith(TOKENS_DIR)) screen.push(rel);
  }
  return { screen, components, foreign };
}

const EXEMPT_RE = /^ui-exempt:([\s\S]*)$/;

/** 規則の直前の申告の理由。申告が無ければ `undefined`、理由が空なら `""`。 */
function exemptReasonOf(rule) {
  const prev = rule.prev();
  if (!prev || prev.type !== "comment") return undefined;
  const m = EXEMPT_RE.exec(prev.text.trim());
  return m ? m[1].trim() : undefined;
}

function where(file, node) {
  return { file, line: node.source?.start?.line ?? 0 };
}

/** `@keyframes` の中の規則か。`from` / `50%` はセレクタではないので、セレクタの解析器へ渡さない。 */
function inKeyframes(rule) {
  return rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name);
}

/**
 * rule 自身の宣言。**別の規則を挟まずにアットルール（`@media` / `@supports` 等）の中にある宣言も、
 * その規則自身の宣言として数える**（fix round 2・重要 1）。子の規則（`rule` 型）は自分自身で
 * 判定するので、そこへは降りない（二重に数えない）。
 */
function ownDeclarationsOf(node) {
  const out = [];
  for (const child of node.nodes ?? []) {
    if (child.type === "decl") out.push(child);
    else if (child.type === "atrule") out.push(...ownDeclarationsOf(child));
  }
  return out;
}

/**
 * 画面の CSS の 1 つの規則が破っている事柄（申告を見る前）。
 *
 * **判定は解決済みセレクタ（{@link resolvedSelectorsOf}）で行う**（設計正本 D10 の 1）。
 * `rule.selectors`（自分自身の綴りだけ）で見ると、`.ui-input { &:focus { font-size: … } }` や
 * `select { &:hover { … } }` のような入れ子が、`&` の中身を子自身が持たないという理由だけで
 * 素通りする（レビュー指摘・重要 1・2）。
 */
function screenRuleViolations(rule) {
  const found = [];
  const resolved = resolvedSelectorsOf(rule);
  const touched = resolved.find(touchesFieldElement);
  const scopeTouch = touched === undefined ? scopeTouchOf(rule) : undefined;
  if (touched !== undefined) {
    found.push(`入力欄の型か ::picker( を含むセレクタで見た目を書いています: ${touched}    ← 部品（.ui-input / .ui-select）を当てるか、直前に /* ui-exempt: 理由 */ を書く`);
  } else if (scopeTouch !== undefined) {
    found.push(`祖先の @scope (${scopeTouch}) が入力欄の型に当たるので、この中の規則も見た目を書いています: ${rule.selector}    ← 部品を当てるか、直前に /* ui-exempt: 理由 */ を書く`);
  }
  const onPart = resolved.some((s) => [...classesOf(s)].some((c) => FIELD_PART_CLASSES.has(c)));
  const setsSize = ownDeclarationsOf(rule).some((n) => /^font(-size)?$/i.test(n.prop));
  if (onPart && setsSize) {
    found.push(`部品の入力欄の字の大きさを上書きしています（16px の下限を崩す）: ${rule.selector}`);
  }
  return found;
}

/** 画面の CSS を見る。返り値が空なら違反なし。 */
export function checkScreenCss(file, css) {
  const root = postcss.parse(css, { from: file });
  const problems = [];
  const usedExempts = new Set();
  root.walkRules((rule) => {
    if (inKeyframes(rule)) return;
    const violations = screenRuleViolations(rule);
    if (violations.length === 0) return;
    const reason = exemptReasonOf(rule);
    if (reason === undefined || reason === "") {
      for (const message of violations) problems.push({ ...where(file, rule), message });
    }
    if (reason !== undefined) usedExempts.add(rule.prev());
    if (reason === "") problems.push({ ...where(file, rule), message: "ui-exempt: の理由が空です" });
  });
  root.walkComments((comment) => {
    if (!EXEMPT_RE.test(comment.text.trim()) || usedExempts.has(comment)) return;
    problems.push({ ...where(file, comment), message: "何も免除していない ui-exempt: です    ← 直したなら消す" });
  });
  return problems;
}

/**
 * CSS の名前の色（CSS Color 4 の 148 語）とシステムの色。**生の色を列挙で禁じるのではなく、
 * 色の直書きの綴りを全部拾うための辞書**である。仕様が固定しているので腐らない。
 */
const NAMED_COLORS = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood
  cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray
  darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
  darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue
  firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew
  hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
  lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
  lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue
  mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred
  midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
  palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple
  rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue
  slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white
  whitesmoke yellow yellowgreen
  canvas canvastext linktext visitedtext activetext buttonface buttontext buttonborder field fieldtext highlight
  highlighttext selecteditem selecteditemtext mark marktext graytext accentcolor accentcolortext`
    .split(/\s+/)
    .filter(Boolean),
);

/**
 * 値に含まれる色の直書き。**書いてよいのは `var(--…)`・`transparent`・`currentColor`・`inherit` などと、
 * それらを引数にした `color-mix()` だけ**（設計正本 D10 の 3）。
 *
 * カスタムプロパティの名前（`--gold` など）は色の名前と綴りが重なるので先に消す。**`var()` ごと消しては
 * ならない** —— 第 2 引数に書いた生の色（`var(--a, #fff)`）まで消えてしまう。
 */
export function findRawColors(value) {
  const v = value
    .replace(/"[^"]*"|'[^']*'/g, " ")
    .replace(/url\([^)]*\)/gi, " ")
    .replace(/--[A-Za-z0-9_-]+/g, " ");
  const found = [];
  for (const m of v.matchAll(/#[0-9a-f]{3,8}(?![0-9a-z_-])/gi)) found.push(m[0]);
  for (const m of v.matchAll(/(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/gi)) found.push(`${m[1]}(`);
  for (const m of v.matchAll(/(?<![\w-])[a-z]+(?![\w-])/gi)) {
    if (NAMED_COLORS.has(m[0].toLowerCase())) found.push(m[0]);
  }
  return found;
}

/** セレクタの先頭の複合セレクタ（最初の結合子の手前まで）に `.ui-` のクラスがあるか。 */
function firstCompoundHasPart(selector) {
  const [sel] = parseSelector(selector).nodes;
  for (const node of sel.nodes) {
    if (node.type === "combinator") return false;
    if (node.type === "class" && unescapeIdent(node.value).startsWith("ui-")) return true;
  }
  return false;
}

/** セレクタの最後の複合セレクタに `option` の型があるか。 */
function lastCompoundIsOption(selector) {
  const [sel] = parseSelector(selector).nodes;
  let isOption = false;
  for (const node of sel.nodes) {
    if (node.type === "combinator") isOption = false;
    if (node.type === "tag" && unescapeIdent(node.value).toLowerCase() === "option") isOption = true;
  }
  return isOption;
}

/** 部品の CSS を見る。返り値が空なら違反なし。**申告（ui-exempt）は部品の CSS では効かない。** */
export function checkComponentCss(file, css) {
  const root = postcss.parse(css, { from: file });
  const problems = [];
  const report = (node, message) => problems.push({ ...where(file, node), message });
  root.walkAtRules((at) => {
    if (/^(scope|layer)$/i.test(at.name)) report(at, `@${at.name} を使わない（設計正本 D5・D11）`);
  });
  root.walkRules((rule) => {
    if (inKeyframes(rule)) return;
    if (rule.parent?.type === "rule") {
      report(rule, `入れ子にしない（セレクタの先頭を検査できない）: ${rule.selector}`);
      return;
    }
    for (const s of rule.selectors) {
      if (!firstCompoundHasPart(s)) report(rule, `セレクタの先頭が .ui- のクラスではありません（全アプリへ漏れる）: ${s}`);
    }
    if (rule.selectors.length > 1 && rule.selectors.some((s) => /::picker\(/i.test(s))) {
      report(rule, `::picker( を含むセレクタを一覧に同居させない（知らないブラウザが規則ごと捨てる）: ${rule.selector}`);
    }
    const optionOnly = rule.selectors.every(lastCompoundIsOption);
    // walkDecls ではなく ownDeclarationsOf を使う（子の規則は入れ子として別に落ちるので、
    // ここでその宣言まで拾うと二重に数える）。
    for (const d of ownDeclarationsOf(rule)) {
      if (d.prop.startsWith("--")) report(d, `部品の中でつまみを宣言しない（画面の上書きが継承に負ける）: ${d.prop}`);
      if (/^outline/i.test(d.prop) && !optionOnly) report(d, `部品に outline を書かない（要素層のリングを打ち消す）: ${rule.selector}`);
      const raw = findRawColors(d.value);
      if (raw.length > 0) report(d, `生の色を書かない（トークンを使う）: ${d.prop}: ${d.value}`);
    }
  });
  return problems;
}

/** 部品の CSS に定義した `.ui-` のクラス。 */
export function definedPartClasses(css) {
  const out = new Set();
  postcss.parse(css).walkRules((rule) => {
    if (inKeyframes(rule)) return;
    for (const s of rule.selectors) for (const c of classesOf(s)) if (c.startsWith("ui-")) out.add(c);
  });
  return out;
}

/** TSX の本文に現れる `ui-` で始まる語。`x-ui-input` のような語の途中は拾わない。 */
export function uiTokensIn(text) {
  return new Set([...text.matchAll(/(?<![\w-])ui-[a-z0-9]+(?:-{1,2}[a-z0-9]+)*/g)].map((m) => m[0]));
}

/** 2 つ以上のアプリが使っていない部品のクラス（ADR 0022 決定 2・#280 の死んだ CSS の経緯）。 */
export function findDeadParts(defined, usageByApp) {
  const users = (c) => [...usageByApp.values()].filter((s) => s.has(c)).length;
  return [...defined].filter((c) => users(c) < 2).sort();
}

/**
 * 追跡下（と未追跡かつ gitignore 対象外）のスタイルのファイル。`**` は使わない（`*` が `/` を跨ぐ）。
 *
 * pathspec に `:(icase)` を付け、大文字の拡張子（`c.SCSS` など）も列挙に乗せる
 * （`listRepoFiles` は pathspec をそのまま `git ls-files` へ渡すので、ここで付けるだけで効く）。
 */
function listStyleFiles() {
  const exts = ["css", "pcss", "postcss", "scss", "sass", "less", "styl", "stylus", "sss"];
  return listRepoFiles(
    REPO_ROOT,
    ["apps", "packages"].flatMap((dir) => exts.map((ext) => `:(icase)${dir}/*.${ext}`)),
  );
}

function readExisting(rels, problems) {
  const out = [];
  for (const rel of rels) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) {
      problems.push(`[走査対象の実体] ${rel} が見つかりません（git の追跡下だが作業ツリーに無い）    ← 復元するか git rm する`);
      continue;
    }
    out.push({ rel, text: fs.readFileSync(abs, "utf8") });
  }
  return out;
}

function parseOrReport(fn, file, text, problems) {
  try {
    return fn(file, text);
  } catch (e) {
    // 読めないファイルを飛ばすと、そこに書いた写しは永久に見えない。落とす。
    problems.push(`[構文] ${file} を解析できません: ${e.message}`);
    return [];
  }
}

function main() {
  const problems = [];
  const volume = [];

  const drift = diffTargets(WEB_APPS, listWebAppDirs());
  for (const m of drift.missing) problems.push(`[宣言と実体のずれ] 宣言した web アプリが見つかりません: ${m}`);
  for (const u of drift.unexpected) problems.push(`[宣言と実体のずれ] 実在する web アプリが WEB_APPS に宣言されていません: ${u}`);

  const { screen, components, foreign } = classifyStyleFiles(listStyleFiles());
  for (const f of foreign) problems.push(`[拡張子] ${f} は .css ではありません。この検査が読めないので .css にする`);

  const screenFiles = readExisting(screen, problems);
  for (const app of WEB_APPS) {
    volume.push({ label: `${app} の CSS`, count: screenFiles.filter((f) => f.rel.startsWith(`${app}/`)).length });
  }
  volume.push({ label: "packages の画面の CSS", count: screenFiles.filter((f) => f.rel.startsWith("packages/")).length });

  for (const f of screenFiles) {
    for (const p of parseOrReport(checkScreenCss, f.rel, f.text, problems)) {
      problems.push(`[画面の CSS] ${p.file}:${p.line} ${p.message}`);
    }
  }

  // 部品の CSS。index.css（まとめ読み）も走査するので、0 件なら部品層が消えている。
  const componentFiles = readExisting(components, problems);
  volume.push({ label: "部品の CSS", count: componentFiles.length });
  const defined = new Set();
  for (const f of componentFiles) {
    for (const p of parseOrReport(checkComponentCss, f.rel, f.text, problems)) {
      problems.push(`[部品の CSS] ${p.file}:${p.line} ${p.message}`);
    }
    for (const c of parseOrReport((_, t) => [...definedPartClasses(t)], f.rel, f.text, problems)) defined.add(c);
  }

  // 死んだ部品。各アプリの src 配下の .tsx に現れる ui- の語を数える。
  const usageByApp = new Map();
  for (const app of WEB_APPS) {
    const tsx = readExisting(listRepoFiles(REPO_ROOT, [`${app}/src/*.tsx`]), problems);
    volume.push({ label: `${app} の TSX`, count: tsx.length });
    usageByApp.set(app, new Set(tsx.flatMap((f) => [...uiTokensIn(f.text)])));
  }
  for (const c of findDeadParts(defined, usageByApp)) {
    problems.push(`[死んだ部品] .${c} を使うアプリが 2 つ未満です    ← 2 画面以上に当てるか、部品層から消す（ADR 0022 決定 2）`);
  }

  console.log(`[audit-ui-components] 走査対象: ${volume.map((v) => `${v.label} ${v.count} 件`).join(" / ")}`);
  const empty = findEmptyScanDimensions(volume);
  if (empty.length > 0) problems.push(`[走査対象] 走査対象が 0 件です（${empty.join(" / ")}）。検査が空振りしています`);

  if (problems.length > 0) {
    console.error("[audit-ui-components] NG");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log("[audit-ui-components] OK（違反 0 件）");
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
