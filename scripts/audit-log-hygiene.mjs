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
 * 正規表現リテラルらしき部分を含むか（構文解析なしのヒューリスティック）。
 *
 * JavaScript の `/` が正規表現の開始か除算かは構文の文脈が無いと正確には
 * 判定できない。200 行の検査スクリプトでそれを完全に解くのは割に合わないため、
 * 「怪しければ安全側へ倒す」ヒューリスティックに留める。スラッシュ・
 * （エスケープされた文字またはスラッシュ以外の文字）1 個以上・スラッシュ、
 * という形に一致すれば「正規表現リテラルかもしれない」とみなす。
 *
 * 除算の連続（`a / b / c` 等）にも誤って一致しうるが、後述のとおり誤検出は
 * 安全側（マスクを諦めてそのまま照合する）にしか働かないため許容する。
 */
const REGEX_LITERAL_LIKE = /\/(?:\\.|[^/\\\n])+\/[a-zA-Z]*/;

/**
 * ソース全体をコメント除去した同じ長さの文字列へ変換する（純粋・行番号を保つ）。
 *
 * 行頭だけを見る `isCommentLine` は、**ブロックコメントが同じ行で閉じてから
 * 実コードが続く**ケース（`/* note *\/ console.log(x)` や、複数行コメントが
 * `*\/ console.log(x)` で閉じて続くケース）を取りこぼす。1 行単位の判定では
 * 「コメントの内側にいるかどうか」という行をまたぐ状態を表現できないため、
 * `scripts/check-links.mjs` の `fenceMask`（Markdown のコードフェンスの状態を
 * 行をまたいで持つマスク）にならい、行をまたいで状態（`state` / `quote`）を
 * 持ち回りながら 1 行ずつ処理する。
 *
 * 文字列リテラル（`"` / `'` /` \` `）の中身は状態遷移の対象から外し、そのまま
 * 保持する。中の `//` や `/*` を誤ってコメント開始と読んでしまうと、続くコード
 * が丸ごとコメント扱いになり検出漏れという危険な向きの欠陥になるため。
 * その結果、文字列の中の `console.` などは除去されずに残り、引き続き違反として
 * 拾われる（安全側の誤検出。意図的に直さない。テストと report を参照）。
 *
 * **正規表現リテラルは状態として持たない。** 中のエスケープされたスラッシュ
 * （`/http:\/\//` 等）を文字単位で追うと `//` や `/*` のペアと誤認し、
 * その行の残りを丸ごとコメント扱いにして消してしまう（文字列と同じ問題だが、
 * 起きた場合の被害はより深刻＝検出漏れ）。正規表現とただの除算を構文解析
 * 無しに区別するのは割に合わないため、**行がコード状態で始まっており、かつ
 * 正規表現リテラルらしき文字列を含む場合は、その行のマスクを一切かけず
 * 生のテキストのまま禁止構文と照合する。** 正規表現の中に `console.` 等が
 * 含まれていた場合は偽陽性になるが、偽陽性は「余計に赤くなる」だけで
 * 検出漏れよりはるかにましという、この検査全体の fail-closed 方針と一致する。
 */
function maskLine(line, state, quote) {
  if (state === "code" && REGEX_LITERAL_LIKE.test(line)) {
    return { masked: line, state: "code", quote: null };
  }
  let out = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    const c2 = i + 1 < line.length ? line[i + 1] : "";
    if (state === "code") {
      if (c === '"' || c === "'" || c === "`") {
        state = "string";
        quote = c;
        out += c;
      } else if (c === "/" && c2 === "/") {
        state = "line";
        out += "  ";
        i++;
      } else if (c === "/" && c2 === "*") {
        state = "block";
        out += "  ";
        i++;
      } else {
        out += c;
      }
      continue;
    }
    if (state === "string") {
      if (c === "\\") {
        // エスケープの次の 1 文字は判定せず素通りさせる（\" を終端と誤認しない）。
        out += c + (i + 1 < line.length ? line[i + 1] : "");
        i++;
      } else {
        out += c;
        if (c === quote) {
          state = "code";
          quote = null;
        }
      }
      continue;
    }
    if (state === "line") {
      // line コメントは行末で終わる。1 行ずつ処理するのでここに来たら全部マスクする。
      out += " ";
      continue;
    }
    // state === "block"
    if (c === "*" && c2 === "/") {
      state = "code";
      out += "  ";
      i++;
    } else {
      out += " ";
    }
  }
  // line コメントの状態は物理行末で必ず終わる（次の行へ持ち越さない）。
  if (state === "line") state = "code";
  return { masked: out, state, quote };
}

/** ソース全体へ `maskLine` を行ごとに適用し、状態を持ち回る。 */
function maskComments(source) {
  let state = "code";
  let quote = null;
  const maskedLines = source.split("\n").map((line) => {
    const r = maskLine(line, state, quote);
    state = r.state;
    quote = r.quote;
    return r.masked;
  });
  return maskedLines.join("\n");
}

/**
 * 1 ファイル分の違反行を返す（純粋）。
 * 戻り値: `[{ file, line, kind }]`
 *
 * 禁止構文の照合はコメント除去後のテキストに対して行い、許可マーカーの検出は
 * **元の行**に対して行う（マーカーは `//` コメントの中にあるため、除去後の
 * テキストで探すと消えてしまう）。
 */
export function findViolations(relPath, source) {
  const allowed = ALLOWED_FILES.includes(relPath);
  const originalLines = source.split("\n");
  const codeLines = maskComments(source).split("\n");
  const out = [];
  originalLines.forEach((originalText, i) => {
    const codeText = codeLines[i] ?? "";
    for (const { name, re } of FORBIDDEN) {
      if (!re.test(codeText)) continue;
      if (allowed && originalText.includes(ALLOW_MARKER)) continue;
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
