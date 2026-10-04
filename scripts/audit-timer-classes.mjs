#!/usr/bin/env node
/**
 * timer のクラス名の書き方と定義を見る検査（#321・設計正本 D1・D10・`docs/adr/0023`）。
 *
 * ## 何を見るか
 *
 *   0. **走査対象の健全性**（`docs/adr/0014`）: timer の `.tsx` / `.ts`・timer の CSS・部品層と要素層の CSS の件数が 0 なら落とす。
 *      「まだ移していないファイル」の一覧（{@link UNMIGRATED}）に、実在しないファイルと、**一覧から外しても 1 と 2 を通る
 *      ファイル**があれば落とす（古い一覧が、移したファイルを免除し続けるのを止める）。ただし、クラス名を書く場所
 *      （`className` の属性・キー）も字面のクラス名も無く、本文に `className` / `_CLASS` / 語末の `Class` の字面だけがある
 *      ファイル（関数でクラス名を返す `.ts`）は、中身を検査できないので落とさない
 *   1. **書き方**（一覧に無いファイルだけ）: `className` の属性と、オブジェクトの `className` キー（スプレッドや
 *      `createElement` の props）に渡してよいのは、文字列リテラル・置換の無いテンプレート・それらを枝に持つ条件式・
 *      名前が `_CLASS` で終わる表の要素・`className` という名前の値（部品の受け渡し）と、それを置換に持つテンプレートだけ。
 *      - `className` という名前の束縛は、関数の最初の引数のオブジェクトの分割代入で、プロパティ名も `className` のもの
 *        （`({ className })` / `({ className = "" })` / `({ className, ...rest })`）だけ。素の引数・別名・ローカル変数・
 *        import（別名・既定・名前空間を含む）・関数の宣言と関数式の名前・クラスの名前は落とす
 *      - `className` と `_CLASS` への書き込みは、代入（複合代入を含む）・分割代入・`X_CLASS.y = …`・`++` / `--`・
 *        `for (… of …)` の左辺のどれでも落とす
 *      - `_CLASS` の表は、同じファイルの `const` の宣言（値は字面だけ）か、一覧に無い timer のファイルが `const` で
 *        宣言したものの import だけ。`let`・引数・分割代入・再代入で作る `_CLASS` と、宣言の見えない `_CLASS` は落とす
 *   2. **定義**（一覧に無いファイルだけ）: 1 の形から字面で取り出したクラス名は、timer の CSS か部品層に定義されている。
 *      Tailwind のクラスはどちらにも定義されないので、移したファイルに残った Tailwind のクラスもここで落ちる（計画 P8）
 *   3. **衝突**: timer の CSS が定義したクラス名は、要素層のクラス名・Tailwind のユーティリティ名（timer の
 *      `tailwind.config.js` で足したものを含む）と重ならない
 *      （{@link KNOWN_COLLISIONS} に理由つきで載せたものを除く。使われていない例外は落とす）。
 *      部品層の接頭辞 `ui-` で始まるクラスも定義しない（部品層に在るか無いかを問わない）
 *   4. **宣言禁止の変数**: `--timer-never-defined` は、timer の CSS・部品層・要素層のどこでも宣言しない（参照だけ許す。
 *      宣言すると、行の高さの `var(--timer-never-defined, calc(…))` を使う全箇所が黙って入れ替わる）
 *   5. **借り物のキーフレームの出どころ**: timer の CSS の `animation` / `animation-name` が名指しするキーフレームは、
 *      timer の CSS が `@keyframes` で定義するか、`UNMIGRATED` のファイルに `animate-<名前>` の字面があるか（Tailwind が出す）
 *      のどちらかでなければ落とす（出どころの `animate-*` を消した瞬間にアニメーションが黙って止まるのを防ぐ）
 *
 * ## 何を見ていないか —— 「足りる」とは言わない
 *
 * - `data-*` 属性の値と CSS の対応（比較の仕組みと E2E が見る・設計正本 D10）
 * - `style={{}}`
 * - 一覧に載ったファイルの書き方と定義（移行中の免除。PR 4 で一覧は空になる）
 * - timer の画面の CSS が部品層（`.ui-*`）を持つ要素のプロパティを上書きしていないか（設計正本 D3。PR ごとに人が見る）
 * - `className` 以外の名前の属性・props でクラス名を渡す書き方（`cls={x}` を部品の中で `className` へ渡す形。
 *   部品の中の `className={cls}` は落ちるが、部品の外の `cls={x}` の値は見ない）
 * - `.ts` の関数がクラス名を返す形。一覧に載っている間は「古い一覧」の判定からも外れ、一覧から外した後は
 *   書き方の検査にも掛からない（`className` の場所が無いため）。外すときに人が見る
 * - `{...props}` のスプレッドの中身（`className` キーを字面で持つオブジェクトリテラルだけを見る）
 * - 宣言の無い `className`（ファイルのどこにも束縛が無いまま `className={className}` と書く形。型検査が落とす）
 * - `Object.assign(T_CLASS, …)` など、関数の呼び出しを通した `_CLASS` の表への書き込み
 * - `xs.map(({ className }) => …)`。コールバックの最初の引数のオブジェクトの分割代入は、部品の props と形が同じなので許してしまう
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
 * 一覧に載っているのに、外しても書き方と定義の検査を通るファイルは、検査が「古い一覧」として落とす。
 */
