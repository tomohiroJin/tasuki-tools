#!/usr/bin/env node
/**
 * #587 測る役 A: 拡張の試算。道具・やり方・デッキを 1 つ足すとき、触ることになる追跡ファイルを数える。
 * 使い方: node a-extension-cost.mjs <ルート> tool|method|deck
 * 出力: { trial, files: [{path, column, reason}], totals: {code,test,docs,asset}, ... }（標準出力へ JSON・整列済み）
 * 母集合は git ls-files（全種類のファイル。バイナリは中身を読まず、パス名だけで資材に数える）。node 標準ライブラリだけ。
 * 調査用の文書とこのスクリプト（docs/superpowers/specs/2026-11-13-architecture-review-survey*）は、語を含むので母集合から外す。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? ".");
const trial = process.argv[3];
if (!["tool", "method", "deck"].includes(trial)) {
  console.error("使い方: a-extension-cost.mjs <ルート> tool|method|deck");
  process.exit(2);
}
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 1 << 28 })
  .toString("utf8").split("\0").filter(Boolean).sort();
const SELF = "docs/superpowers/specs/2026-11-13-architecture-review-survey";
const candidates = tracked.filter((f) => !f.startsWith(SELF) && !f.includes("2026-11-13-architecture-review-survey"));

const ASSET = /\.(woff2?|ttf|otf|png|jpe?g|gif|webp|ico|svg|mp4|webm|mp3|wav|pdf)$/i;
const TEST = /(\.(test|spec)\.[cm]?[tj]sx?$)|((^|\/)(tests?|e2e)\/)|(^scripts\/mutations\/)|(^scripts\/lib\/mutation-declarations)/;
function columnOf(f) {
  if (ASSET.test(f)) return "asset";
  if (/\.md$/i.test(f) || f.startsWith("docs/")) return "docs";
  if (TEST.test(f)) return "test";
  return "code";
}
const CONFIG_FILE = /(\.(json|ya?ml|toml|env|conf)$)|(^|\/)(Caddyfile[^/]*|\.gitignore|\.dockerignore|Dockerfile[^/]*|[^/]*\.service)$/;

function readText(f) {
  const buf = fs.readFileSync(path.join(root, f));
  if (buf.subarray(0, 4096).includes(0)) return null; // バイナリ
  return buf.toString("utf8");
}

// 当たった行の種類。優先順: 文書 > import > ルーティング > 設定の値 > 文言 > 識別子
function classifyLine(line, f, col, needle) {
  if (col === "docs") return "文書";
  const n = needle.source;
  if (new RegExp(`(\\bfrom\\s*|\\bimport\\s*\\(?\\s*|\\brequire\\(\\s*)["'][^"']*${n}`).test(line)) return "import";
  if (new RegExp(`(["'\`/])${n}(/|["'\`])`).test(line) && /(route|path|href|base|redirect|proxy|handle|location|url|origin|rewrite|reverse_proxy)/i.test(line)) return "ルーティング";
  if (new RegExp(`(^|\\s)(handle|handle_path|reverse_proxy|@\\w+\\s+path|location|rewrite)\\b[^\\n]*${n}`).test(line)) return "ルーティング";
  if (CONFIG_FILE.test(f)) return "設定の値";
  if (/\/\/|^\s*\*|^\s*\/\*/.test(line) && !/["'`][^"'`]*\bX\b/.test(line.replace(needle, "X"))) {
    // コメントの中だけに出る
    const code = line.replace(/\/\/.*$/, "");
    if (!needle.test(code)) return "文言";
  }
  const q = new RegExp(`(["'\`])[^"'\`\\n]*${n}[^"'\`\\n]*\\1`);
  if (q.test(line)) return /[\s　-鿿]/.test((line.match(q) ?? [""])[0]) ? "文言" : "設定の値";
  return "識別子";
}

// 試算ごとの検索
let patterns; // [{ name, re }]
const extra = {};
if (trial === "tool") {
  patterns = [{ name: "checkin", re: /\bcheckin\b/ }];
} else if (trial === "method") {
  const ms = fs.readFileSync(path.join(root, "packages/checkin-core/src/methods.ts"), "utf8");
  const arr = /METHOD_IDS\s*=\s*\[([^\]]*)\]/.exec(ms)[1];
  const ids = [...arr.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  extra.methodIds = ids;
  extra.picked = ids[0];
  patterns = [
    { name: "METHOD_IDS", re: /\bMETHOD_IDS\b/ },
    { name: ids[0], re: new RegExp(`\\b${ids[0].replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`) },
  ];
} else {
  const dk = fs.readFileSync(path.join(root, "packages/poker-core/src/deck.ts"), "utf8");
  const vals = /NUMBER_CARD_VALUES\s*=\s*\[([^\]]*)\]/.exec(dk)[1].split(",").map((s) => s.trim()).filter(Boolean);
  extra.values = vals;
  const sepNum = vals.join("\\s*,\\s*");
  const sepStr = vals.map((v) => `["']${v}["']`).join("\\s*,\\s*");
  patterns = [
    { name: "FIBONACCI_DECK", re: /\bFIBONACCI_DECK\b/ },
    { name: "値の列(数値)", re: new RegExp(`\\b${sepNum}\\b`) },
    { name: "値の列(文字列)", re: new RegExp(sepStr) },
  ];
}

