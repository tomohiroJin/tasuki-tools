#!/usr/bin/env node
/**
 * timer のクラス名の書き方と定義を見る検査（#321・設計正本 D1・D10・`docs/adr/0023`）。
 *
 * ## 何を見るか
 *
 *   0. **走査対象の健全性**（`docs/adr/0014`）: timer の `.tsx` / `.ts`・timer の CSS・部品層と要素層の CSS の件数が 0 なら落とす。
 *      「まだ移していないファイル」の一覧（{@link UNMIGRATED}）に、実在しないファイルと、クラス名を 1 つも書いていない
 *      ファイル（許した形のクラス名も許さない形の書き込みも 0 件で、かつ本文に `className` / `_CLASS` / 語末の `Class`
 *      の字面も無いもの）があれば落とす（古い一覧が、移したファイルを免除し続けるのを止める）
 *   1. **書き方**（一覧に無いファイルだけ）: `className` に渡してよいのは、文字列リテラル・置換の無いテンプレート・
 *      それらを枝に持つ条件式・名前が `_CLASS` で終わる表の要素・`className` という名前の値（部品の受け渡し）と、
 *      それを置換に持つテンプレートだけ。`_CLASS` で終わる表の値は文字列リテラルだけ
 *   2. **定義**（一覧に無いファイルだけ）: 1 の形から字面で取り出したクラス名は、timer の CSS か部品層に定義されている。
 *      Tailwind のクラスはどちらにも定義されないので、移したファイルに残った Tailwind のクラスもここで落ちる（計画 P8）
 *   3. **衝突**: timer の CSS が定義したクラス名は、要素層のクラス名・Tailwind のユーティリティ名と重ならない
 *      （{@link KNOWN_COLLISIONS} に理由つきで載せたものを除く。使われていない例外は落とす）
 *
 * ## 何を見ていないか —— 「足りる」とは言わない
 *
 * - `data-*` 属性の値と CSS の対応（比較の仕組みと E2E が見る・設計正本 D10）
 * - `style={{}}`
 * - 一覧に載ったファイル（移行中の免除。PR 4 で一覧は空になる）
 * - timer の画面の CSS が部品層（`.ui-*`）を持つ要素のプロパティを上書きしていないか（設計正本 D3。PR ごとに人が見る）
 * - `className` 以外の名前の属性でクラス名を渡す書き方（`class=` は React では使わない）
 *
 * 依存: postcss・postcss-selector-parser（ADR 0022 決定 7）と typescript（ルートの devDependencies）。
 * Tailwind のユーティリティ名の判定は `apps/timer-web` の `tailwindcss` を解決して使う（移行中だけ。ADR 0023・計画 P7）。
 * 設計方針: 判定は純粋関数、実 I/O と `process.exit` は `main()` の薄い配線だけに置く。
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import ts from "typescript";
import { findEmptyScanDimensions, listRepoFiles } from "./lib/scan-targets.mjs";
import { isDirectRun } from "./lib/direct-run.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * まだ移していないファイル（設計正本 D10 の 3）。**PR 2・3 で移したら消す。PR 4 で空にして、この一覧ごと消す。**
 * 一覧に載っているのにクラス名を 1 つも書いていないファイル（`className` / `_CLASS` / 語末の `Class` の字面も無いもの）は、検査が落とす。
 */
export const UNMIGRATED = [
  "apps/timer-web/src/App.tsx",
  "apps/timer-web/src/ui/History.tsx",
  "apps/timer-web/src/ui/Loading.tsx",
  "apps/timer-web/src/ui/Lobby.tsx",
  "apps/timer-web/src/ui/Session.tsx",
  "apps/timer-web/src/ui/SessionLost.tsx",
  "apps/timer-web/src/ui/Summary.tsx",
  "apps/timer-web/src/ui/presence.ts",
  "apps/timer-web/src/ui/primitives.tsx",
  "apps/timer-web/src/ui/components/CircularProgress.tsx",
  "apps/timer-web/src/ui/components/ConfirmDialog.tsx",
  "apps/timer-web/src/ui/components/EmptyHint.tsx",
  "apps/timer-web/src/ui/components/EndSessionZone.tsx",
  "apps/timer-web/src/ui/components/InvitePanel.tsx",
  "apps/timer-web/src/ui/components/Markdown.tsx",
  "apps/timer-web/src/ui/components/NotifyHint.tsx",
  "apps/timer-web/src/ui/components/NotifySettings.tsx",
  "apps/timer-web/src/ui/components/NotifySettingsPanel.tsx",
  "apps/timer-web/src/ui/components/PassphrasePanel.tsx",
  "apps/timer-web/src/ui/components/PresenceDot.tsx",
  "apps/timer-web/src/ui/components/RosterPanel.tsx",
  "apps/timer-web/src/ui/components/RotationLineup.tsx",
  "apps/timer-web/src/ui/components/SelfDriverToggle.tsx",
  "apps/timer-web/src/ui/components/SessionConfigPanel.tsx",
  "apps/timer-web/src/ui/components/SharedMemo.tsx",
  "apps/timer-web/src/ui/components/StatusStrip.tsx",
  "apps/timer-web/src/ui/components/SwitchAlert.tsx",
  "apps/timer-web/src/ui/components/Tabs.tsx",
  "apps/timer-web/src/ui/components/TeamOrbit.tsx",
  "apps/timer-web/src/ui/components/TopicCard.tsx",
];

