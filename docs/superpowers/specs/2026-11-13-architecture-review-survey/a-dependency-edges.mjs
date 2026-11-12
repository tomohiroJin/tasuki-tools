#!/usr/bin/env node
/**
 * #587 測る役 A: import の辺を取り、層の規則（docs/guides/architecture.md の対応表）に照らす。
 * 使い方: node a-dependency-edges.mjs <ルート>
 * 出力: { edges, violations, summary }（標準出力へ JSON。整列済みで、同じ入力は同じ出力）
 * 母集合は git ls-files。node 標準ライブラリだけ。読むだけで何も書かない。
 * 調査のディレクトリ（docs/superpowers/specs/2026-11-13-architecture-review-survey*。このスクリプト自身を含む）は、
 * マージ後の木で測り直しても基準値がずれないよう母集合から外す（a-extension-cost.mjs と同じ）。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(process.argv[2] ?? ".");
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 1 << 28 })
  .toString("utf8").split("\0").filter(Boolean)
  .filter((f) => !f.includes("2026-11-13-architecture-review-survey"));
const trackedSet = new Set(tracked);
const SRC_EXT = /\.(ts|tsx|mjs)$/;
const files = tracked.filter((f) => SRC_EXT.test(f)).sort();

// ---- パッケージの名前と入口 ----
const pkgs = {}; // dir -> { name, exports: Set<string> }
const nameToDir = {};
for (const f of tracked) {
  const m = /^((?:apps|packages)\/[^/]+|e2e)\/package\.json$/.exec(f);
  if (!m) continue;
  const j = JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
  const subs = new Set();
  if (typeof j.exports === "string" || (j.exports === undefined && j.main)) subs.add("."); // exports が無い package は main だけを入口とみなす
  else if (j.exports && typeof j.exports === "object") for (const k of Object.keys(j.exports)) subs.add(k);
  pkgs[m[1]] = { name: j.name, exports: subs };
  nameToDir[j.name] = m[1];
}
const pkgOf = (file) => {
  const m = /^((?:apps|packages)\/[^/]+|e2e)\//.exec(file);
  return m ? m[1] : null;
};

// 既存の監査の許可表（読むだけ）
const audit = await import(pathToFileURL(path.join(root, "scripts/audit-dependency-direction.mjs")).href);
const ALLOWED = audit.ALLOWED;
const TEST_ONLY = audit.TEST_ONLY;

// ---- 層の判定（パスの規則。report-a.md に表で残す） ----
const isTestFile = (f) => /\.(test|spec)\.[cm]?[tj]sx?$/.test(f) || /(^|\/)(tests?|e2e)\//.test(f) || /^e2e\//.test(f);
const webApps = new Set(tracked.filter((f) => /^apps\/[^/]+\/vite\.config\.ts$/.test(f)).map((f) => pkgOf(f)));

const CORE = /^packages\/[a-z-]+-core$|^packages\/room-core$/;
function layerOf(file) {
  const pkg = pkgOf(file);
  if (pkg === null) return file.startsWith("scripts/") ? "scripts" : "other";
  if (isTestFile(file)) return "test";
  if (CORE.test(pkg)) return "domain";
  switch (pkg) {
    case "packages/protocol": return "protocol";
    case "packages/rate-limit": return "rate-limit";
    case "packages/sync-client": return "sync-client";
    case "packages/ui": return "ui";
    case "packages/invite-ui": return "invite-ui";
    case "packages/markdown": return "markdown";
    case "packages/dev-hub-redirect": return "dev-hub";
    case "packages/test-css": return "test-css";
    case "packages/web-kit": {
      const m = /^packages\/web-kit\/src\/(sync|room|reader)\//.exec(file);
      return m ? `web-kit/${m[1]}` : "web-kit/other";
    }
    case "apps/tasuki-sync": {
      const m = /^apps\/tasuki-sync\/src\/(application|ports|adapters)\//.exec(file);
      if (m) return `sync/${m[1]}`;
      if (/^apps\/tasuki-sync\/src\/[^/]+$/.test(file)) return "sync/assembly";
      return "sync/other";
    }
    case "e2e": return "test";
  }
  if (webApps.has(pkg)) {
    if (!file.startsWith(`${pkg}/src/`)) return "web/config";
    if (/\.tsx$/.test(file)) return "web/screen";
    const base = path.posix.basename(file);
    if (/(^|\/)(sync|hooks)\//.test(file) || /^use[-A-Z]/.test(base)) return "web/hook";
    if (/\.ts$/.test(file)) return "web/pure";
  }
  return "other";
}

// 層 -> 依存してよい層の集合（対応表の「依存してよいもの」）。同じ層・同じパッケージ内は常に可
const DOMAIN_LIKE = ["domain"];
const RULES = {
  "domain": [],
  "protocol": [],
  "rate-limit": [], "sync-client": [], "ui": [], "invite-ui": [], "markdown": [], "dev-hub": [], "test-css": [],
  "web-kit/sync": ["sync-client"],
  "web-kit/room": ["sync-client"],
  "web-kit/reader": ["markdown"],
  "web-kit/other": ["sync-client", "markdown"],
  "sync/ports": [...DOMAIN_LIKE],
  "sync/application": [...DOMAIN_LIKE, "protocol", "sync/ports", "rate-limit"],
  "sync/adapters": [...DOMAIN_LIKE, "protocol", "sync/ports", "sync/application", "rate-limit"],
  "sync/assembly": null, // 組み立て（audit-assembly-wiring の管轄）。全層可
  "sync/other": null,
  "web/pure": [...DOMAIN_LIKE],
  "web/hook": [...DOMAIN_LIKE, "protocol", "web/pure", "sync-client", "web-kit/sync", "web-kit/room", "web-kit/reader", "markdown", "invite-ui"],
  "web/screen": ["web/hook", "web/pure", "web-kit/reader", "web-kit/room", "invite-ui", "ui"],
  "web/config": null,
};
// poker-core は protocol に依存してよい（表の例外）
function layerAllows(fromFile, fromLayer, toLayer, toPkg) {
  if (fromLayer === toLayer) return true;
  const allowed = RULES[fromLayer];
  if (allowed === undefined || allowed === null) return true;
  if (fromLayer === "domain" && toLayer === "protocol" && pkgOf(fromFile) === "packages/poker-core") return true;
  return allowed.includes(toLayer);
}

// ---- import の抽出 ----
function stripComments(text) {
  let t = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  t = t.replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));
  return t;
}
const STMT = /(?:^|[;\n}])\s*(import|export)\s+(type\s+)?((?:[\w$*\s,]|\{[^}]*\})*?)\s*from\s*["']([^"'\n]+)["']/g;
const SIDE = /(?:^|[;\n}])\s*import\s*["']([^"'\n]+)["']/g;
const DYN = /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g;
function extract(text) {
  const t = stripComments(text);
  const lineAt = (idx) => { let n = 1; for (let i = 0; i < idx; i++) if (t.charCodeAt(i) === 10) n++; return n; };
  const out = [];
  for (const m of t.matchAll(STMT)) {
    const spec = m[4];
    const idx = m.index + m[0].lastIndexOf(spec);
    out.push({ spec, line: lineAt(idx), typeOnly: !!m[2], via: m[1] === "export" ? "export-from" : "import" });
  }
  for (const m of t.matchAll(SIDE)) out.push({ spec: m[1], line: lineAt(m.index + m[0].lastIndexOf(m[1])), typeOnly: false, via: "side-effect" });
  for (const m of t.matchAll(DYN)) out.push({ spec: m[1], line: lineAt(m.index + m[0].indexOf(m[1])), typeOnly: false, via: "dynamic" });
  return out;
}

const EXT_TRY = ["", ".ts", ".tsx", ".mjs", ".js", ".d.mts", "/index.ts", "/index.tsx", "/index.mjs"];
function resolveRelative(file, spec) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
  const stems = [base];
  const m = /^(.*)\.(js|mjs|jsx)$/.exec(base);
  if (m) stems.push(m[1]);
  for (const s of stems) for (const e of EXT_TRY) if (trackedSet.has(s + e)) return s + e;
  return base;
}

function targetInfo(file, spec) {
  if (spec.startsWith(".")) {
    const to = resolveRelative(file, spec);
    return { kind: "relative", to, toLayer: layerOf(to), toPkg: pkgOf(to), deep: false };
  }
  const m = /^(@tasuki\/[a-z0-9-]+)(\/.*)?$/.exec(spec);
  if (m) {
    const dir = nameToDir[m[1]] ?? null;
    const sub = m[2] ? `.${m[2]}` : ".";
    let toLayer = "unknown-tasuki";
    if (dir) {
      const probe = dir === "packages/web-kit" ? `${dir}/src/${(m[2] ?? "/other").slice(1)}/x.ts` : `${dir}/src/x.ts`;
      toLayer = layerOf(probe);
    }
    const deep = dir !== null && !pkgs[dir].exports.has(sub);
    return { kind: "@tasuki", to: spec, toLayer, toPkg: dir, deep };
  }
  return { kind: "external", to: spec, toLayer: "external", toPkg: null, deep: false };
}

const edges = [];
const violations = [];
for (const file of files) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  const fromLayer = layerOf(file);
  const fromPkg = pkgOf(file);
  const test = isTestFile(file);
  for (const imp of extract(text)) {
    const t = targetInfo(file, imp.spec);
    const edge = { from: file, to: t.to, kind: t.kind, file, line: imp.line, fromLayer, toLayer: t.toLayer, typeOnly: imp.typeOnly, via: imp.via };
    edges.push(edge);

    // 既存の監査（audit-dependency-direction）が止める形: package 間の向き・package の外へ出る相対パス・試験専用
    let covered = null;
    if (fromPkg && ALLOWED[fromPkg]) {
      if (t.kind === "@tasuki" && t.toPkg !== fromPkg && !ALLOWED[fromPkg].includes(imp.spec.match(/^@tasuki\/[a-z0-9-]+/)[0]))
        covered = "package-direction";
      else if (t.kind === "relative" && t.toPkg !== fromPkg) covered = "relative-escape";
      else if (t.kind === "@tasuki" && TEST_ONLY.includes(imp.spec.match(/^@tasuki\/[a-z0-9-]+/)[0]) && !test) covered = "test-only";
    }
    if (covered) {
      violations.push({ ...pick(edge), rule: covered, covered: true, note: "audit-dependency-direction が止める" });
      continue;
    }
    if (t.kind === "external") continue;
    // 層の規則（監査の外）。テストは層の判定の対象外（試験は何を読んでもよい決まりではないが、対応表は製品コードの層を定める）
    if (test || fromLayer === "scripts" || fromLayer === "other") continue;
    if (t.deep) {
      violations.push({ ...pick(edge), rule: "deep-import", covered: false, note: `${imp.spec} は package.json の exports に無い入口` });
      continue;
    }
    if (t.kind === "relative" && t.toLayer === "test") {
      violations.push({ ...pick(edge), rule: "product-reads-test", covered: false, note: "製品コードがテストのファイルを読む" });
      continue;
    }
    if (t.toLayer === "test" || t.toLayer === "scripts" || t.toLayer === "other" || t.toLayer === "web/config") {
      if (t.kind === "relative" && t.toPkg === fromPkg && fromLayer.startsWith("web/") === false) continue;
      continue;
    }
    if (!layerAllows(file, fromLayer, t.toLayer, t.toPkg)) {
      violations.push({ ...pick(edge), rule: `${fromLayer} -> ${t.toLayer}`, covered: false, note: "対応表の「依存してよいもの」に無い" });
    }
  }
}
function pick(e) { return { from: e.from, to: e.to, kind: e.kind, file: e.file, line: e.line, fromLayer: e.fromLayer, toLayer: e.toLayer, typeOnly: e.typeOnly }; }

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const key = (e) => [e.file, String(e.line).padStart(6, "0"), e.to, e.via ?? e.rule ?? ""].join("\u0000");
edges.sort((a, b) => cmp(key(a), key(b)));
violations.sort((a, b) => cmp(key(a), key(b)));

// 層の組ごとの件数（テスト以外）
const pairs = {};
for (const e of edges) {
  if (e.fromLayer === "test" || e.kind === "external") continue;
  const k = `${e.fromLayer} -> ${e.toLayer}`;
  pairs[k] = (pairs[k] ?? 0) + 1;
}
const byRule = {};
for (const v of violations) {
  const k = `${v.covered ? "covered" : "uncovered"}: ${v.rule}${v.typeOnly ? " (type)" : ""}`;
  byRule[k] = (byRule[k] ?? 0) + 1;
}
const sortObj = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => cmp(a, b)));
const summary = {
  scannedFiles: files.length,
  edges: edges.length,
  edgesByKind: sortObj(edges.reduce((a, e) => ((a[e.kind] = (a[e.kind] ?? 0) + 1), a), {})),
  violationsCovered: violations.filter((v) => v.covered).length,
  violationsUncovered: violations.filter((v) => !v.covered).length,
  byRule: sortObj(byRule),
  layerPairsNonTest: sortObj(pairs),
};
process.stdout.write(JSON.stringify({ edges, violations, summary }, null, 1) + "\n");
