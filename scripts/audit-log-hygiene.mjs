#!/usr/bin/env node
/**
 * ログ衛生の検査（Issue #136・ADR 0012 D1）。
 *
 * 規則は 1 つだけ:
 *   禁止された構文（console.* / process.stdout.write / process.stderr.write /
 *   publicText の呼び出し / as LogSafe）は、**許可ファイルの、許可マーカーが
 *   付いた行**にしか置けない。
 *
 * **最初から fail-closed に作る。** 検査が「何も見つけられない状態」を成功と
 * report しないよう、次の 2 つを同時に見る。
 *   1. 許可ファイルにマーカーが 1 つも無い → 陳腐化した許可として赤。
 *      console を消して許可だけ残す／許可を消して console を残す、
 *      どちらの向きにも穴を作らない。
 *   2. 必須ファイルが走査結果に無い → 赤。走査対象を失うと全件 PASS になる型の
 *      欠陥を最初から塞ぐ。**件数の下限は直書きしない。** ファイルが減るたびに
 *      下限を下げるのが赤を消す最短経路になり、対応表から項目を消すのと同じ穴になる。
 *
 * 設計方針: 判定は純粋関数にし、実ファイル I/O は main() の薄い配線だけにする。
 * 追加依存は禁止のため Node 標準の fs / path のみを使う。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

/** 走査するディレクトリ（リポジトリルート起点）。 */
export const SCAN_DIRS = ["apps/timer-sync/src", "apps/poker-sync/src"];

/**
 * 禁止構文を置いてよいファイル。**行に許可マーカーが必要。**
 *
 * 実測（2026-08-13）で確認した許可マーカー付き 5 ファイルに加え、`as LogSafe`
 * を型注釈を経由せず直接キャストしている 2 ファイル（相関 ID の生成点
 * ref-encoder.ts と、publicText の本体 log-safe.ts）を含む。
 */
export const ALLOWED_FILES = [
  "apps/timer-sync/src/adapters/console-log-sink.ts",
  "apps/timer-sync/src/server.ts",
  "apps/timer-sync/src/adapters/ws-adapter.ts",
  "apps/timer-sync/src/application/log/vocabulary.ts",
  "apps/timer-sync/src/application/log/ref-encoder.ts",
  "apps/timer-sync/src/application/log/log-safe.ts",
  "apps/poker-sync/src/server.ts",
];

/** 走査結果に必ず存在しなければならないファイル（走査対象の消失を検出する）。 */
export const REQUIRED_FILES = [
  "apps/timer-sync/src/create-sync-server.ts",
  "apps/timer-sync/src/application/problem-delegation.ts",
  "apps/timer-sync/src/adapters/console-log-sink.ts",
  "apps/poker-sync/src/server.ts",
];

/** 許可マーカー。行末コメントに付ける。 */
const ALLOW_MARKER = "log-hygiene:allow";

/** 禁止構文。`publicText` は定義ではなく呼び出しだけを拾う。 */
const FORBIDDEN = [
  { name: "console", re: /\bconsole\s*\./ },
  { name: "process.stdout", re: /\bprocess\s*\.\s*stdout\s*\.\s*write\b/ },
  { name: "process.stderr", re: /\bprocess\s*\.\s*stderr\s*\.\s*write\b/ },
  { name: "publicText", re: /(?<!function\s)\bpublicText\s*\(/ },
  // `as LogSafe` は型の壁を迂回する第 2 の経路。publicText だけを見ていると
  // `foo as LogSafe` がどこにでも書けてしまい、検査が意味を失う。
  { name: "as LogSafe", re: /\bas\s+LogSafe\b/ },
];

/** 行が行コメント・ブロックコメントの本文かどうか（インデントは無視）。 */
function isCommentLine(line) {
  const t = line.trimStart();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

/**
 * 1 ファイル分の違反行を返す（純粋）。
 * 戻り値: `[{ file, line, kind }]`
 */
export function findViolations(relPath, source) {
  const allowed = ALLOWED_FILES.includes(relPath);
  const out = [];
  source.split("\n").forEach((text, i) => {
    if (isCommentLine(text)) return;
    for (const { name, re } of FORBIDDEN) {
      if (!re.test(text)) continue;
      if (allowed && text.includes(ALLOW_MARKER)) continue;
      out.push({ file: relPath, line: i + 1, kind: name });
    }
  });
  return out;
}

/** 許可ファイルのうち、マーカーを 1 つも持たないものを返す（純粋）。 */
export function findStaleAllowances(scanned) {
  return ALLOWED_FILES.filter((f) => {
    const src = scanned.get(f);
    return src === undefined || !src.includes(ALLOW_MARKER);
  });
}

/** 走査結果に無い必須ファイルを返す（純粋）。 */
export function findMissingRequired(scanned) {
  return REQUIRED_FILES.filter((f) => !scanned.has(f));
}

/** ディレクトリ配下の .ts を読む（`dist` と `node_modules` は除外）。 */
function readTsFiles(rootDir) {
  const result = new Map();
  const abs = path.join(REPO_ROOT, rootDir);
  if (!fs.existsSync(abs)) return result;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) {
        const rel = path.relative(REPO_ROOT, full).split(path.sep).join("/");
        result.set(rel, fs.readFileSync(full, "utf8"));
      }
    }
  };
  walk(abs);
  return result;
}

function main() {
  const scanned = new Map();
  for (const dir of SCAN_DIRS) {
    for (const [k, v] of readTsFiles(dir)) scanned.set(k, v);
  }

  const problems = [];
  for (const f of findMissingRequired(scanned)) {
    problems.push(`必須ファイルが走査できていません → ${f}`);
  }
  for (const f of findStaleAllowances(scanned)) {
    problems.push(`許可が陳腐化しています（マーカーが 1 つもありません） → ${f}`);
  }
  for (const [rel, src] of scanned) {
    for (const v of findViolations(rel, src)) {
      problems.push(`${v.file}:${v.line} 直接の ${v.kind} は使えません（ADR 0012 D1）`);
    }
  }

  if (problems.length > 0) {
    for (const p of problems) console.error(p);
    console.error(`\n${problems.length} 件の問題があります（走査 ${scanned.size} ファイル）`);
    process.exit(1);
  }
  console.log(`ログ衛生 OK（走査 ${scanned.size} ファイル）`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
