// #587 D: 行数・フック・export・テストの形を数える（node 標準ライブラリだけ。母集合は git ls-files）
// 使い方: node d-size.mjs <ルート>   出力: JSON（整列済み・同じ入力で同じ出力）
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 1 << 28 })
  .toString("utf8").split("\0").filter(Boolean).sort();

const isTest = (p) => /\.(test|spec)\.[a-z]+$/.test(p) || /(^|\/)(tests?|e2e)\//.test(p);
const isSupport = (p) => /(^|\/)(tests?|e2e)\/support\//.test(p) || /(^|\/)(tests?)\/(helpers?|fixtures?)\//.test(p);
const isTestCaseFile = (p) => /\.(test|spec)\.[a-z]+$/.test(p);
// wc -l と同じ数え方（改行の数。空行・コメントを含む）
const wcl = (t) => { let n = 0; for (let i = 0; i < t.length; i++) if (t.charCodeAt(i) === 10) n++; return n; };
const count = (t, re) => (t.match(re) ?? []).length;
const pkgOf = (p) => { const s = p.split("/"); return (s[0] === "apps" || s[0] === "packages") ? s.slice(0, 2).join("/") : s[0]; };

const files = [];
const tests = [];
for (const p of tracked) {
  if (!/\.(ts|tsx)$/.test(p) || p.endsWith(".d.ts")) continue;
  const text = readFileSync(join(root, p), "utf8");
  const lines = wcl(text);
  const kind = isTest(p) ? "test" : "src";
  files.push({
    path: p, pkg: pkgOf(p), lines, kind,
    hooks: {
      useState: count(text, /\buseState\b/g),
      useEffect: count(text, /\buseEffect\b/g),
      useRef: count(text, /\buseRef\b/g),
      useCallback: count(text, /\buseCallback\b/g),
    },
    exports: count(text, /^export\s/gm),
  });
  if (isTestCaseFile(p)) {
    const ls = text.split("\n");
    let cases = 0, longest = 0, longestAt = 0;
    for (let i = 0; i < ls.length; i++) {
      const m = /^(\s*)(it|test)((?:\.\w+)*)(\([^)]*\))?\(/.exec(ls[i]);
      if (!m || /\.(describe|step|use|extend|beforeEach|afterEach|beforeAll|afterAll|configure|setTimeout|slow|info)\b/.test(m[3])) continue;
      cases++;
      // 同じインデントで `}` から始まる行までをケースの終わりとする（1 行で閉じるものは 1 行）
      let end = i;
      if (!/\)\s*;?\s*$/.test(ls[i]) || /=>\s*\{\s*$/.test(ls[i])) {
        for (let j = i + 1; j < ls.length; j++) {
          if (ls[j].startsWith(m[1] + "}") && ls[j].length >= m[1].length + 1 && !/^\s/.test(ls[j].slice(m[1].length))) { end = j; break; }
        }
      }
      const len = end - i + 1;
      if (len > longest) { longest = len; longestAt = i + 1; }
    }
    tests.push({ file: p, cases, longest, longestAt });
  }
}
files.sort((a, b) => b.lines - a.lines || (a.path < b.path ? -1 : 1));
tests.sort((a, b) => b.longest - a.longest || (a.file < b.file ? -1 : 1));

const perPkg = {};
for (const f of files) {
  const k = f.pkg; const P = (perPkg[k] ??= { src: 0, test: 0, support: 0, srcFiles: 0, testFiles: 0 });
  if (f.kind === "src") { P.src += f.lines; P.srcFiles++; } else { P.test += f.lines; P.testFiles++; if (isSupport(f.path)) P.support += f.lines; }
}
const pkgRows = Object.entries(perPkg).sort((a, b) => b[1].src - a[1].src || (a[0] < b[0] ? -1 : 1)).map(([pkg, v]) => ({ pkg, ...v }));
const helperLines = files.filter((f) => f.kind === "test" && isSupport(f.path)).map((f) => ({ file: f.path, lines: f.lines })).sort((a, b) => b.lines - a.lines || (a.file < b.file ? -1 : 1));
console.log(JSON.stringify({ files, tests, perPkg: pkgRows, helperLines }, null, 1));
