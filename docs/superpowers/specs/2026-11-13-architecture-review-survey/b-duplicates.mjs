// #587 測る役 B: 同じ知識の写しを測る。使い方: node b-duplicates.mjs <ルート>
// 出力は整列した JSON。node 標準ライブラリだけ。
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const WINDOW = 20;
const root = process.argv[2] ?? ".";
const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 1 << 28 })
  .toString("utf8").split("\0").filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".d.ts")).sort();

// テストの判定は 6 本で同じ正規表現
const isTest = (p) => /\.(test|spec)\.[cm]?[tj]sx?$/.test(p) || /(^|\/)(tests?|e2e)\//.test(p);
const unitOf = (f) => {
  const p = f.split("/");
  return p[0] === "apps" || p[0] === "packages" ? `${p[0]}/${p[1]}` : p[0];
};

// 正規化: trim・空行・コメント行・import / export from 行・閉じ括弧だけの行を落とす
const DROP = /^(\}|\};|\)|\);|\},|\]|\];|\]\)|\}\)|\}\);)$/;
function normalize(src) {
  const out = []; // {t, n}（n は元の行番号）
  const lines = src.split("\n");
  let inBlock = false, inImport = false;
  for (let i = 0; i < lines.length; i++) {
    let t = lines[i].trim();
    if (inBlock) { if (t.includes("*/")) inBlock = false; continue; }
    if (t.startsWith("/*")) { if (!t.includes("*/")) inBlock = true; continue; }
    if (inImport) { if (/\bfrom\s+["']/.test(t) || /^["'][^"']+["'];?$/.test(t) || /^\};?$/.test(t)) inImport = false; continue; }
    if (t === "" || t.startsWith("//") || t.startsWith("*")) continue;
    if (/^import\b/.test(t)) { if (!/\bfrom\s+["']/.test(t) && !/^import\s+["']/.test(t)) inImport = true; continue; }
    if (/^export\s+(type\s+)?(\*|\{[^}]*\})\s+from\b/.test(t)) continue;
    if (/^export\s+(type\s+)?\{[^}]*$/.test(t)) { inImport = true; continue; }
    if (DROP.test(t)) continue;
    out.push({ t, n: i + 1 });
  }
  return out;
}

const norm = new Map();
const raw = new Map();
for (const f of files) {
  const src = readFileSync(path.join(root, f), "utf8");
  raw.set(f, src);
  norm.set(f, normalize(src));
}

// 1. 塊
const hashes = new Map(); // hash -> [{f,i}]
for (const f of files) {
  const a = norm.get(f);
  for (let i = 0; i + WINDOW <= a.length; i++) {
    const h = createHash("sha1").update(a.slice(i, i + WINDOW).map((x) => x.t).join("\n")).digest("hex").slice(0, 16);
    if (!hashes.has(h)) hashes.set(h, []);
    hashes.get(h).push({ f, i });
  }
}
const parent = new Map();
const key = (f, i) => `${f}\0${i}`;
const find = (k) => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb); };
const flagged = new Set();
for (const occ of hashes.values()) {
  if (new Set(occ.map((o) => o.f)).size < 2) continue;
  for (const o of occ) { const k = key(o.f, o.i); flagged.add(k); parent.set(k, k); }
}
for (const occ of hashes.values()) {
  if (new Set(occ.map((o) => o.f)).size < 2) continue;
  for (let j = 1; j < occ.length; j++) union(key(occ[0].f, occ[0].i), key(occ[j].f, occ[j].i));
}
for (const k of flagged) {
  const [f, i] = k.split("\0"); const nk = key(f, Number(i) + 1);
  if (flagged.has(nk)) union(k, nk);
}
const comps = new Map();
for (const k of flagged) {
  const r = find(k);
  if (!comps.has(r)) comps.set(r, []);
  const [f, i] = k.split("\0"); comps.get(r).push({ f, i: Number(i) });
}
const blocks = [];
for (const nodes of comps.values()) {
  const byFile = new Map();
  for (const n of nodes) { if (!byFile.has(n.f)) byFile.set(n.f, []); byFile.get(n.f).push(n.i); }
  const occurrences = [];
  for (const [f, idx] of byFile) {
    idx.sort((a, b) => a - b);
    let s = idx[0], p = idx[0];
    const push = (a, b) => {
      const arr = norm.get(f);
      occurrences.push({ file: f, start: arr[a].n, end: arr[b + WINDOW - 1].n, normLines: b - a + WINDOW });
    };
    for (let k = 1; k < idx.length; k++) { if (idx[k] !== p + 1) { push(s, p); s = idx[k]; } p = idx[k]; }
    push(s, p);
  }
  occurrences.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.start - b.start));
  const fs = [...new Set(occurrences.map((o) => o.file))];
  const tests = fs.filter(isTest).length;
  const units = new Set(fs.map(unitOf));
  const lines = Math.min(...occurrences.map((o) => o.normLines));
  const hash = createHash("sha1").update(occurrences.map((o) => `${o.file}:${o.start}`).join("|")).digest("hex").slice(0, 12);
  blocks.push({
    hash, lines,
    kind: tests === 0 ? "source" : tests === fs.length ? "test" : "mixed",
    scope: units.size > 1 ? "cross-package" : "same-package",
    units: [...units].sort(), files: fs.length, occurrences,
  });
}
blocks.sort((a, b) => b.lines - a.lines || (a.hash < b.hash ? -1 : 1));

// 2. 名前
const nameRe = /^export\s+(?:async\s+)?(?:function\*?|const|class)\s+([A-Za-z_$][\w$]*)/;
const nameMap = new Map();
for (const f of files) {
  if (isTest(f)) continue;
  for (const line of raw.get(f).split("\n")) {
    const m = nameRe.exec(line);
    if (!m) continue;
    if (!nameMap.has(m[1])) nameMap.set(m[1], new Set());
    nameMap.get(m[1]).add(f);
  }
}
const names = [...nameMap].map(([name, fs]) => ({ name, files: [...fs].sort(), units: [...new Set([...fs].map(unitOf))].sort() }))
  .filter((x) => x.units.length >= 2).sort((a, b) => (a.name < b.name ? -1 : 1));

// 3. 文言と定数
const strRe = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\\n]|\\.)*)`/g;
const jaChar = /[぀-ヿ一-鿿]/;
const jaMap = new Map(), numMap = new Map();
for (const f of files) {
  const test = isTest(f);
  for (const line of raw.get(f).split("\n")) {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*")) continue;
    let m; strRe.lastIndex = 0;
    while ((m = strRe.exec(line))) {
      const k = m[1] ?? m[2] ?? m[3];
      if (!jaChar.test(k) || [...k].length < 6) continue;
      if (!jaMap.has(k)) jaMap.set(k, new Map());
      jaMap.get(k).set(f, test ? "test" : "source");
    }
    const n = /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::\s*number\s*)?=\s*(-?\d[\d_.]*(?:e\d+)?)\s*;?\s*(?:\/\/.*)?$/.exec(t);
    if (n) {
      const k = `${n[1]}=${n[2]}`;
      if (!numMap.has(k)) numMap.set(k, new Map());
      numMap.get(k).set(f, test ? "test" : "source");
    }
  }
}
const lit = (map, kind) => [...map].map(([value, fm]) => {
  const fs = [...fm.keys()].sort();
  return { kind, value, files: fs, units: [...new Set(fs.map(unitOf))].sort(), sourceFiles: fs.filter((x) => fm.get(x) === "source").length };
}).filter((x) => x.units.length >= 2).sort((a, b) => (a.value < b.value ? -1 : 1));
const literals = [...lit(jaMap, "text"), ...lit(numMap, "const")];

console.log(JSON.stringify({ window: WINDOW, scanned: files.length, blocks, names, literals }, null, 1));
