// ADR-0006 の規約のうち機械で数えられるものを数える（AST で test/it の本体を見る）
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createRequire } from "node:module";
// 相対パス（`.`）でも動くように絶対パスへ直す（`import()`・`createRequire` は相対パスを受けない）
const ROOT = resolve(process.argv[2]);
const ts = createRequire(join(ROOT, "package.json"))("typescript");
const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    if (["node_modules", "dist", "coverage", ".turbo", ".git", "test-results", "playwright-report"].includes(e)) continue;
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(test|spec)\.(ts|tsx|mjs)$/.test(e)) files.push(p);
  }
})(ROOT);
const TEST_FNS = new Set(["it", "test"]);
const ASSERT_RE = /\b(expect|assert|expectTypeOf|assertType)\b|\.toThrow|\.rejects|\.resolves/;
const res = { files: files.length, tests: 0, focused: [], skipped: [], todo: [], noAssert: [], branch: [], loop: [], wait: [], gwt: 0, gwtEligible: 0, perPkg: {} };
function calleeInfo(expr) {
  // it / it.only / test.skip / describe.skip / it.each(...) / test.skipIf(x)
  let e = expr; const chain = [];
  while (true) {
    if (ts.isCallExpression(e)) { e = e.expression; continue; }
    if (ts.isPropertyAccessExpression(e)) { chain.unshift(e.name.text); e = e.expression; continue; }
    if (ts.isIdentifier(e)) { chain.unshift(e.text); break; }
    return null;
  }
  return chain;
}
const pkgOf = (rel) => rel.split("/").slice(0, rel.startsWith("e2e") ? 1 : 2).join("/");
for (const f of files) {
  const rel = relative(ROOT, f); const pkg = pkgOf(rel);
  const P = (res.perPkg[pkg] ??= { files: 0, tests: 0, noAssert: 0, branch: 0, loop: 0, wait: 0, gwt: 0, gwtEligible: 0 });
  P.files++;
  const text = readFileSync(f, "utf8");
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const visit = (n) => {
    if (ts.isCallExpression(n)) {
      const chain = calleeInfo(n.expression);
      if (chain && ["it", "test", "describe", "suite"].includes(chain[0])) {
        const mods = chain.slice(1);
        const where = `${rel}:${line(n)}`;
        // `it.skipIf(cond)(name, fn)` は外側と内側の 2 つの呼び出しが同じ位置・同じ鎖を持つ。位置で 1 件にまとめる
        const once = (list, item) => { if (!list.includes(item)) list.push(item); };
        if (mods.includes("only")) once(res.focused, where);
        if (mods.some((m) => ["skip", "skipIf", "fixme", "runIf"].includes(m))) once(res.skipped, `${where} (${chain.join(".")})`);
        if (mods.includes("todo")) once(res.todo, where);
        if (TEST_FNS.has(chain[0]) && !mods.some((m) => ["describe", "beforeEach", "afterEach", "beforeAll", "afterAll", "step", "use", "extend", "setTimeout", "info", "slow", "configure"].includes(m))) {
          const cb = n.arguments.find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
          if (cb && cb.body) {
            res.tests++; P.tests++;
            const bodyText = cb.body.getText(sf);
            if (!ASSERT_RE.test(bodyText)) { res.noAssert.push(where); P.noAssert++; }
            let hasIf = false, hasLoop = false, hasWait = false;
            const inner = (m) => {
              if (m !== cb && (ts.isFunctionDeclaration(m))) return;
              if (ts.isIfStatement(m) || ts.isSwitchStatement(m)) hasIf = true;
              if (ts.isForStatement(m) || ts.isForOfStatement(m) || ts.isForInStatement(m) || ts.isWhileStatement(m) || ts.isDoStatement(m)) hasLoop = true;
              if (ts.isCallExpression(m)) {
                const c = calleeInfo(m.expression) ?? [];
                const last = c[c.length - 1];
                if (["setTimeout", "sleep", "waitForTimeout", "delay"].includes(last) && c[0] !== "vi") hasWait = true;
              }
              ts.forEachChild(m, inner);
            };
            ts.forEachChild(cb.body, inner);
            if (hasIf) { res.branch.push(where); P.branch++; }
            if (hasLoop) { res.loop.push(where); P.loop++; }
            if (hasWait) { res.wait.push(where); P.wait++; }
            const stmts = ts.isBlock(cb.body) ? cb.body.statements.length : 1;
            if (stmts > 2) { res.gwtEligible++; P.gwtEligible++; if (/\/\/\s*Given/.test(bodyText) && /\/\/\s*When/.test(bodyText)) { res.gwt++; P.gwt++; } }
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
console.log(JSON.stringify(res, null, 1));
