/**
 * SC-040: テストの `.only` と、理由の無い `.skip` / `.skipIf` / `.runIf` / `.todo` / `.fixme`（#523）。
 *
 * 判定だけを持つ純粋関数。走査の対象（どのファイルを読むか）と終了コードは
 * `scripts/audit-structure.mjs` の `main()` が持つ。
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
 * 見ないもの（文書に書いてある限界）: テストの文脈（`ctx.skip()`）・別名で取り込んだ関数
 * （`const t = test; t.only(...)`）。前者は実行中に飛ばす書き方で、テスト定義の
 * 構文では区別できない。
 */
import ts from "typescript";

/** テストを定義する関数の名前。連なりの根（最も左の識別子）がこれのときだけ見る。 */
export const TEST_API_ROOTS = ["it", "test", "describe", "suite"];

/** 理由のコメントを要する名前。 */
export const SKIP_NAMES = ["skip", "skipIf", "runIf", "todo", "fixme"];

/** 理由があっても止める名前。 */
export const FOCUS_NAMES = ["only"];

/** 理由のコメントの形。`理由:` の後ろに、空白以外の文字が 1 つ以上要る。 */
export const REASON_RE = /理由[:：]\s*\S/;

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

/** 属する文（その親が文の並びを持つ最初の祖先）。 */
function enclosingStatement(node) {
  let n = node;
  while (n.parent && !ts.isSourceFile(n.parent) && !ts.isBlock(n.parent) && !ts.isModuleBlock(n.parent) && !ts.isCaseClause(n.parent) && !ts.isDefaultClause(n.parent)) {
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

/** `it("…", { skip: … })` の形のオプション。値が `false` でない `skip` / `todo` / `only` を返す。 */
function optionFindings(call) {
  const out = [];
  for (const arg of call.arguments) {
    if (!ts.isObjectLiteralExpression(arg)) continue;
    for (const prop of arg.properties) {
      if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) continue;
      const name = prop.name.getText();
      if (name !== "skip" && name !== "todo" && name !== "only") continue;
      const value = ts.isPropertyAssignment(prop) ? prop.initializer : null;
      if (value && value.kind === ts.SyntaxKind.FalseKeyword) continue;
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
    if (!REASON_RE.test(adjacentCommentText(source, statement))) {
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
 * SC-040 の問題一覧（純粋）。問題が無ければ空配列。
 *
 * @param testFiles `Map<リポジトリ相対パス, ソース>`
 */
export function sc040FocusedOrSkippedTests(testFiles) {
  const problems = [];
  for (const [file, source] of [...testFiles].sort(([a], [b]) => (a < b ? -1 : 1))) {
    for (const f of findFocusedOrSkippedTests(file, source)) {
      problems.push(
        f.kind === "only"
          ? `SC-040 ${f.file}:${f.line} ${f.text} が残っています（1 つ残ると同じファイルの他のテストが黙って流れなくなります。外してください）`
          : `SC-040 ${f.file}:${f.line} ${f.text} に理由がありません（直上に空行を挟まず「// 理由: …」を書くか、外してください）`,
      );
    }
  }
  return problems;
}
