/**
 * `process.exit` の使用と、`process.exitCode` の立て忘れ（`return` の書き忘れ）を構文木で見る（#540）。
 *
 * 判定だけを持つ純粋関数。どのファイルを読むかは `scripts/exit-flush.test.mjs` が持つ。
 *
 * **なぜ文字列ではなく構文木か。** 文字列探しは、文字列・正規表現の中の `/*`（`".github/workflows/*.yml"`）を
 * コメントの始まりと誤読して実コードを読み飛ばし、行末コメントや文字列の中の `process.exit(` を誤検出する。
 * 読み方は `scripts/lib/focused-skipped-tests.mjs` と同じ TypeScript の構文木。
 *
 * **なぜ見るか。** stdout / stderr がパイプのとき、`process.exit()` は書き出し途中の出力を捨てる。
 * `process.exitCode = N;` に替えた後に `return;` を書き忘れると、失敗の後も検査が続き、OK の行まで出てしまう。
 *
 * 見ないもの:
 * - 別名への代入（`const p = process; p.exit()`）・`globalThis.process.exit`（`let { exit } = globalThis.process` も）・組み立てた名前。
 * - `exitCode` の立て忘れの検査が見るのは、`main()` の中の `if` / `else if` / `try` / `catch` の連なりまで。
 *   コールバックの最後（`xs.forEach((x) => { …; process.exitCode = 1; }); console.log("OK");`）は、
 *   「そのコールバックの最後の文」として通す。`child.on("exit", (c) => { process.exitCode = c; })` のような
 *   正しい形が多く、呼び出しの先をたどって「その後に続きがあるか」を判定する価値は薄いので、たどらない。
 * - `&&=` の代入と、右辺が 0 以外かどうかの値の評価（数値リテラルの 0 だけを 0 と見る）。
 */
import ts from "typescript";

const PROCESS_MODULES = new Set(["process", "node:process"]);

function parse(source) {
  return ts.createSourceFile("x.mjs", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
}

/** 括弧を剥がす（`(process).exit`・`((process))["exit"]`）。 */
function unparen(node) {
  let n = node;
  while (ts.isParenthesizedExpression(n)) n = n.expression;
  return n;
}

function lineOf(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/** `process` を指す識別子の集合（`process` 自身と、`import proc from "node:process"` の `proc`）。 */
function processAliases(sf) {
  const names = new Set(["process"]);
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (!PROCESS_MODULES.has(st.moduleSpecifier.text)) continue;
    const clause = st.importClause;
    if (!clause) continue;
    if (clause.name) names.add(clause.name.text);
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) names.add(clause.namedBindings.name.text);
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      // import { default as proc } from "node:process"
      for (const e of clause.namedBindings.elements) if (e.propertyName?.text === "default") names.add(e.name.text);
    }
  }
  return names;
}

/** `.name` か `["name"]` / `[`name`]` の名前。取れなければ null。 */
function accessedName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node)) {
    const a = node.argumentExpression;
    if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) return a.text;
  }
  return null;
}

function isProcessMember(node, aliases, member) {
  if (!(ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))) return false;
  const target = unparen(node.expression);
  return ts.isIdentifier(target) && aliases.has(target.text) && accessedName(node) === member;
}

/**
 * `process.exit` を使っている場所。`process.exit(…)`・`process["exit"](…)`・`const { exit } = process`・
 * `import { exit } from "node:process"` と、`import proc from "node:process"` の `proc.exit`。
 * @returns {{ line: number }[]}
 */
export function findProcessExitUses(source) {
  const sf = parse(source);
  const aliases = processAliases(sf);
  const found = [];
  const visit = (node) => {
    if (isProcessMember(node, aliases, "exit")) found.push({ line: lineOf(sf, node) });
    else if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      ts.isIdentifier(unparen(node.initializer)) &&
      aliases.has(unparen(node.initializer).text) &&
      node.name.elements.some((e) => (e.propertyName ?? e.name).text === "exit")
    ) {
      found.push({ line: lineOf(sf, node) });
    } else if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      PROCESS_MODULES.has(node.moduleSpecifier.text) &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings) &&
      node.importClause.namedBindings.elements.some((e) => (e.propertyName ?? e.name).text === "exit")
    ) {
      found.push({ line: lineOf(sf, node) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found.sort((a, b) => a.line - b.line);
}

/** `=`・`||=`・`??=`。 */
const ASSIGN_KINDS = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

const FUNCTION_LIKE = (n) =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n);

/** 文 `st` を実行した後に、同じ関数の中で続きが無い（最後に実行される文）か。ループの中は続きがあるので偽。 */
function isTail(st) {
  const parent = st.parent;
  if (ts.isSourceFile(parent)) return parent.statements[parent.statements.length - 1] === st;
  if (!ts.isBlock(parent)) return false;
  if (parent.statements[parent.statements.length - 1] !== st) return false;
  const owner = parent.parent;
  if (FUNCTION_LIKE(owner)) return true;
  // if / else / try / catch / finally の中の最後の文は、それを含む文が最後のときだけ最後。
  let outer = owner;
  if (ts.isCatchClause(outer)) outer = outer.parent;
  if (ts.isTryStatement(outer) || ts.isIfStatement(outer)) {
    let stmt = outer;
    while (ts.isIfStatement(stmt.parent)) stmt = stmt.parent; // else if の連なり
    return isTail(stmt);
  }
  return false;
}

/**
 * 非 0 かもしれない `process.exitCode = …;` の文のうち、直後が `return` でも、関数の最後に実行される文でもないもの。
 * 立てた後も処理が続き、失敗なのに後続の検査や OK の行が走る。右辺が数値の 0 のものは見ない。
 * @returns {{ line: number }[]}
 */
export function findExitCodeWithoutReturn(source) {
  const sf = parse(source);
  const aliases = processAliases(sf);
  const found = [];
  const visit = (node) => {
    if (
      ts.isExpressionStatement(node) &&
      ts.isBinaryExpression(node.expression) &&
      ASSIGN_KINDS.has(node.expression.operatorToken.kind) &&
      isProcessMember(node.expression.left, aliases, "exitCode") &&
      !(ts.isNumericLiteral(node.expression.right) && Number(node.expression.right.text) === 0)
    ) {
      const siblings = ts.isBlock(node.parent) || ts.isSourceFile(node.parent) ? node.parent.statements : [];
      const next = siblings[siblings.indexOf(node) + 1];
      const ok = next ? ts.isReturnStatement(next) : isTail(node);
      if (!ok) found.push({ line: lineOf(sf, node) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found.sort((a, b) => a.line - b.line);
}