const files = [];
for (const f of candidates) {
  const col = columnOf(f);
  if (col === "asset") {
    // 資材は名前で引く（バイナリの中身は読まない）。道具の名前を含むパスだけ数える
    if (patterns.some((p) => p.re.test(f))) files.push({ path: f, column: col, reason: "資材（パスに語）" });
    continue;
  }
  const text = readText(f);
  if (text === null) continue;
  const lines = text.split("\n");
  const reasons = new Set();
  let first = 0;
  for (let i = 0; i < lines.length; i++) {
    for (const p of patterns) {
      if (!p.re.test(lines[i])) continue;
      if (!first) first = i + 1;
      // 複数行の配列に分かれていても拾えるよう、値の列は後で全文でも見る
      reasons.add(patterns.length > 1 ? `${classifyLine(lines[i], f, col, p.re)}[${p.name}]` : classifyLine(lines[i], f, col, p.re));
    }
  }
  if (trial === "deck") {
    // 値の列が複数行に分かれて書かれている場合（全文で 1 回）
    for (const p of patterns.slice(1)) if (p.re.test(text.replace(/\n\s*/g, " "))) { if (!first) first = 1; reasons.add(`識別子[${p.name}・複数行]`); }
  }
  if (reasons.size === 0) continue;
  if (trial === "tool") {
    // 本体と docs は別に数える（本体 = apps/checkin-web・packages/checkin-core）
    if (f.startsWith("apps/checkin-web/") || f.startsWith("packages/checkin-core/") || f.startsWith("docs/")) continue;
  }
  files.push({ path: f, column: col, reason: [...reasons].sort().join(" / "), firstLine: first });
}
if (trial === "tool") {
  // 資材のうち本体の外のもの
  for (let i = files.length - 1; i >= 0; i--) {
    if (files[i].path.startsWith("apps/checkin-web/") || files[i].path.startsWith("packages/checkin-core/") || files[i].path.startsWith("docs/")) files.splice(i, 1);
  }
  const body = tracked.filter((f) => f.startsWith("apps/checkin-web/") || f.startsWith("packages/checkin-core/"));
  extra.bodyFiles = { "apps/checkin-web": body.filter((f) => f.startsWith("apps/checkin-web/")).length, "packages/checkin-core": body.filter((f) => f.startsWith("packages/checkin-core/")).length };
}
if (trial === "tool") {
  // 参考: 単語境界で引くと落ちる綴り（TOOL_CHECKIN・CHECKIN_…・checkinRevealGrace・Checkin…）。大文字小文字を区別せず部分一致で引き直し、単語では当たらなかったファイルだけを出す
  const hit = new Set(files.map((f) => f.path));
  const loose = [];
  for (const f of candidates) {
    if (hit.has(f) || ASSET.test(f)) continue;
    if (f.startsWith("apps/checkin-web/") || f.startsWith("packages/checkin-core/") || f.startsWith("docs/")) continue;
    const t = readText(f);
    if (t === null || !/checkin/i.test(t)) continue;
    const ln = t.split("\n").findIndex((l) => /checkin/i.test(l)) + 1;
    loose.push({ path: f, column: columnOf(f), reason: "綴りの揺れ（単語では当たらない）", firstLine: ln });
  }
  extra.looseOnly = { files: loose, totals: loose.reduce((a, f) => ((a[f.column]++), a), { code: 0, test: 0, docs: 0, asset: 0 }) };
}
if (trial === "method") {
  // 参考: METHOD_IDS という識別子そのものを持つファイル（既知の値 9）
  extra.methodIdsSymbolFiles = candidates.filter((f) => !ASSET.test(f) && (readText(f) ?? "").match(/\bMETHOD_IDS\b/)).sort();
}
files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
const totals = { code: 0, test: 0, docs: 0, asset: 0 };
for (const f of files) totals[f.column]++;
const byTop = {};
for (const f of files) { const t = f.path.split("/").slice(0, 2).join("/"); byTop[t] = (byTop[t] ?? 0) + 1; }
const sorted = Object.fromEntries(Object.entries(byTop).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
process.stdout.write(JSON.stringify({ trial, patterns: patterns.map((p) => p.name), files, totals, byTop: sorted, ...extra }, null, 1) + "\n");