export const UNMIGRATED = [
  "apps/timer-web/src/ui/Session.tsx",
  "apps/timer-web/src/ui/components/CircularProgress.tsx",
  "apps/timer-web/src/ui/components/EndSessionZone.tsx",
  "apps/timer-web/src/ui/components/NotifyHint.tsx",
  "apps/timer-web/src/ui/components/RosterPanel.tsx",
  "apps/timer-web/src/ui/components/RotationLineup.tsx",
  "apps/timer-web/src/ui/components/SelfDriverToggle.tsx",
  "apps/timer-web/src/ui/components/SharedMemo.tsx",
  "apps/timer-web/src/ui/components/SwitchAlert.tsx",
  "apps/timer-web/src/ui/components/Tabs.tsx",
  "apps/timer-web/src/ui/components/TeamOrbit.tsx",
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
/** プロパティ名・属性名の字面（識別子か文字列）。計算されたキーは undefined。 */
const propNameOf = (name) => (name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? name.text : undefined);
const unwrapTyped = (e) => {
  let cur = e;
  while (ts.isAsExpression(cur) || ts.isSatisfiesExpression(cur) || ts.isParenthesizedExpression(cur)) cur = cur.expression;
  return cur;
};
/**
 * 部品の受け渡しとして許す `className` の束縛か。関数の**最初の引数のオブジェクトの分割代入**で、プロパティ名も
 * `className` のもの（`({ className })` / `({ className = "" })` / `({ className, ...rest })`）だけ。
 * 素の引数（`.map((className) => …)`）・別名（`({ cls: className })`）・入れ子の分割代入は、部品の props 以外から
 * 値を受け取れるので許さない。
 */
const isComponentClassNameProp = (node) => {
  if (!ts.isBindingElement(node) || node.dotDotDotToken !== undefined) return false;
  if (node.propertyName !== undefined && propNameOf(node.propertyName) !== "className") return false;
  const pattern = node.parent;
  if (!ts.isObjectBindingPattern(pattern) || !ts.isParameter(pattern.parent)) return false;
  const param = pattern.parent;
  return ts.isFunctionLike(param.parent) && param.parent.parameters.indexOf(param) === 0;
};

/** 代入の左辺（分割代入のパターンを含む）が書き込む名前と、`X.y` / `X[...]` の根の名前を集める。 */
function assignedNames(target, out = []) {
  const t = unwrapTyped(target);
  if (ts.isIdentifier(t)) out.push(t.text);
  else if (ts.isPropertyAccessExpression(t) || ts.isElementAccessExpression(t)) {
    let root = t.expression;
    while (ts.isPropertyAccessExpression(root) || ts.isElementAccessExpression(root) || ts.isParenthesizedExpression(root)) root = root.expression;
    if (ts.isIdentifier(root)) out.push(root.text);
  } else if (ts.isArrayLiteralExpression(t)) {
    for (const el of t.elements) assignedNames(el, out);
  } else if (ts.isObjectLiteralExpression(t)) {
    for (const prop of t.properties) {
      if (ts.isShorthandPropertyAssignment(prop)) out.push(prop.name.text);
      else if (ts.isPropertyAssignment(prop)) assignedNames(prop.initializer, out);
      else if (ts.isSpreadAssignment(prop)) assignedNames(prop.expression, out);
    }
  } else if (ts.isSpreadElement(t)) assignedNames(t.expression, out);
  else if (ts.isBinaryExpression(t) && t.operatorToken.kind === ts.SyntaxKind.EqualsToken) assignedNames(t.left, out); // 既定値つきの要素
  return out;
}
const isGuardedName = (name) => name === "className" || isClassTable(name);
const isAssignmentOperator = (kind) => kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;

/**
 * `.tsx` / `.ts` から、許した形のクラス名と、許さない形の書き込みを取り出す。
 *
 * - `classes`: 字面で取り出したクラス名（定義の検査に回す）
 * - `problems`: 許さない書き方
 * - `classNameSites`: `className` の属性とオブジェクトの `className` キーの数（クラス名を書く場所の数）
 * - `tableImports`: import した `_CLASS` の表（`{ local, imported, from, line }`）。宣言した側の検査は {@link checkTimerClasses} が引く
 * - `tableExports`: このファイルが `const` で宣言した `_CLASS` の表の名前
 */
export function classUsagesIn(fileName, text) {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const classes = [];
  const problems = [];
  const tableImports = [];
  const tableExports = new Set();
  const tableRefs = [];
  // 名前が _CLASS の束縛（許さない形も含む）。許さない束縛は宣言の側で 1 度だけ落とし、引く側では重ねない
  const tableBindings = new Set();
  const reportedWrites = new Set();
  let classNameSites = 0;
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
    if ((ts.isElementAccessExpression(e) || ts.isPropertyAccessExpression(e)) && ts.isIdentifier(e.expression) && isClassTable(e.expression.text)) {
      tableRefs.push(e.expression);
      return;
    }
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

  /** `const X_CLASS = { … }` の値は字面だけ。 */
  const checkTable = (decl) => {
    const init = decl.initializer === undefined ? undefined : unwrapTyped(decl.initializer);
    if (init === undefined || !ts.isObjectLiteralExpression(init)) return reject(init ?? decl, "_CLASS の表");
    for (const prop of init.properties) {
      if (ts.isPropertyAssignment(prop) && (ts.isStringLiteral(prop.initializer) || ts.isNoSubstitutionTemplateLiteral(prop.initializer))) {
        addLiteral(prop.initializer, prop.initializer.text);
      } else {
        reject(prop, "_CLASS の表の値");
      }
    }
  };

  /** 名前が `className` / `_CLASS` の束縛（宣言・引数・分割代入）。 */
  const checkBinding = (node, name) => {
    if (name === "className") {
      // 部品の受け渡し（最初の引数のオブジェクトの分割代入）だけを許す。既定値は字面に限る
      if (!isComponentClassNameProp(node)) return reject(node, "部品の props の分割代入以外で className を束縛する書き方");
      if (node.initializer !== undefined) checkExpr(node.initializer);
      return;
    }
    if (!isClassTable(name)) return;
    tableBindings.add(name);
    const isConstDecl =
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.Const) !== 0;
    if (!isConstDecl) return reject(node, "_CLASS の表を const の宣言以外で作る書き方");
    tableExports.add(name);
    checkTable(node);
  };

  const visit = (node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(sf) === "className") {
      classNameSites += 1;
      const init = node.initializer;
      if (init === undefined) reject(node, "値の無い className");
      else if (ts.isStringLiteral(init)) addLiteral(init, init.text);
      else if (ts.isJsxExpression(init) && init.expression !== undefined) checkExpr(init.expression);
      else reject(init, "className の値");
    }
    // オブジェクトの className キー（スプレッドの `{...{ className: x }}`・createElement の props）も同じ形に限る
    if (ts.isPropertyAssignment(node) && propNameOf(node.name) === "className") {
      classNameSites += 1;
      checkExpr(node.initializer);
    }
    if (ts.isShorthandPropertyAssignment(node) && node.name.text === "className") classNameSites += 1;
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node)) && ts.isIdentifier(node.name)) checkBinding(node, node.name.text);
    if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) checkBinding(node, node.name.text);
    // className という名前を import・関数・クラスで作る形（部品の props 以外から値が来る）。`_CLASS` の import は下で引く
    if (
      (ts.isImportSpecifier(node) || ts.isImportClause(node) || ts.isNamespaceImport(node) ||
        ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node)) &&
      node.name !== undefined && node.name.text === "className"
    ) {
      reject(node, "import・関数・クラスで className という名前を作る書き方");
    }
    // 書き込み（複合代入・分割代入・`X_CLASS.y = …`・`++` / `--`・`for (x of …)` の左辺）
    const writeTarget =
      ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind)
        ? node.left
        : (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
            (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)
          ? node.operand
          : (ts.isForOfStatement(node) || ts.isForInStatement(node)) && !ts.isVariableDeclarationList(node.initializer)
            ? node.initializer
            : undefined;
    if (writeTarget !== undefined) {
      // 分割代入の既定値（`[className = x] = …`）は内側の `=` でも拾うので、同じ書き込みを 1 度だけ数える
      for (const name of new Set(assignedNames(writeTarget).filter(isGuardedName))) {
        const key = `${lineOf(node)}:${name}`;
        if (reportedWrites.has(key)) continue;
        reportedWrites.add(key);
        reject(node, `${name} への書き込み`);
      }
    }
    if (ts.isImportSpecifier(node) && isClassTable(node.name.text) && ts.isStringLiteral(node.parent.parent.parent.moduleSpecifier)) {
      tableImports.push({
        local: node.name.text,
        imported: (node.propertyName ?? node.name).text,
        from: node.parent.parent.parent.moduleSpecifier.text,
        line: lineOf(node),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // 引いた _CLASS の表は、同じファイルの const の宣言か import に限る
  const imported = new Set(tableImports.map((i) => i.local));
  for (const ref of tableRefs) {
    if (!tableBindings.has(ref.text) && !imported.has(ref.text)) reject(ref, `宣言の無い _CLASS の表（${ref.text}）を引く書き方`);
  }
  return { classes, problems, classNameSites, tableImports, tableExports };
}

/**
 * クラス名を扱う字面があるか（`className` / `_CLASS` / 語末の `Class`）。
 * 一覧の「古い」判定で、関数でクラス名を返すファイルを誤って落とさないために使う。
 */
const mentionsClasses = (text) => /className|_CLASS|Class\b/.test(text);

/** import の指定子を timer のファイルへ解く（相対パスだけ。拡張子は省略・明示の両方）。 */
function resolveImport(fromRel, specifier, byRel) {
  if (!specifier.startsWith(".")) return undefined;
  const base = path.posix.join(path.posix.dirname(fromRel), specifier);
  const stem = base.replace(/\.(js|jsx|ts|tsx)$/, "");
  return [base, `${stem}.ts`, `${stem}.tsx`, `${stem}/index.ts`, `${stem}/index.tsx`].find((rel) => byRel.has(rel));
}

/** CSS 全域キーワード。名前ではない。 */
const CSS_WIDE_KEYWORDS = new Set(["inherit", "initial", "unset", "revert", "revert-layer"]);
/** `animation` の短縮形で名前以外の語（時間・イージング・回数・向き・fill・再生状態）。 */
const ANIMATION_NON_NAME = new Set([
  "ease", "ease-in", "ease-out", "ease-in-out", "linear", "step-start", "step-end",
  "infinite", "normal", "reverse", "alternate", "alternate-reverse",
  "none", "forwards", "backwards", "both", "running", "paused",
]);

/** 括弧の外のカンマ（または空白）で分ける。 */
function splitTopLevel(text, sep) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    const isSep = depth === 0 && (sep === "," ? ch === "," : /\s/.test(ch));
    if (isSep) {
      if (cur.trim() !== "") out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim() !== "") out.push(cur.trim());
  return out;
}

/** `animation` / `animation-name` の値が名指しするキーフレームの名前（`none`・全域キーワード・`var()` は除く）。 */
export function animationNamesOf(prop, value) {
  const names = [];
  for (const layer of splitTopLevel(value, ",")) {
    const tokens = prop === "animation-name" ? [layer] : splitTopLevel(layer, " ");
    for (const t of tokens) {
      const lower = t.toLowerCase();
      if (CSS_WIDE_KEYWORDS.has(lower) || ANIMATION_NON_NAME.has(lower)) continue;
      if (t.includes("(")) continue; // cubic-bezier() / steps() / var() など
      if (/^[+-]?(\d|\.\d)/.test(t)) continue; // 時間・回数
      names.push(t);
    }
  }
  return names;
}

/** 判定の本体（純粋関数）。 */
export function checkTimerClasses({ sources, timerCss, componentCss, elementCss, unmigrated, collisions, isTailwindUtility }) {
  const problems = [];
  const defined = new Set(timerCss.flatMap((f) => [...cssClassNames(f.text)]));
  const parts = new Set(componentCss.flatMap((f) => [...cssClassNames(f.text)]).filter((n) => n.startsWith("ui-")));
  const elementNames = new Set(elementCss.flatMap((f) => [...cssClassNames(f.text)]));
  const listed = new Set(unmigrated);
  const byRel = new Map(sources.map((s) => [s.rel, s]));
  const usages = new Map(sources.map((s) => [s.rel, classUsagesIn(s.rel, s.text)]));

  /** 書き方と定義の違反（一覧に無いファイルとして見たとき）。 */
  const fileProblems = (rel) => {
    const usage = usages.get(rel);
    const out = usage.problems.map((p) => `[書き方] ${rel}:${p.line} ${p.message}`);
    // import した _CLASS の表は、宣言した側が一覧に無い timer のファイルなら値を検査済みなので許す
    for (const imp of usage.tableImports) {
      const target = resolveImport(rel, imp.from, byRel);
      if (target === undefined || listed.has(target) || !usages.get(target).tableExports.has(imp.imported)) {
        out.push(`[書き方] ${rel}:${imp.line} import した ${imp.local} は、一覧に無い timer のファイルが const で宣言した _CLASS の表ではありません（値を検査できない）`);
      }
    }
    for (const c of usage.classes) {
      if (!defined.has(c.name) && !parts.has(c.name)) {
        out.push(`[定義] ${rel}:${c.line} .${c.name} は timer の CSS にも部品層にも定義されていません`);
      }
    }
    return out;
  };

  for (const rel of unmigrated) {
    if (!byRel.has(rel)) {
      problems.push(`[移行の一覧] ${rel} は実在しません。一覧から外す`);
      continue;
    }
    // 一覧に載ったファイルにも検査を試しに当て、外しても通るなら「古い」と落とす。
    // クラス名を書く場所が無く `Class` の字面だけがあるファイル（関数でクラス名を返す `.ts`）は、
    // 検査が中身を見られないので外せない —— 落とさない
    const usage = usages.get(rel);
    const writesClasses = usage.classes.length > 0 || usage.classNameSites > 0;
    if (fileProblems(rel).length === 0 && (writesClasses || !mentionsClasses(byRel.get(rel).text))) {
      problems.push(`[移行の一覧] ${rel} は一覧から外しても検査を通ります。移し終えたなら一覧から外す`);
    }
  }

  for (const source of sources) {
    if (listed.has(source.rel)) continue;
    problems.push(...fileProblems(source.rel));
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
  // `--timer-never-defined` は「決して宣言しない」変数（行の高さの calc を最小化で畳ませないための代替値の入れ物・
  // `styles/status-strip.css` の注釈）。参照は許し、宣言（どこかの祖先や `:root` を含む）は落とす
  for (const f of [...timerCss, ...componentCss, ...elementCss]) {
    let declared = false;
    const root = postcss.parse(f.text);
    root.walkDecls((d) => {
      if (d.prop === "--timer-never-defined") declared = true;
    });
    // `@property --timer-never-defined { … }` の登録も宣言と同じ（initial-value が var の代替値より勝つ）
    // at-rule の名前は大文字小文字を区別しない（`@PROPERTY` でもブラウザは登録する）。変数名は区別する
    root.walkAtRules((r) => {
      if (r.name.toLowerCase() === "property" && r.params.trim() === "--timer-never-defined") declared = true;
    });
    if (declared) problems.push(`[宣言禁止] ${f.rel} が --timer-never-defined を宣言しています。参照（var の代替値）だけ許します`);
  }
  // 借り物のキーフレームの出どころ。`animation` / `animation-name` が名指しするキーフレームは、timer の CSS が
  // `@keyframes` を持つか、まだ移していないファイルの `animate-<名前>`（Tailwind が `@keyframes` を出す）が出どころでなければならない。
  // 後者だけが出どころのとき、そのファイルを移して `animate-<名前>` が消えると、アニメーションが黙って止まる
  const keyframesDefined = new Set();
  for (const f of timerCss) {
    postcss.parse(f.text).walkAtRules((r) => {
      if (r.name.toLowerCase().endsWith("keyframes")) keyframesDefined.add(r.params.trim());
    });
  }
  const borrowed = new Map();
  for (const f of timerCss) {
    postcss.parse(f.text).walkDecls((d) => {
      const prop = d.prop.toLowerCase();
      if (prop !== "animation" && prop !== "animation-name") return;
      for (const name of animationNamesOf(prop, d.value)) if (!borrowed.has(name)) borrowed.set(name, f.rel);
    });
  }
  for (const [name, rel] of borrowed) {
    if (keyframesDefined.has(name)) continue;
    const re = new RegExp(`(?<![\\w-])animate-${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`);
    const origin = sources.some((src) => listed.has(src.rel) && re.test(src.text));
    if (!origin) {
      problems.push(`[キーフレーム] 借り物のキーフレームの出どころが消えた: ${name}（${rel} が使っています。timer の CSS に @keyframes を置く）`);
    }
  }
  // 接頭辞 `ui-` は部品層のもの。timer の CSS が定義すると、部品を定義し直す（読み込み順で部品に勝つ・設計正本 D3）
  for (const name of defined) {
    if (name.startsWith("ui-")) problems.push(`[衝突] timer の CSS の .${name} は部品層の接頭辞 ui- のクラスです。部品を定義し直さない（設計正本 D3）`);
  }
  return problems;
}

/**
 * Tailwind のユーティリティ名か（`apps/timer-web` の tailwindcss の compile() で判定する・計画 P7）。
 *
 * timer の `index.css` と同じテーマで判定するため、`apps/timer-web` を基点に `@config '../tailwind.config.js'` 相当
 * （`@config "./tailwind.config.js"`）を読む。読まないと設定で足したユーティリティ（`bg-presence-online` など）を
 * 「Tailwind ではない」と返し、timer の CSS が同名のクラスを定義しても衝突を見逃す。
 *
 * `compiler.build()` は呼ぶたびに候補が溜まり、出力は累積になる（`hover:underline` の後では `.hover` が字面に現れる）。
 * そのため「この名前を足して出力が増え、かつその名前のセレクタが増えたか」で判定し、結果は名前ごとに覚える。
 */
export async function loadTailwindDetector(repoRoot = REPO_ROOT) {
  const appDir = path.join(repoRoot, "apps/timer-web");
  const require = createRequire(path.join(appDir, "package.json"));
  const mod = await import(pathToFileURL(require.resolve("tailwindcss")).href);
  const tw = typeof mod.compile === "function" ? mod : mod.default;
  const resolveFrom = (id, base) => (id.startsWith(".") ? path.resolve(base, id) : require.resolve(id === "tailwindcss" ? "tailwindcss/index.css" : id));
  const compiler = await tw.compile('@import "tailwindcss";\n@config "./tailwind.config.js";\n', {
    base: appDir,
    async loadStylesheet(id, base) {
      const file = resolveFrom(id, base);
      return { path: file, base: path.dirname(file), content: fs.readFileSync(file, "utf8") };
    },
    async loadModule(id, base) {
      const file = resolveFrom(id, base);
      const loaded = await import(pathToFileURL(file).href);
      return { path: file, base: path.dirname(file), module: loaded.default ?? loaded };
    },
  });
  const escapeCss = (n) => n.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const memo = new Map();
  let previous = compiler.build([]);
  return (name) => {
    if (memo.has(name)) return memo.get(name);
    const selector = new RegExp(`\\.${escapeRe(escapeCss(name))}(?![\\w-])`, "g");
    const before = (previous.match(selector) ?? []).length;
    const next = compiler.build([name]);
    const isUtility = next !== previous && (next.match(selector) ?? []).length > before;
    previous = next;
    memo.set(name, isUtility);
    return isUtility;
  };
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