/** Tailwind のユーティリティ名と重なることを許すクラス名（移行中だけ。PR 4 で消す）。 */
export const KNOWN_COLLISIONS = new Map([
  ["sr-only", "Tailwind 版とレイヤー外の版がそれぞれ別の宣言で効いている。PR 2 で両方の宣言の和を残す（設計正本 D2）"],
]);

/** CSS の識別子のエスケープを解く（`px-1\.5` → `px-1.5`）。 */
function unescapeIdent(s) {
  return s.replace(/\\([0-9a-fA-F]{1,6})\s?|\\([^\n])/g, (_, hex, ch) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : ch));
}

/** CSS が定義するクラス名（`@keyframes` の段は除く）。 */
export function cssClassNames(text) {
  const names = new Set();
  postcss.parse(text).walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
    selectorParser((sel) => sel.walkClasses((c) => names.add(unescapeIdent(c.value)))).processSync(rule.selector);
  });
  return names;
}

const isClassTable = (name) => /_CLASS$/.test(name);
const tokensOf = (s) => s.split(/\s+/).filter((t) => t !== "");

/** `.tsx` / `.ts` から、許した形のクラス名と、許さない形の書き込みを取り出す。 */
export function classUsagesIn(fileName, text) {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const classes = [];
  const problems = [];
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const addLiteral = (node, value) => {
    for (const name of tokensOf(value)) classes.push({ name, line: lineOf(node) });
  };
  const reject = (node, what) =>
    problems.push({ line: lineOf(node), message: `${what} は許した書き方ではありません（${ts.SyntaxKind[node.kind]}）。字面のクラス名か _CLASS の表で書く（設計正本 D1）` });

  const checkExpr = (e) => {
    if (ts.isParenthesizedExpression(e)) return checkExpr(e.expression);
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return addLiteral(e, e.text);
    if (ts.isConditionalExpression(e)) {
      checkExpr(e.whenTrue);
      checkExpr(e.whenFalse);
      return;
    }
    if ((ts.isElementAccessExpression(e) || ts.isPropertyAccessExpression(e)) && ts.isIdentifier(e.expression) && isClassTable(e.expression.text)) return;
    if (ts.isIdentifier(e) && e.text === "className") return;
    if (ts.isTemplateExpression(e)) {
      addLiteral(e, e.head.text);
      for (const span of e.templateSpans) {
        if (!(ts.isIdentifier(span.expression) && span.expression.text === "className")) reject(span.expression, "className に渡すテンプレートの置換");
        addLiteral(span, span.literal.text);
      }
      return;
    }
    reject(e, "className に渡す式");
  };

  const visit = (node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(sf) === "className") {
      const init = node.initializer;
      if (init === undefined) reject(node, "値の無い className");
      else if (ts.isStringLiteral(init)) addLiteral(init, init.text);
      else if (ts.isJsxExpression(init) && init.expression !== undefined) checkExpr(init.expression);
      else reject(init, "className の値");
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && isClassTable(node.name.text) && node.initializer !== undefined) {
      let init = node.initializer;
      while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isParenthesizedExpression(init)) init = init.expression;
      if (!ts.isObjectLiteralExpression(init)) reject(init, "_CLASS の表");
      else {
        for (const prop of init.properties) {
          if (ts.isPropertyAssignment(prop) && (ts.isStringLiteral(prop.initializer) || ts.isNoSubstitutionTemplateLiteral(prop.initializer))) {
            addLiteral(prop.initializer, prop.initializer.text);
          } else {
            reject(prop, "_CLASS の表の値");
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { classes, problems };
}

/**
 * クラス名を扱う字面があるか（`className` / `_CLASS` / 語末の `Class`）。
 * 一覧の「古い」判定で、関数でクラス名を返すファイル（`presenceDotClass` など）を誤って落とさないために使う。
 */
const mentionsClasses = (text) => /className|_CLASS|Class\b/.test(text);

/** 判定の本体（純粋関数）。 */
export function checkTimerClasses({ sources, timerCss, componentCss, elementCss, unmigrated, collisions, isTailwindUtility }) {
  const problems = [];
  const defined = new Set(timerCss.flatMap((f) => [...cssClassNames(f.text)]));
  const parts = new Set(componentCss.flatMap((f) => [...cssClassNames(f.text)]).filter((n) => n.startsWith("ui-")));
  const elementNames = new Set(elementCss.flatMap((f) => [...cssClassNames(f.text)]));
  const listed = new Set(unmigrated);
  const byRel = new Map(sources.map((s) => [s.rel, s]));

  for (const rel of unmigrated) {
    const source = byRel.get(rel);
    if (source === undefined) {
      problems.push(`[移行の一覧] ${rel} は実在しません。一覧から外す`);
      continue;
    }
    const usage = classUsagesIn(rel, source.text);
    // 関数の戻り値でクラス名を返すファイル（presence.ts）は classUsagesIn が数えないので、字面でも見る
    if (usage.classes.length === 0 && usage.problems.length === 0 && !mentionsClasses(source.text)) {
      problems.push(`[移行の一覧] ${rel} はクラス名を 1 つも書いていません。移し終えたなら一覧から外す`);
    }
  }

  for (const source of sources) {
    if (listed.has(source.rel)) continue;
    const usage = classUsagesIn(source.rel, source.text);
    for (const p of usage.problems) problems.push(`[書き方] ${source.rel}:${p.line} ${p.message}`);
    for (const c of usage.classes) {
      if (!defined.has(c.name) && !parts.has(c.name)) {
        problems.push(`[定義] ${source.rel}:${c.line} .${c.name} は timer の CSS にも部品層にも定義されていません`);
      }
    }
  }

  for (const name of defined) {
    if (elementNames.has(name)) problems.push(`[衝突] timer の CSS の .${name} は要素層のクラスと同じ名前です（設計正本 D1）`);
    if (isTailwindUtility(name) && !collisions.has(name)) {
      problems.push(`[衝突] timer の CSS の .${name} は Tailwind のユーティリティと同じ名前です。移行中は Tailwind が勝つ（設計正本 D1）`);
    }
  }
  for (const name of collisions.keys()) {
    if (!defined.has(name)) problems.push(`[衝突の例外] .${name} は timer の CSS に定義されていません。例外から外す`);
  }
  return problems;
}

/** Tailwind のユーティリティ名か（`apps/timer-web` の tailwindcss の compile() で判定する・計画 P7）。 */
export async function loadTailwindDetector(repoRoot = REPO_ROOT) {
  const require = createRequire(path.join(repoRoot, "apps/timer-web/package.json"));
  const mod = await import(pathToFileURL(require.resolve("tailwindcss")).href);
  const tw = typeof mod.compile === "function" ? mod : mod.default;
  const compiler = await tw.compile('@import "tailwindcss";', {
    base: repoRoot,
    async loadStylesheet(id) {
      const file = require.resolve(id === "tailwindcss" ? "tailwindcss/index.css" : id);
      return { path: file, base: path.dirname(file), content: fs.readFileSync(file, "utf8") };
    },
  });
  const escapeCss = (n) => n.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (name) => new RegExp(`\\.${escapeRe(escapeCss(name))}(?![\\w-])`).test(compiler.build([name]));
}

function readAll(rels) {
  return rels.map((rel) => ({ rel, text: fs.readFileSync(path.join(REPO_ROOT, rel), "utf8") }));
}

async function main() {
  const sources = readAll(listRepoFiles(REPO_ROOT, ["apps/timer-web/src/*.tsx", "apps/timer-web/src/*.ts"]));
  const timerCss = readAll(listRepoFiles(REPO_ROOT, ["apps/timer-web/src/*.css"]));
  const componentCss = readAll(listRepoFiles(REPO_ROOT, ["packages/ui/src/components/*.css"]));
  const elementCss = readAll(listRepoFiles(REPO_ROOT, ["packages/ui/src/elements/*.css"]));
  const volume = [
    { label: "timer の .tsx / .ts", count: sources.length },
    { label: "timer の CSS", count: timerCss.length },
    { label: "部品の CSS", count: componentCss.length },
    { label: "要素層の CSS", count: elementCss.length },
  ];
  console.log(`[audit-timer-classes] 走査対象: ${volume.map((v) => `${v.label} ${v.count} 件`).join(" / ")}（移行中 ${UNMIGRATED.length} 件）`);

  const problems = checkTimerClasses({
    sources,
    timerCss,
    componentCss,
    elementCss,
    unmigrated: UNMIGRATED,
    collisions: KNOWN_COLLISIONS,
    isTailwindUtility: await loadTailwindDetector(),
  });
  const empty = findEmptyScanDimensions(volume);
  if (empty.length > 0) problems.push(`[走査対象] 走査対象が 0 件です（${empty.join(" / ")}）。検査が空振りしています`);

  if (problems.length > 0) {
    console.error("[audit-timer-classes] NG");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log("[audit-timer-classes] OK（違反 0 件）");
}

// main は非同期だが正準形（entry-point-wiring.test.mjs）に合わせて await しない。拒否は未処理の拒否として exit 1 になる
if (isDirectRun(import.meta.url, process.argv[1])) main();
