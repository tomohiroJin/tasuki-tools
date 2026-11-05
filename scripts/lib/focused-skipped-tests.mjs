/**
 * テストの `.only` と、理由の無い `.skip` / `.skipIf` / `.runIf` / `.todo` / `.fixme`（#523）。
 *
 * 判定だけを持つ純粋関数。走査の対象（どのファイルを読むか）と終了コードは
 * `scripts/audit-test-focus.mjs` の `main()` が持つ。
 *
 * **文字列ではなく TypeScript の構文木で見る。** 文字列やコメントの中の `.only`、
 * `agenda.skip(...)` や `driver.skip` のようにコマンド名・メソッド名として現れるものは
 * 見ない。見るのは「テストを定義する関数（`it` / `test` / `describe` / `suite`）から
 * 始まる呼び出しの連なり」の中の名前だけである。vitest・bun・`node:test`・Playwright は
 * どれもこの形（`it.only`・`test.describe.only`・`describe.skipIf(c)(…)` など）なので、
 * 同じ検査で覆える。
 *
 * - `.only` は理由があっても止める（1 つ残ると、同じファイルの他のテストが黙って流れなくなる）。
 * - `.skip` / `.skipIf` / `.runIf` / `.todo` / `.fixme` は、直上の**理由のコメント**が無ければ止める。
 *   形は `// 理由: …`（`/* 理由: … *\/` も可）。呼び出しを含む文の直前に、空行を挟まず置く。
 * - `node:test` のオプション（`it("…", { skip: "…" })`・`{ todo: true }`・`{ only: true }`）も同じ扱い。
 *
 * 名前で見る型の限界: 同じ名前の別の束縛（`const test = /a/; test.skip`）も、テストの定義と区別せず止める
 * （テストのファイルの中では稀）。
 *
 * 見ないもの（文書に書いてある限界）: テストの文脈（`ctx.skip()`・`t.test.only`・子テストのオプション
 * `t.test('c', { only: true })`）・別名で取り込んだ関数（`const t = test; t.only(...)`）・分割代入
 * （`const { only } = it`）・`globalThis.it.only`・組み立てた名前（`it['on'+'ly']`）・変数やスプレッドで渡す
 * `node:test` のオプション。
 * 実行中に飛ばす書き方や値が静的に決まらないものは、テスト定義の構文では区別できない。
 */
import ts from "typescript";

/** テストを定義する関数の名前。連なりの根（最も左の識別子）がこれのときだけ見る。 */
export const TEST_API_ROOTS = ["it", "test", "describe", "suite"];

/**
 * 理由のコメントを要する名前。飛ばす・条件で走らせる・予定だけ置く書き方すべて。
 * `if` / `todoIf` は bun:test の条件つき（`test.if(cond)(…)`・`test.todoIf(cond)(…)`）。
 */
export const SKIP_NAMES = ["skip", "skipIf", "runIf", "todo", "fixme", "if", "todoIf"];

/** 理由があっても止める名前。 */
export const FOCUS_NAMES = ["only"];

/**
 * 理由のコメントの形。**コメントの行の頭**が `理由:`（全角コロンも可）で、後ろに**文字か数字**（`\p{L}`・`\p{N}`）が
 * 1 つ以上要る。`理由: -`・`理由: ...` のような記号だけの中身は理由と認めない。
 * 行の途中の「理由:」（`// この理由: a は別`・`// 外す理由: 未定`）は理由と認めない。
 * `//`・`/* *\/`・`/** *\/` と、ブロックコメントの各行頭の `*` は、比べる前に外す。
 */
export const REASON_RE = /^理由[:：].*[\p{L}\p{N}]/u;

/** コメントの塊から、記号を外した行の一覧を取る。 */
function commentLines(text) {
  return text.split("\n").map((l) =>
    l.replace(/[\s*]*\*\/\s*$/, "").replace(/^\s*(?:\/\/+|\/\*+|\*+)?\s*/, ""),
  );
}

/** 塊のどこかの行が理由の形か。 */
export function hasReasonComment(text) {
  return commentLines(text).some((l) => REASON_RE.test(l));
}

function scriptKindOf(file) {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".mjs") || file.endsWith(".js") || file.endsWith(".cjs")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/** 連なり（`a.b(c).d`）の根の識別子名。識別子で終わらなければ null。 */
function chainRoot(expr) {
  let e = expr;
  for (;;) {
    if (ts.isIdentifier(e)) return e.text;
    if (
      ts.isPropertyAccessExpression(e) ||
      ts.isElementAccessExpression(e) ||
      ts.isCallExpression(e) ||
      ts.isNonNullExpression(e) ||
      ts.isAsExpression(e) ||
      ts.isTypeAssertionExpression(e) ||
      ts.isSatisfiesExpression(e) ||
      ts.isParenthesizedExpression(e)
    ) {
      e = e.expression;
      continue;
    }
    return null;
  }
}

/** `x.name` / `x["name"]` の名前。静的に決まらなければ null。 */
function accessedName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (
    ts.isElementAccessExpression(node) &&
    node.argumentExpression &&
    ts.isStringLiteralLike(node.argumentExpression)
  ) {
    return node.argumentExpression.text;
  }
  return null;
}

