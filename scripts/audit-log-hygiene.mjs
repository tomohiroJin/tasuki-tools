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

/**
 * 行が `//` コメント、または `*` で始まる行かどうか（インデントは無視）。
 *
 * `*` 始まりは JSDoc / ブロックコメントの継続行（` * 本文`）と、ブロック
 * コメントの閉じ行（`*\/` や `*\/ 実コード`）の両方を含む。**閉じ行に実コードが
 * 続く場合はその実コードも一緒に読み飛ばす。** これは意図した安全側ではなく、
 * この単純な規則を選んだことの副作用として受け入れている既知の見落としである
 * （理由は下の `findViolations` のコメントを参照）。
 */
function isCommentLine(line) {
  const t = line.trimStart();
  return t.startsWith("//") || t.startsWith("*");
}

/**
 * 1 ファイル分の違反行を返す（純粋）。
 * 戻り値: `[{ file, line, kind }]`
 *
 * **行をまたぐ状態を一切持たない。** 各行は他の行と無関係に、独立に判定する。
 * `isCommentLine` でコメント行と判定された行は丸ごと読み飛ばし、それ以外の
 * 行は加工せず生のテキストのまま禁止構文と照合する。文字列・正規表現リテラル・
 * ブロックコメントの「中にいるかどうか」は一切追跡しない。
 *
 * この検査はかつて `maskComments` / `maskLine` という文字単位の状態機械（文字列
 * 状態・行コメント状態・ブロックコメント状態を行をまたいで持ち回る設計）だった。
 * レビューで 3 回連続、直すたびに**別の場所に新しい検出漏れ**を持ち込んだ
 * （1: ブロックコメントが同じ行で閉じてから実コードが続くケースの取りこぼし、
 *  2: 正規表現リテラル内のエスケープされたスラッシュを `//` と誤認、
 *  3: 正規表現っぽい断片が乗った行の early return がテンプレートリテラルの
 *     継続状態を巻き添えでリセットし、離れた行の判定が変わる）。
 * 3 件目は特に深刻だった: **ある行に書いた無関係なコードが、別の行の判定結果を
 * 変えてしまう**（非局所的な副作用）。JavaScript を正しく字句解析するには本物の
 * レキサが要るのに、200 行の検査スクリプトで手書きしようとしていたのが無理
 * だった。書き換えるたびに穴の場所が移動するだけで収束しなかった。
 *
 * そこで状態を完全に捨て、**各行の判定が他の行に一切依存しない**設計へ倒した。
 * これにより「ある行の変更が別の行の検出結果を変える」という非局所的なバグは
 * 原理的に起こり得なくなる。トレードオフとして、行単位の判定では拾えない
 * ケースが偽陽性・偽陰性の両方に残る（下記）。**この検査の目的（資格情報が
 * ログへ出ないことを機械的に見張る）にとって、非局所的で予測不能な検出漏れの
 * 方が、局所的で説明可能な見落としより悪いと判断した。** 見落としが実際に
 * 実害を生むなら、そのときは行の書き方（コメントの文言を変える等）か
 * ALLOWED_FILES・マーカーで個別に対処する。
 *
 * 既知の見落とし（意図して受け入れる）:
 *   - ブロックコメントの閉じ行に実コードが続く場合（`*\/ console.log(x)`）、
 *     その行は `*` 始まりとして丸ごと読み飛ばされ、実コードの違反は検出されない
 *     （偽陰性）。実リポジトリでこの書き方をしている箇所は無いことを確認済み。
 *   - 複数行文字列・テンプレートリテラルの中身が `//` や `*` で始まる行は、
 *     実際にはコメントでなくても読み飛ばされる（偽陰性）。
 *   - ブロックコメントの継続行が `*` で始まらない場合、コメントの地の文が
 *     禁止構文の語を含んでいると違反として拾われる（偽陽性・安全側）。
 *   - 文字列・正規表現リテラルの中身に禁止構文の語が含まれていると、そのまま
 *     違反として拾われる（偽陽性・安全側）。
 *
 * 許可マーカーの検出も同じ生のテキストに対して行う。
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
