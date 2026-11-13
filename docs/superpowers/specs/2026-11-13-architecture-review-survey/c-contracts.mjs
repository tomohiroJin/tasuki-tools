#!/usr/bin/env node
/**
 * #587 測る役 C: DbC（契約による設計）と関数型の字面の測定。
 * 使い方: node c-contracts.mjs <リポジトリのルート>  → 標準出力へ JSON（整列済み・同じ入力で同じ出力）
 *
 * 母集合は `git ls-files`。node 標準ライブラリだけ。TypeScript のパーサは使えない（字面で読む）。
 * コメントと文字列・テンプレートリテラルは空白に置き換えてから読む（行番号は保つ）。
 * 正規表現リテラルは読み飛ばしを誤ることがある（取りこぼしの見込みは report-c.md）。
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? ".";

const SCAN_PREFIXES = [
  "packages/agenda-core/src/", "packages/checkin-core/src/", "packages/poker-core/src/",
  "packages/roulette-core/src/", "packages/timer-core/src/", "packages/topic-core/src/",
  "packages/room-core/src/", "packages/protocol/src/", "packages/sync-client/src/",
  "apps/tasuki-sync/src/application/", "apps/tasuki-sync/src/ports/",
];
// 既存の監査（audit-domain-side-effects.mjs の DOMAIN_PACKAGES）の宣言のうち、本調査の対象に入るもの
const AUDITED_DOMAIN = new Set([
  "packages/poker-core", "packages/room-core", "packages/topic-core", "packages/roulette-core",
  "packages/agenda-core", "packages/checkin-core", "packages/timer-core",
]);
const FORBIDDEN = ["Date.now(", "Math.random(", "new Date(", "performance.now(", "crypto.", "process.env"];

// テストの判定は 6 本で同じ正規表現
const isTestPath = (p) => /\.(test|spec)\.[cm]?[tj]sx?$/.test(p) || /(^|\/)(tests?|e2e)\//.test(p);
const isCodeExt = (p) => /\.(ts|tsx|mjs)$/.test(p);

const all = execFileSync("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 1 << 28 })
  .toString().split("\0").filter(Boolean).filter(isCodeExt).sort();
const read = (p) => readFileSync(join(root, p), "utf8");

/** コメント・文字列・テンプレートを空白へ（改行と長さは保つ） */
function strip(src) {
  let out = "", i = 0;
  const n = src.length;
  const blank = (s) => s.replace(/[^\n]/g, " ");
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") {
      let j = i; while (j < n && src[j] !== "\n") j++;
      out += blank(src.slice(i, j)); i = j;
    } else if (c === "/" && d === "*") {
      let j = src.indexOf("*/", i + 2); j = j < 0 ? n : j + 2;
      out += blank(src.slice(i, j)); i = j;
    } else if (c === "'" || c === '"' || c === "`") {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === "\\") j++; if (c !== "`" && src[j] === "\n") break; j++; }
      j = Math.min(j + 1, n);
      out += c + blank(src.slice(i + 1, j - 1)) + (src[j - 1] === c ? c : " "); i = j;
    } else { out += c; i++; }
  }
  // import / export の宣言（複数行を含む）も空白へ。`import type { A as B, }` の `as` を型アサーションに数えないため
  const blankAll = (m) => m.replace(/[^\n]/g, " ");
  return out
    .replace(/^[ \t]*import\s[^;]*?\bfrom\s*["'`][^"'`\n]*["'`][ \t]*;?/gm, blankAll)
    .replace(/^[ \t]*export\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})(?:\s*from\s*["'`][^"'`\n]*["'`])?[ \t]*;?/gm, blankAll);
}
const lineOf = (text, idx) => { let l = 1; for (let k = 0; k < idx; k++) if (text.charCodeAt(k) === 10) l++; return l; };
const pkgOf = (p) => p.startsWith("apps/tasuki-sync/") ? p.split("/").slice(0, 4).join("/") : p.split("/").slice(0, 2).join("/");
const layerOf = (p) =>
  p.startsWith("apps/tasuki-sync/src/application/") ? "application"
  : p.startsWith("apps/tasuki-sync/src/ports/") ? "port"
  : /^packages\/(protocol|sync-client)\//.test(p) ? "infra" : "domain";

const files = all.filter((p) => SCAN_PREFIXES.some((s) => p.startsWith(s)) && !isTestPath(p));
const excludedTests = all.filter((p) => SCAN_PREFIXES.some((s) => p.startsWith(s)) && isTestPath(p)).length;
const texts = new Map(files.map((p) => { const raw = read(p); return [p, { raw, code: strip(raw) }]; }));

// string の別名（type XId = string）
const aliasOfString = new Set();
const aliasDecls = [];
for (const [p, { code }] of texts) {
  for (const m of code.matchAll(/\btype\s+([A-Z]\w*)\s*=\s*string\s*;/g)) {
    aliasOfString.add(m[1]); aliasDecls.push({ file: p, line: lineOf(code, m.index), name: m[1] });
  }
}

function enclosing(code, idx) {
  let depth = 0;
  for (let k = idx - 1; k >= 0; k--) {
    const c = code[k];
    if (c === ")" || c === "]" || c === "}") depth++;
    else if (c === "(" || c === "[" || c === "{") { if (depth === 0) return { ch: c, at: k }; depth--; }
  }
  return { ch: "", at: -1 };
}
const KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "function", "return", "await", "typeof"]);
function fnName(code, at) {
  const before = code.slice(Math.max(0, at - 200), at);
  let m = before.match(/([\w$]+)\s*(<[^()]*>)?\s*$/);
  if (m && !KEYWORDS.has(m[1])) return m[1];
  m = before.match(/(?:const|let|var|type)\s+([\w$]+)\s*(?::[^=]+)?=\s*(?:async\s*)?$/);
  return m ? m[1] : "<anon>";
}