/**
 * 属する文（その親が文の並びを持つ最初の祖先）。
 * **式の本体を持つアロー関数（`() => it.skip(…)`）はそこで止める。** 越えて外の文まで上がると、
 * 外の文の上の理由が中の skip の理由として通り、中の式の上の理由は見えなくなる。
 */
function enclosingStatement(node) {
  let n = node;
  while (n.parent && !(ts.isArrowFunction(n.parent) && n.parent.body === n) && !ts.isSourceFile(n.parent) && !ts.isBlock(n.parent) && !ts.isModuleBlock(n.parent) && !ts.isCaseClause(n.parent) && !ts.isDefaultClause(n.parent)) {
    n = n.parent;
  }
  return n;
}

/**
 * 文の直前に連続するコメントのうち、空行を挟まず並ぶ塊の本文。
 * 文と塊の間、塊の中のコメント同士の間に空行があれば、そこで切る。
 */
function adjacentCommentText(source, statement) {
  const ranges = ts.getLeadingCommentRanges(source, statement.getFullStart()) ?? [];
  const parts = [];
  let boundary = statement.getStart();
  for (let i = ranges.length - 1; i >= 0; i--) {
    const gap = source.slice(ranges[i].end, boundary);
    if ((gap.match(/\n/g) ?? []).length > 1) break;
    parts.unshift(source.slice(ranges[i].pos, ranges[i].end));
    boundary = ranges[i].pos;
  }
  return parts.join("\n");
}

/** プロパティ名（`skip`・`'skip'`・`['skip']`）。静的に決まらなければ null。 */
function propertyNameOf(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) return name.expression.text;
  return null;
}

/** 飛ばさない値（`false`・`null`・`undefined`・`0`・空文字列）。それ以外（変数や式を含む）は飛ばす側に倒す。 */
function isInertOptionValue(v) {
  return (
    v.kind === ts.SyntaxKind.FalseKeyword ||
    v.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(v) && v.text === "undefined") ||
    (ts.isNumericLiteral(v) && Number(v.text) === 0) ||
    (ts.isStringLiteralLike(v) && v.text === "")
  );
}

/**
 * `it("…", { skip: … })` の形のオプション。値が飛ばさない値でない `skip` / `todo` / `only` を返す。
 * **見るのはテストを定義する呼び出しだけ**: 第 1 引数が名前（オブジェクトでない）ものに限る。
 * `test.extend({ only: … })`・`test.use({ skip: … })` のように第 1 引数がオブジェクトのものは、
 * fixture や設定の名前であってテストのオプションではない。
 */
function optionFindings(call) {
  const out = [];
  const first = call.arguments[0];
  if (!first || ts.isObjectLiteralExpression(first)) return out;
  for (const arg of call.arguments.slice(1)) {
    if (!ts.isObjectLiteralExpression(arg)) continue;
    for (const prop of arg.properties) {
      if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) continue;
      const name = propertyNameOf(prop.name);
      if (name !== "skip" && name !== "todo" && name !== "only") continue;
      const value = ts.isPropertyAssignment(prop) ? prop.initializer : null;
      if (value && isInertOptionValue(value)) continue;
      out.push({ node: prop, name });
    }
  }
  return out;
}

/**
 * 1 つのファイルの違反を返す（純粋）。
 *
 * @param file リポジトリ相対パス（拡張子で構文の種類を決める）
 * @param source ソース
 * @returns `{ file, line, kind, text }[]`。`kind` は `"only"`（止める）か `"no-reason"`（理由が無い）
 */
export function findFocusedOrSkippedTests(file, source) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKindOf(file));
  const found = [];
  const report = (node, name, statement) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    if (FOCUS_NAMES.includes(name)) {
      found.push({ file, line, kind: "only", text: `.${name}` });
      return;
    }
    if (!hasReasonComment(adjacentCommentText(source, statement))) {
      found.push({ file, line, kind: "no-reason", text: `.${name}` });
    }
  };

  const visit = (node) => {
    const name = accessedName(node);
    if (name !== null && (FOCUS_NAMES.includes(name) || SKIP_NAMES.includes(name))) {
      const root = chainRoot(node.expression);
      if (root !== null && TEST_API_ROOTS.includes(root)) report(node, name, enclosingStatement(node));
    }
    if (ts.isCallExpression(node)) {
      const root = chainRoot(node.expression);
      if (root !== null && TEST_API_ROOTS.includes(root)) {
        for (const f of optionFindings(node)) report(f.node, f.name, enclosingStatement(node));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/**
 * 問題の一覧（純粋）。問題が無ければ空配列。
 *
 * @param testFiles `Map<リポジトリ相対パス, ソース>`
 */
export function checkFocusedOrSkippedTests(testFiles) {
  const problems = [];
  for (const [file, source] of [...testFiles].sort(([a], [b]) => (a < b ? -1 : 1))) {
    for (const f of findFocusedOrSkippedTests(file, source)) {
      problems.push(
        f.kind === "only"
          ? `${f.file}:${f.line} ${f.text} が残っています（1 つ残ると同じファイルの他のテストが黙って流れなくなります。外してください）`
          : `${f.file}:${f.line} ${f.text} に理由がありません（直上に空行を挟まず「// 理由: …」を書くか、外してください）`,
      );
    }
  }
  return problems;
}
