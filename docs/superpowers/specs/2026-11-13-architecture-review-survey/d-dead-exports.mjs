// #587 D: 自分以外の追跡ファイルのどこにも単語として現れない export を数える（node 標準ライブラリだけ）
// 使い方: node d-dead-exports.mjs <ルート>   出力: JSON（整列済み）
// 参照の母集合は追跡下の .ts .tsx .mjs .cjs .js（文書・JSON は含めない）。単語境界は識別子の字句で取る。
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 1 << 28 })
  .toString("utf8").split("\0").filter(Boolean).sort();
const isCode = (p) => /\.(ts|tsx|mjs|cjs|js)$/.test(p);
const isTest = (p) => /\.(test|spec)\.[a-z]+$/.test(p) || /(^|\/)(tests?|e2e)\//.test(p);
const isEntry = (p) => /(^|\/)(index\.ts|main\.tsx|server\.ts|vite\.config\.ts)$/.test(p) || p.endsWith(".d.ts");
const isBarrel = (p) => /(^|\/)index\.ts$/.test(p) || /(^|\/)(\w+\/)?sync\.ts$/.test(p) && false;

const tokens = new Map(); // path -> Set<識別子>
const texts = new Map();
for (const p of tracked.filter(isCode)) {
  const t = readFileSync(join(root, p), "utf8");
  texts.set(p, t);
  tokens.set(p, new Set(t.match(/[A-Za-z_$][\w$]*/g) ?? []));
}
const index = new Map(); // 名前 -> 現れるファイル
for (const [p, s] of tokens) for (const n of s) { let a = index.get(n); if (!a) index.set(n, (a = [])); a.push(p); }

const EXP = /^export\s+(?:declare\s+)?(?:async\s+)?(function\*?|const|let|class|abstract\s+class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm;
const dead = [], weak = [];
let total = 0;
for (const [p, t] of texts) {
  if (!/\.(ts|tsx)$/.test(p) || isEntry(p) || p.startsWith("scripts/")) continue;
  let m;
  while ((m = EXP.exec(t))) {
    total++;
    const name = m[2]; const decl = m[1].replace(/\s+/g, " ");
    const line = t.slice(0, m.index).split("\n").length;
    const isType = decl === "type" || decl === "interface";
    const others = (index.get(name) ?? []).filter((q) => q !== p);
    const selfUses = (t.match(new RegExp(`(?<![\\w$])${name.replace(/\$/g, "\\$")}(?![\\w$])`, "g")) ?? []).length - 1;
    const rec = { file: p, name, line, decl, isType, selfUses };
    if (others.length === 0) dead.push(rec);
    else if (others.every(isTest)) weak.push({ ...rec, why: "テストからだけ", refs: others.length });
    else if (others.every((q) => isBarrel(q) || isTest(q))) weak.push({ ...rec, why: "index.ts の再 export（とテスト）だけ", refs: others.length });
  }
}
const cmp = (a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line);
dead.sort(cmp); weak.sort(cmp);
console.log(JSON.stringify({ totalExports: total, deadExports: dead, weakExports: weak }, null, 1));