const stringIds = [], throws = [], mutable = [], casts = [], sideEffectTokens = [];
const ID_RE = /(?<![\w$.])(id|[a-z][\w$]*Id|[a-z][\w$]*Ids)\s*\??\s*:\s*(string(?:\[\])?|[A-Z]\w*)(?![\w$])/g;

for (const p of files) {
  const { raw, code } = texts.get(p);
  const pkg = pkgOf(p), layer = layerOf(p);

  // 1. string のままの ID（引数 = 直近の囲みが `(`。`{` の中は型の欄として別に数える）
  for (const m of code.matchAll(ID_RE)) {
    const ty = m[2], base = ty.replace(/\[\]$/, "");
    let typeKind;
    if (base === "string") typeKind = "string"; else if (aliasOfString.has(base)) typeKind = "alias-of-string"; else continue;
    const enc = enclosing(code, m.index);
    if (enc.ch === "(") stringIds.push({ file: p, line: lineOf(code, m.index), fn: fnName(code, enc.at), param: m[1], typeKind, kind: "param" });
    else if (enc.ch === "{") stringIds.push({ file: p, line: lineOf(code, m.index), fn: "", param: m[1], typeKind, kind: "field" });
  }

  // 2. throw
  for (const m of code.matchAll(/\bthrow\b/g)) {
    throws.push({ file: p, line: lineOf(code, m.index), layer, covered: layer === "domain" && AUDITED_DOMAIN.has(pkg) });
  }

  // 3. 可変の状態
  for (const m of code.matchAll(/^(export\s+)?let\s+([\w$]+)/gm)) {
    mutable.push({ file: p, line: lineOf(code, m.index), kind: "top-level-let", covered: layer === "domain" && AUDITED_DOMAIN.has(pkg) });
  }
  for (const m of code.matchAll(/^(?:export\s+)?const\s+([\w$]+)\s*(?::[^=\n]+)?=\s*(new\s+(?:Map|Set|WeakMap|WeakSet)\b|\[\s*\])/gm)) {
    const name = m[1].replace(/\$/g, "\\$");
    if (new RegExp(`\\b${name}\\.(set|add|push|delete|clear|splice|unshift|pop|shift)\\(`).test(code)) {
      mutable.push({ file: p, line: lineOf(code, m.index), kind: "top-level-collection-mutated", covered: false });
    }
  }
  // 引数の破壊的変更（ファイル内で引数名として現れた名前に対する字面。同名のローカルも拾うので近似）
  const paramNames = new Set();
  for (const m of code.matchAll(/[(,]\s*(?:readonly\s+)?([a-z][\w$]*)\s*\??\s*:/g)) {
    if (enclosing(code, m.index + 1).ch === "(") paramNames.add(m[1]);
  }
  for (const nm of [...paramNames].sort()) {
    const q = nm.replace(/\$/g, "\\$");
    for (const m of code.matchAll(new RegExp(`(?<![\\w$.])${q}\\.(push|splice|sort|reverse|unshift|pop|shift)\\(`, "g"))) {
      mutable.push({ file: p, line: lineOf(code, m.index), kind: `param-mutating-call:${nm}.${m[1]}`, covered: false });
    }
    for (const m of code.matchAll(new RegExp(`(?<![\\w$.])${q}(?:\\.[\\w$]+|\\[[^\\]\\n]+\\])\\s*(?:[-+*/|&]?=)(?![=>])`, "g"))) {
      mutable.push({ file: p, line: lineOf(code, m.index), kind: `param-assign:${nm}`, covered: false });
    }
  }

  // 4. 型の抜け道
  const castPats = [
    ["as-unknown-as", /\bas\s+unknown\s+as\b/g, code],
    ["as-any", /\bas\s+any\b/g, code],
    ["non-null-!", /[\w)\]]!(?=[.[)\],;:\s])(?!=)/g, code],
    ["ts-ignore", /@ts-ignore/g, raw],
    ["ts-expect-error", /@ts-expect-error/g, raw],
    ["as-assertion", /\bas\s+(?!const\b|unknown\b|any\b)[A-Za-z_{(\[]/g, code],
  ];
  const codeLines = code.split("\n"); // ループの外で 1 回だけ分ける
  for (const [kind, re, text] of castPats) {
    for (const m of text.matchAll(re)) {
      const ln = lineOf(text, m.index);
      const lineText = codeLines[ln - 1];
      if (kind === "as-assertion" && /^\s*(import|export)\b/.test(lineText)) continue;
      if (kind === "non-null-!" && /^\s*(import|export)\b/.test(lineText)) continue;
      casts.push({ file: p, line: ln, kind });
    }
  }

  // 5. 既存の監査の字面
  const rawLines = raw.split("\n");
  rawLines.forEach((l, i) => {
    for (const tok of FORBIDDEN) if (l.includes(tok)) {
      sideEffectTokens.push({ file: p, line: i + 1, token: tok, covered: layer === "domain" && AUDITED_DOMAIN.has(pkg) });
    }
  });
}

// 6. 性質テスト（リポジトリ全体のテスト）
const propMap = new Map();
for (const p of all.filter(isTestPath)) {
  const t = read(p);
  if (/from\s+["']fast-check["']|require\(["']fast-check["']\)|\bfc\./.test(t)) {
    const k = pkgOf(p); (propMap.get(k) ?? propMap.set(k, []).get(k)).push(p);
  }
}
const propertyTests = [...propMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([pkg, fl]) => ({ pkg, files: fl.sort() }));

const cmp = (a, b) => a.file.localeCompare(b.file) || a.line - b.line || String(a.kind ?? a.param ?? a.token ?? "").localeCompare(String(b.kind ?? b.param ?? b.token ?? ""));
const sorted = (xs) => xs.sort(cmp);
const tally = (xs, keyFn) => { const o = {}; for (const x of xs) { const k = keyFn(x); o[k] = (o[k] ?? 0) + 1; } return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b))); };

const result = {
  scanned: { files: files.length, excludedTestFilesUnderScanDirs: excludedTests },
  aliasOfString: aliasDecls.sort(cmp),
  stringIds: sorted(stringIds),
  throws: sorted(throws),
  mutable: sorted(mutable),
  casts: sorted(casts),
  sideEffectTokens: sorted(sideEffectTokens),
  propertyTests,
  summary: {
    stringIdsByPkgKind: tally(stringIds, (x) => `${pkgOf(x.file)} ${x.kind} ${x.typeKind}`),
    throwsByLayerCovered: tally(throws, (x) => `${x.layer} covered=${x.covered}`),
    throwsByPkg: tally(throws, (x) => pkgOf(x.file)),
    mutableByKindPkg: tally(mutable, (x) => `${x.kind.split(":")[0]} ${pkgOf(x.file)}`),
    castsByKind: tally(casts, (x) => x.kind),
    castsByKindPkg: tally(casts, (x) => `${x.kind} ${pkgOf(x.file)}`),
    sideEffectTokensByCovered: tally(sideEffectTokens, (x) => `covered=${x.covered} ${x.token}`),
  },
};
process.stdout.write(JSON.stringify(result, null, 1) + "\n");
