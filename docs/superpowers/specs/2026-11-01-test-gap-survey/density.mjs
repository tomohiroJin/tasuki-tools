// 変異の密度: 宣言の表とパッチから、パッケージごとの変異数・変異が当たるソースファイルの割合を出す
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
const ROOT = process.argv[2];
const { MUTATIONS } = await import(join(ROOT, "scripts/lib/mutation-declarations.mjs"));
const pkgs = [...readdirSync(join(ROOT, "packages")).map((d) => `packages/${d}`), ...readdirSync(join(ROOT, "apps")).map((d) => `apps/${d}`)];
const SRC_RE = /\.(ts|tsx|mjs|js|svelte|vue)$/;
const isTest = (p) => /(\.test\.|\.spec\.|\/test\/|\/tests\/|__tests__|\.d\.ts$|vite\.config|vitest\.config|playwright\.config)/.test(p);
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (["node_modules", "dist", "coverage", ".turbo", "public"].includes(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out); else if (SRC_RE.test(e)) out.push(relative(ROOT, p));
  }
  return out;
}
const touched = new Map(); // file -> count
const byPkgDecl = new Map();
for (const m of MUTATIONS) {
  byPkgDecl.set(m.pkg, (byPkgDecl.get(m.pkg) ?? 0) + 1);
  const patch = readFileSync(join(ROOT, "scripts/mutations", m.patch), "utf8");
  for (const [, f] of patch.matchAll(/^\+\+\+ b\/(.+)$/gm)) touched.set(f, (touched.get(f) ?? 0) + 1);
}
const rows = []; const untouched = {};
for (const pkg of pkgs) {
  const files = walk(join(ROOT, pkg, "src")).filter((f) => !isTest(f));
  const hit = files.filter((f) => touched.has(f));
  const patchesInto = [...touched.entries()].filter(([f]) => f.startsWith(pkg + "/")).reduce((a, [, n]) => a + n, 0);
  rows.push({ pkg, decl: byPkgDecl.get(pkg) ?? 0, patchesInto, srcFiles: files.length, hitFiles: hit.length, ratio: files.length ? (100 * hit.length / files.length).toFixed(0) + "%" : "-" });
  untouched[pkg] = files.filter((f) => !touched.has(f)).map((f) => ({ f, lines: readFileSync(join(ROOT, f), "utf8").split("\n").length }));
}
const other = [...byPkgDecl.entries()].filter(([p]) => !pkgs.includes(p));
const outside = [...touched.keys()].filter((f) => !pkgs.some((p) => f.startsWith(p + "/")));
console.log(JSON.stringify({ total: MUTATIONS.length, rows, otherPkgDecl: other, filesOutsidePkgSrc: outside.length, untouched }, null, 1));
