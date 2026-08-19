#!/usr/bin/env node
/**
 * コードベース構造の走査スクリプト（Issue #28 G0）
 *
 * spec.md の「操作的定義（何を数えるか）」表を実装する。表が正本であり、本スクリプトはその実装にすぎない。
 * 各 SC 番号に 1 対 1 対応する関数を持つ（実装がズレたときに気づけるように）。
 *
 * 設計方針（T002 のテスト容易性のため）:
 * - 各 sc0XX 関数は「解析対象の文字列 / Map」を引数に取る**純粋関数**にする。
 *   実ファイルシステムを読むのは main() 内の薄い配線部分のみ。
 * - これにより単体テストは実リポジトリを一切スキャンしない（遅く壊れやすいテストを避ける）。
 *
 * 追加依存は禁止のため、Node 標準の fs / path のみを使う。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listWorkspacePackages,
  diffTargets,
  hasTargetDrift,
  formatTargetDiff,
  findEmptyScanDimensions,
  findMissingPaths,
} from "./lib/scan-targets.mjs";

/* ============================================================
 * 汎用ユーティリティ（実ファイル I/O。テスト対象は Map 側の純粋関数）
 * ============================================================ */

/**
 * ディレクトリ配下の対象拡張子ファイルを再帰的に読み、
 * { "ルートからの相対パス(posix区切り)": "内容" } の Map を返す。
 * 存在しないディレクトリは空 Map を返す。
 */
export function readFilesRecursive(rootDir, extensions) {
  const result = new Map();
  if (!fs.existsSync(rootDir)) return result;

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".d.ts")) {
        // 環境宣言ファイル（vite-env.d.ts 等）は import/export で到達させる対象ではないため除外する。
        continue;
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        const rel = path.relative(rootDir, full).split(path.sep).join("/");
        result.set(rel, fs.readFileSync(full, "utf8"));
      }
    }
  };
  walk(rootDir);
  return result;
}

/* ============================================================
 * SC-027: 製品コード入口から到達しないモジュール（グラフ探索）
 * ============================================================ */

/**
 * ソース中の import/export from 文・動的 import から相対指定子を抽出する。
 * 非相対（パッケージ間 import 等）は対象外（このスクリプトはパッケージ内の到達性のみ見る）。
 */
export function extractImportSpecifiers(source) {
  const specs = [];
  const staticRe = /(?:import|export)\s+(?:[^'";]*?\sfrom\s+)?["']([^"']+)["']/g;
  const dynamicRe = /import\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = staticRe.exec(source))) specs.push(m[1]);
  while ((m = dynamicRe.exec(source))) specs.push(m[1]);
  return specs;
}

/**
 * 相対 import 指定子を files（Map<相対パス, 内容>）の中の実在キーへ解決する。
 * `.js` → `.ts`/`.tsx` の読み替え、拡張子省略、`index` 解決を行う。
 * 解決できなければ null（非相対 import・存在しないファイルへの参照など）。
 */
export function resolveRelativeImport(fromPath, spec, files) {
  if (!spec.startsWith(".")) return null;
  const fromDir = path.posix.dirname(fromPath);
  const target = path.posix.normalize(path.posix.join(fromDir, spec));
  const candidates = [];
  if (target.endsWith(".js")) {
    const stem = target.slice(0, -3);
    candidates.push(`${stem}.ts`, `${stem}.tsx`);
  } else if (/\.(ts|tsx)$/.test(target)) {
    candidates.push(target);
  } else {
    candidates.push(
      `${target}.ts`,
      `${target}.tsx`,
      `${target}/index.ts`,
      `${target}/index.tsx`,
    );
  }
  return candidates.find((c) => files.has(c)) ?? null;
}

/**
 * entries から辿って到達可能なファイル集合を返す（BFS によるグラフ探索）。
 * files: Map<相対パス, 内容>。entries: files に存在するキーの配列。
 */
export function computeReachableFiles(files, entries) {
  const reachable = new Set();
  const queue = entries.filter((e) => files.has(e));
  while (queue.length > 0) {
    const current = queue.shift();
    if (reachable.has(current)) continue;
    reachable.add(current);
    const source = files.get(current);
    for (const spec of extractImportSpecifiers(source)) {
      const resolved = resolveRelativeImport(current, spec, files);
      if (resolved && !reachable.has(resolved)) queue.push(resolved);
    }
  }
  return reachable;
}

/**
 * SC-027 本体。files（1 パッケージの src 配下）と entries（入口ファイルの相対パス配列）から、
 * 製品コードの入口から到達しないファイル数を返す。
 */
export function sc027UnreachableModules(files, entries) {
  const reachable = computeReachableFiles(files, entries);
  let count = 0;
  for (const key of files.keys()) {
    if (!reachable.has(key)) count++;
  }
  return count;
}

/* ============================================================
 * SC-028: テストダブルの重複定義
 * ============================================================ */

/**
 * testFiles（Map<相対パス, 内容>）から Fake・Spy・Stub・Mock 系の定義箇所を集計し、
 * 2 箇所以上で定義されている「種類」の数を返す。
 *
 * 【欠陥1の修正】以前は「同名が2ファイル以上」で数えていたが、これでは同一ファイル内での
 * 重複定義（例: apps/web/test/platform/sound.test.ts 内で FakeAudio が5回、FakeOsc が2回、
 * FakeGain が2回、別々に定義されている）を見落とす。FR-097（テスト用代替実装は単一の箇所で
 * 定義されること）の違反はファイル境界とは無関係に起こるため、ファイル境界を問わず
 * 「定義箇所（出現回数）」で数える。
 */
export function sc028DuplicateTestDoubles(testFiles) {
  const occurrenceCountByName = new Map();
  const re = /\b(?:class|function|const)\s+((?:Fake|Spy|Stub|Mock)[A-Za-z0-9_]*)/g;
  for (const [, content] of testFiles) {
    let m;
    while ((m = re.exec(content))) {
      const name = m[1];
      occurrenceCountByName.set(name, (occurrenceCountByName.get(name) ?? 0) + 1);
    }
  }
  let count = 0;
  for (const occurrences of occurrenceCountByName.values()) {
    if (occurrences >= 2) count++;
  }
  return count;
}

/* ============================================================
 * it/test の第 1 引数（テスト名）抽出。SC-029/030/031/032/036 の共通土台
 * ============================================================ */

/**
 * ソースから `it(...)` / `test(...)`（`.skip` 等の修飾も可）の第 1 引数の文字列を抽出する。
 * describe は対象外（spec の計測の定義に従う）。
 */
export function extractTestNames(content) {
  const names = [];
  const re = /\b(?:it|test)(?:\.\w+)?\s*\(\s*(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let m;
  while ((m = re.exec(content))) names.push(m[2]);
  return names;
}

const SPEC_ID_RE = /T\d{3}|FR-\d{3}|SC-\d{3}|R\d-\d|US\d|G\d|#\d+/;

/**
 * SC-029: it/test の第 1 引数に仕様の識別番号を含むものの件数。
 * exceptFiles（相対パス配列）は FR-093 の例外表に該当するファイルを除外するために使う。
 */
export function sc029SpecIdsInNames(testFiles, exceptFiles = []) {
  let count = 0;
  for (const [file, content] of testFiles) {
    if (exceptFiles.includes(file)) continue;
    for (const name of extractTestNames(content)) {
      if (SPEC_ID_RE.test(name)) count++;
    }
  }
  return count;
}

const CALL_WORDS = ["呼ぶ", "呼び出す", "呼ばれる", "呼び出され", "spy", "モックが"];

/**
 * SC-030: テスト名が内部の関数名の言い回し、または「呼ぶ/呼ばれる/呼び出される/spy/モックが」を
 * 含むものの件数。判定は語の出現による（spec の注記のとおり、主語かどうかは機械判定しない）。
 */
export function sc030CallNamesInNames(testFiles) {
  let count = 0;
  for (const [, content] of testFiles) {
    for (const name of extractTestNames(content)) {
      const lower = name.toLowerCase();
      if (CALL_WORDS.some((w) => lower.includes(w.toLowerCase()) || name.includes(w))) count++;
    }
  }
  return count;
}

/* ============================================================
 * テスト本体の行範囲分割。SC-031/032 の共通土台
 * ============================================================ */

/**
 * ファイル内容を、テスト 1 件ずつの行配列に分割する。
 *
 * **終端は「その `it(` と同じ字下げで閉じる行」とする。**
 * spec の操作的定義は「次の `it`/`test`/末尾まで」と書いているが、これをそのまま実装すると
 * **テストの外側にある行まで本体に数えてしまう**。実例（`decide.test.ts`）:
 *
 * ```
 *   it("… 変わらない", () => {
 *     const result = decide(…);          ← 本体はここまでの 2 行
 *     expect(result…).toBe("SessionCompleted");
 *   });                                  ← 以降はテストの外
 * });                                    ← describe の閉じ
 *
 * // ─── START ───
 *
 * describe("decide: START", () => {      ← 次の describe の開始
 * ```
 *
 * 「次の `it(` まで」で切ると、この閉じ括弧 2 つまで本体に数え、
 * **実質 2 行のテストが「4 行」と判定される**。その結果 SC-032 の分母が水増しされ、
 * spec が明示的に対象外とした「本体 2 行以下のテスト」にまで区切りを要求してしまう。
 *
 * 字下げでの終端判定は、整形済みのコードであることに依存する（本リポジトリは prettier 整形済み）。
 * 見つからない場合は従来どおり次の `it`/末尾までにフォールバックする。
 */
export function splitIntoTestBodies(content) {
  const lines = content.split("\n");
  const testStartRe = /^(\s*)(?:it|test)(?:\.\w+)?\s*\(/;
  const bodies = [];
  for (let i = 0; i < lines.length; i++) {
    const m = testStartRe.exec(lines[i]);
    if (!m) continue;
    const indent = m[1];
    const closeRe = new RegExp(`^${indent}\\}\\)`);
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      if (closeRe.test(lines[j])) {
        end = j + 1;
        break;
      }
      // 終端が見つからないまま次のテストに達したら、そこで切る（従来の挙動へのフォールバック）
      if (testStartRe.test(lines[j])) {
        end = j;
        break;
      }
    }
    bodies.push(lines.slice(i, end));
  }
  return bodies;
}

/**
 * SC-031: 前提の構築段階に置かれた検証記述（`expect(...isOk()).toBe(true)`）の件数。
 * 「そのテスト内により後ろの expect が存在するもの」だけを数える。
 * 同形の記述でも、そのテストの最後の expect であるものは検証（Then）そのものとみなし除外する
 * （spec: 当初 95 件としていたが、うち 11 件がこれに該当したため 84 件に訂正した箇所）。
 */
export function sc031GuardExpects(testFiles) {
  const isOkRe = /expect\([^)]*isOk\(\)[^)]*\)\.toBe\(true\)/g;
  const expectRe = /expect\(/g;
  let total = 0;
  for (const [, content] of testFiles) {
    for (const bodyLines of splitIntoTestBodies(content)) {
      const body = bodyLines.join("\n");
      const isOkMatches = [...body.matchAll(isOkRe)];
      if (isOkMatches.length === 0) continue;
      const allExpectPositions = [...body.matchAll(expectRe)].map((m) => m.index);
      for (const match of isOkMatches) {
        const hasLaterExpect = allExpectPositions.some((pos) => pos > match.index);
        if (hasLaterExpect) total++;
      }
    }
  }
  return total;
}

const GIVEN_RE = /\/\/\s*(Given|準備)/;
const WHEN_RE = /\/\/\s*(When|操作)/;

function isMeaningfulLine(line) {
  const t = line.trim();
  return t !== "" && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
}

/**
 * テスト本体のうち、実質的な記述行数を数える。
 * `it(...) => {` の開始行と `});` の閉じ行はテスト本体の定型部分であり、
 * 前提・操作・検証の実質的な記述ではないため、本体の先頭行・末尾行を除いてから数える
 * （これを除かないと、1 アサーションのみの最小構成テストでも「開始行+検証行+閉じ行」で
 * 3 行に達してしまい、「1 行で完結するテストに区切りを付けても意味がない」という
 * spec の意図（SC-032 の除外規定）と食い違う）。
 */
function countMeaningfulBodyLines(bodyLines) {
  const inner = bodyLines.slice(1, -1);
  return inner.filter(isMeaningfulLine).length;
}

/**
 * SC-032: 本体が 3 行以上（空行・コメント行を除く）のテストにおいて、
 * `// Given` と `// When`（または準備/操作）の両方を含むものの割合を求める。
 *
 * 【計測単位についての注記】spec.md の操作的定義表は文言上「分母=テスト」「分子=ファイル」と
 * 単位が食い違って読める（424行目）。単位の異なる分子分母で割合を出すことはできないため、
 * 本実装は分母・分子とも「テスト本体単位」で統一する（FR-091 の対象が個々のテストであることとも整合する）。
 * この解釈の経緯は baseline.md に記録する。
 *
 * 戻り値は { denominator, numerator, ratio }。他の SC 関数と異なり件数が 1 つに定まらない
 * （分子・分母の 2 値が要る）ため、他関数と違う形の戻り値になっている。
 */
export function sc032GwtMarkers(testFiles) {
  let denominator = 0;
  let numerator = 0;
  for (const [, content] of testFiles) {
    for (const bodyLines of splitIntoTestBodies(content)) {
      const meaningfulCount = countMeaningfulBodyLines(bodyLines);
      if (meaningfulCount < 3) continue;
      denominator++;
      const body = bodyLines.join("\n");
      if (GIVEN_RE.test(body) && WHEN_RE.test(body)) numerator++;
    }
  }
  const ratio = denominator === 0 ? 1 : numerator / denominator;
  return { denominator, numerator, ratio };
}

/**
 * SC-036: it/test の総数（描画に依らずファイル横断でカウント）。
 */
export function sc036TestCount(testFiles) {
  let count = 0;
  for (const [, content] of testFiles) count += extractTestNames(content).length;
  return count;
}

/* ============================================================
 * SC-035: 利用者向け文言の定義箇所（正規表現の近接ペアリングは使わない）
 * ============================================================ */

function findEnclosingBraceStart(source, fromIdx) {
  let depth = 0;
  for (let i = fromIdx; i >= 0; i--) {
    const ch = source[i];
    if (ch === "}") depth++;
    else if (ch === "{") {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

function findMatchingBraceEnd(source, fromIdx) {
  let depth = 0;
  for (let i = fromIdx; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * ソースから「同一のオブジェクトリテラル内にある code / message の組」だけを抽出する。
 * `code:` の位置から波括弧の対応を辿って同一スコープを特定し、その中の `message:` のみ拾う
 * （正規表現の近接ペアリングでは誤対応するため、これを避ける設計。plan.md/spec.md の指示）。
 */
export function extractCodeMessagePairs(source) {
  const pairs = [];
  const codeRe = /\bcode:\s*["'`]([A-Za-z0-9_]+)["'`]/g;
  let m;
  while ((m = codeRe.exec(source))) {
    const braceStart = findEnclosingBraceStart(source, m.index);
    if (braceStart === -1) continue;
    const braceEnd = findMatchingBraceEnd(source, braceStart);
    if (braceEnd === -1) continue;
    const scope = source.slice(braceStart, braceEnd + 1);
    const msgMatch =
      /\bmessage:\s*(["'])((?:\\.|(?!\1)[\s\S])*?)\1/.exec(scope) ??
      /\bmessage:\s*`([^`]*)`/.exec(scope);
    if (msgMatch) {
      pairs.push({ code: m[1], message: msgMatch[2] ?? msgMatch[1] });
    }
  }
  return pairs;
}

/**
 * クライアント側の `ERROR_MESSAGES = { CODE: "文言", ... }` 形式のテーブルからコード集合を抽出する。
 */
export function extractClientErrorTable(source) {
  const match = /ERROR_MESSAGES[^={]*[:=]\s*\{([\s\S]*?)\n\}/.exec(source);
  if (!match) return new Set();
  const body = match[1];
  const codes = new Set();
  const re = /(?:^|\n)\s*([A-Za-z][A-Za-z0-9_]*)\s*:/g;
  let m;
  while ((m = re.exec(body))) codes.add(m[1]);
  return codes;
}

/**
 * SC-035: 同一のエラーコードに対する文言の定義箇所が 2 箇所以上あるものの件数。
 * serverSources: サーバー側ソース文字列の配列。clientSource: クライアント側の文言テーブルを含むソース。
 */
export function sc035MessageDefinitions(serverSources, clientSource) {
  const serverCodeCounts = new Map();
  for (const src of serverSources) {
    for (const { code } of extractCodeMessagePairs(src)) {
      serverCodeCounts.set(code, (serverCodeCounts.get(code) ?? 0) + 1);
    }
  }
  const clientCodes = extractClientErrorTable(clientSource);
  let count = 0;
  for (const [code, serverSites] of serverCodeCounts) {
    const totalSites = serverSites + (clientCodes.has(code) ? 1 : 0);
    if (totalSites >= 2) count++;
  }
  return count;
}

/* ============================================================
 * SC-039: 生きたモジュール内部の到達不能な要素（分岐・データ・公開記号）
 * ============================================================ */

/**
 * SC-039①: apps/ の到達不能な分岐。
 * 【限界】機械判定が難しいため、既知のパターン（`!room.onBreak`）の検出に留める。
 * 一般の「受理コマンド集合から到達しない条件」の網羅的判定は行わない（spec/plan の指示どおり）。
 *
 * **文字列リテラルとコメントを除去してから照合する。**
 * これを忘れると、**撤去した分岐について説明したコメントに一致して「まだ残っている」と誤判定する。**
 * 実際に T080 で分岐を撤去したあと、撤去の理由を述べたコメント中の記述に一致し、
 * 件数が 1 のまま減らなかった。**コメントは分岐ではない。**
 */
export function sc039aUnreachableBranchInApps(handlersSource) {
  return /!room\.onBreak/.test(stripStringsAndComments(handlersSource)) ? 1 : 0;
}

/**
 * ソースから `export const/function/class/interface/type NAME` の宣言を抽出する。
 *
 * 【欠陥3の修正】以前は const/interface/type のみを対象にしており、
 * `export function` / `export class` を取りこぼしていた
 * （実例: packages/core/src/participants.ts の `countManagers`）。
 */
export function extractPublicDeclarations(source) {
  const decls = [];
  const re = /export\s+(const|function|class|interface|type)\s+([A-Za-z0-9_]+)/g;
  let m;
  while ((m = re.exec(source))) decls.push({ kind: m[1], name: m[2] });
  return decls;
}

/**
 * ソースから文字列リテラル（"..." / '...' / `...`）とコメント（// と /* *\/）を取り除く。
 * 完全な字句解析ではない簡易スキャンだが、エスケープ（`\"` 等）は考慮する。
 *
 * 【欠陥4の対応】`isReferencedElsewhere` が文字列リテラルの中身にまで `\bNAME\b` で一致してしまい
 * 誤判定する問題（実例: `ja` が他ファイルの言語コード文字列 `"ja"` に一致してしまう）を避けるため、
 * 参照判定の対象を「識別子としての使用」に近づける前処理として使う。
 */
export function stripStringsAndComments(source) {
  let result = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < n) {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    result += ch;
    i++;
  }
  return result;
}

/**
 * `export { name } from "./mod.js"` のような**素通しの再エクスポート文**を取り除く。
 * これを取り除かないと、index.ts が再エクスポートしているだけの記号（例: i18n の ja/en）が
 * 「他ファイルから参照されている」と誤判定される（再エクスポートは消費ではなく通過点）。
 */
function stripNamedReexports(source) {
  // `export type { … } from "…"` も対象にする。
  // T055 で index.ts の `export *` を明示列挙に置き換えた際、型の再エクスポートが
  // `export type { … } from "…"` の形になり、`type` を許さない旧実装ではこれを
  // 取り除けなかった。その結果 **index.ts の再エクスポートが「本物の参照」と数えられ**、
  // SC-039③ が 46 → 9 に落ちた（実際には 1 件も減っていないのに減ったように見えた）。
  // 再エクスポートは消費ではなく通過点であり、参照の根拠にしてはならない。
  return source.replace(/export\s+type\s*\{[^}]*\}\s*from\s*["'][^"']+["'];?/g, "").replace(
    /export\s*\{[^}]*\}\s*from\s*["'][^"']+["'];?/g,
    "",
  );
}

function isReferencedElsewhere(name, ownFile, productSources) {
  const re = new RegExp(`\\b${name}\\b`);
  for (const [file, src] of productSources) {
    if (file === ownFile) continue;
    // 欠陥4の修正: 文字列リテラル・コメントを除去してから照合し、識別子としての使用のみを見る。
    if (re.test(stripStringsAndComments(stripNamedReexports(src)))) return true;
  }
  return false;
}

/**
 * ソース中の「トップレベルの宣言（`export` の有無を問わない `const/function/class/interface/type`）」
 * の開始位置を、出現順にすべて列挙する。
 *
 * 【宣言スパン境界のバグ修正】以前の実装は「次の `export` 宣言まで」を現在の宣言の本体とみなしていた。
 * しかし実際のソース（例: packages/core/src/schemas.ts）では、export された宣言の間に
 * **export されていないトップレベルの補助宣言**（例: `const SessionActCommand = ...`）が挟まる。
 * 「次の export まで」で区切ると、この補助宣言の中身までもが手前の export 宣言の本体に
 * 誤って取り込まれてしまい、(a) 行数の過大計上、(b) 「自ファイル内で参照されているか」の
 * 判定が、実際には別の宣言による参照であるにもかかわらず「自分自身の本体内」と誤認され
 * 検出できない、という 2 つの不具合を引き起こす。宣言の境界は export の有無に関係なく
 * 「次のトップレベル宣言の開始位置」までとするのが正しい。
 */
function allDeclarationStartIndices(source) {
  const re = /^(?:export\s+)?(?:const|function|class|interface|type)\s+[A-Za-z0-9_]+/gm;
  const indices = [];
  let m;
  while ((m = re.exec(source))) indices.push(m.index);
  return indices;
}

/**
 * exportedStartIndex から始まる宣言の本体スパン [start, end) を返す。
 * end は「その後に続く、次のトップレベル宣言（export の有無を問わない）の開始位置」
 * （無ければソース末尾）。
 */
function declarationSpanFrom(source, exportedStartIndex) {
  const boundaries = allDeclarationStartIndices(source);
  const end = boundaries.find((pos) => pos > exportedStartIndex) ?? source.length;
  return { start: exportedStartIndex, end };
}

/**
 * ソースを「トップレベル宣言（`export` の有無を問わない）の開始位置から次のそれまで」で
 * 分割し、各宣言（公開・非公開の両方）の名前と本体テキストを返す。
 *
 * 【非公開の中間宣言も経由点として扱う】`export` されたシンボルの間だけで参照グラフを組むと、
 * 非公開のトップレベル宣言を経由する参照の連鎖が切れてしまう（実例: `packages/timer-core/src/schemas.ts`
 * の `ServerMsgSchema`（公開・生きた根から到達）は非公開の `SnapshotMsg` を配列要素に持ち、
 * `SnapshotMsg` の本体が公開の `RoomSchema` を参照する。`SnapshotMsg` を経由点として扱わないと、
 * 本来生きている `RoomSchema` を誤って死んでいると判定してしまう）。
 * そのため参照グラフのノードは公開・非公開を問わずすべてのトップレベル宣言とし、
 * 「生きた根」の判定（他ファイルから参照されているか）だけを公開シンボルに限定する。
 */
function extractAllTopLevelSymbolSpans(source) {
  const re = /^(?:export\s+)?(const|function|class|interface|type)\s+([A-Za-z0-9_]+)/gm;
  const matches = [];
  let m;
  while ((m = re.exec(source))) matches.push({ kind: m[1], name: m[2], index: m.index });
  return matches.map((cur, i) => {
    const end = i + 1 < matches.length ? matches[i + 1].index : source.length;
    return { kind: cur.kind, name: cur.name, body: source.slice(cur.index, end) };
  });
}

/**
 * ファイル内の公開シンボルのうち「推移的に生きているもの」の名前集合を返す
 * （戻り値には経由点として使った非公開の中間宣言の名前も含まれ得るが、
 * 呼び出し側は公開シンボルの名前だけを問い合わせるため実害はない）。
 *
 * 【欠陥2の再修正: 推移的な生存性】以前の実装は「自ファイル内で参照されていれば生存」としていたが、
 * これだと「死んだ記号からの参照」まで生存の根拠にしてしまう（実例: `packages/timer-core/src/i18n/ja.ts` の
 * `ja` は同一ファイルの `export type JaMessages = typeof ja;` から参照されているが、
 * `JaMessages` 自体はどの製品コードからも使われていない死んだ型であり、
 * 死んだ記号からの参照を生存の根拠にしてはならない）。
 *
 * 正しい定義:
 * 1. 「生きた根」= 自ファイル以外の製品コードから識別子として参照されている**公開**シンボル
 *    （`isReferencedElsewhere` で判定。テストは productSources に含めないことで FR-090 を満たす）。
 * 2. ある宣言（公開・非公開を問わない）は、生きた根から**同一ファイル内の参照関係を推移的に辿って**
 *    到達できるなら生きている（固定点に達するまで繰り返し伝播させる。非公開の中間宣言を経由する
 *    多段の連鎖にも対応する）。
 */
function computeTransitivelyAliveExportedSymbols(content, ownFile, productSources) {
  const exportedNames = new Set(extractPublicDeclarations(content).map((d) => d.name));
  const spans = extractAllTopLevelSymbolSpans(content);
  const alive = new Set(
    spans
      .filter((s) => exportedNames.has(s.name) && isReferencedElsewhere(s.name, ownFile, productSources))
      .map((s) => s.name),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const aliveName of [...alive]) {
      const aliveSpan = spans.find((s) => s.name === aliveName);
      if (!aliveSpan) continue;
      const body = stripStringsAndComments(aliveSpan.body);
      for (const s of spans) {
        if (alive.has(s.name) || s.name === aliveName) continue;
        if (new RegExp(`\\b${s.name}\\b`).test(body)) {
          alive.add(s.name);
          changed = true;
        }
      }
    }
  }
  return alive;
}

function countDeclarationLines(content, name) {
  const startMatch = new RegExp(`export\\s+const\\s+${name}\\b`).exec(content);
  if (!startMatch) return 0;
  const { start, end } = declarationSpanFrom(content, startMatch.index);
  return content.slice(start, end).split("\n").length;
}

/**
 * SC-039②: 各 packages 配下 src の公開データ（`export const`）のうち、製品コード
 * （各 apps 配下 src と、宣言ファイル自身を除く各 packages 配下 src）から一度も参照されないものの行数合計。
 * **テストからの参照は根拠に含めない**（FR-090。productSources にテストを渡さないこと）。
 */
export function sc039bUnusedPublicData(packageSrcFiles, productSources) {
  let unusedLines = 0;
  for (const [file, content] of packageSrcFiles) {
    const alive = computeTransitivelyAliveExportedSymbols(content, file, productSources);
    for (const decl of extractPublicDeclarations(content)) {
      if (decl.kind !== "const") continue;
      if (alive.has(decl.name)) continue;
      unusedLines += countDeclarationLines(content, decl.name);
    }
  }
  return unusedLines;
}

/**
 * SC-039③: 各 packages 配下 src の公開記号（const/interface/type 全種）のうち、
 * 製品コードから一度も参照されない（＝自ファイル内でのみ使われる。export が不要）ものの件数。
 * **テストからの参照は根拠に含めない**（FR-090）。
 *
 * `exceptions`（{@link SC039C_EXCEPTIONS} と同じ形）に載る `file::name` の組は数えない。
 * 例外表が腐っていないかは {@link findStaleSymbolExceptions} が別に見る。
 * **ここは腐りを見ない** — 実在しない記号を例外に書けば、ここは黙って数えないだけである。
 */
export function sc039cSelfOnlyPublicSymbols(packageSrcFiles, productSources, exceptions = []) {
  // 【②との違い】ここでは間接利用（同一ファイル内の他の公開関数経由での参照）を
  // 「生きている」根拠にしない。③ が数えるのは「export が不要かどうか」であり、
  // 他ファイルが export された名前そのものを直接使っているかだけが判定材料になる。
  // 同一ファイル内でしか使われていない（＝直接 import されていない）なら、
  // その関数経由で内部的に使われていても export は不要である
  // （実例: problem.ts の FALLBACK_PROBLEMS は pickFallback から内部参照されるが、
  // 他ファイルは FALLBACK_PROBLEMS を直接 import していないため export 不要＝③対象）。
  const excepted = new Set(exceptions.map((e) => `${e.file}::${e.name}`));
  let count = 0;
  for (const [file, content] of packageSrcFiles) {
    for (const decl of extractPublicDeclarations(content)) {
      if (excepted.has(`${file}::${decl.name}`)) continue;
      if (!isReferencedElsewhere(decl.name, file, productSources)) count++;
    }
  }
  return count;
}

/**
 * SC-039 まとめ。3 種の内訳をまとめて返す（他の SC 関数と異なり複合値）。
 */
export function sc039UnreachableElements({
  handlersSource,
  packageSrcFiles,
  productSources,
  exceptions = [],
}) {
  return {
    unreachableBranches: sc039aUnreachableBranchInApps(handlersSource),
    unusedPublicDataLines: sc039bUnusedPublicData(packageSrcFiles, productSources),
    selfOnlyPublicSymbols: sc039cSelfOnlyPublicSymbols(
      packageSrcFiles,
      productSources,
      exceptions,
    ),
  };
}

/* ============================================================
 * 実リポジトリへの配線（main）
 * ============================================================ */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const EXT_TS = [".ts", ".tsx"];

/**
 * 走査するパッケージ。**src と test は独立に宣言する。**
 *
 * テストディレクトリ名は `test` と `tests` で割れている（実測）。規則で導出すると
 * 必ずどちらかを取りこぼすため、宣言して実体と照合する（#135 経路②⑪・ADR-0014）。
 * `entry` は SC-027 の到達性測定の起点。持たないパッケージは null。
 */
export const SCANNED_PACKAGES = [
  { pkg: "packages/timer-core", src: "src", test: "test", entry: "index.ts" },
  { pkg: "packages/poker-core", src: "src", test: "tests", entry: "index.ts" },
  { pkg: "packages/protocol", src: "src", test: "tests", entry: "index.ts" },
  { pkg: "packages/rate-limit", src: "src", test: "tests", entry: "index.ts" },
  { pkg: "apps/timer-sync", src: "src", test: "test", entry: "server.ts" },
  { pkg: "apps/timer-web", src: "src", test: "test", entry: "main.tsx" },
  { pkg: "apps/poker-sync", src: "src", test: "tests", entry: "server.ts" },
  { pkg: "apps/poker-web", src: "src", test: "tests", entry: "main.tsx" },
  { pkg: "apps/landing", src: "src", test: "tests", entry: "main.tsx" },
  { pkg: "e2e", src: null, test: "tests", entry: null },
];

/** 走査から外すパッケージ。**理由が要る。** */
export const EXCLUDED_PACKAGES = [
  { pkg: "packages/ui", reason: "src・tests とも TS を 1 つも持たない（CSS トークンとフォント）" },
];

/**
 * SC-039③ の例外。**検査の土台になっている公開記号だけ**を、理由つきで載せる。
 *
 * FR-090 は「テストからの参照は生存の根拠に含めない」と定めており、原則はそのとおりでよい。
 * ただし、その記号を失うと**検査そのものが弱くなる**ものが実在する。それらは公開を残し、
 * ここへ理由つきで挙げる。理由を書けないものは例外にしない。
 *
 * **例外表は両方向に腐る。** 記号が消えたのに例外が残れば同名の別記号を静かに覆い、
 * 記号が製品から使われ始めれば例外そのものが不要になる。
 * どちらも {@link findStaleSymbolExceptions} が落とす。
 */
export const SC039C_EXCEPTIONS = [
  {
    file: "packages/timer-core/src/errors.ts",
    name: "SYNC_ERROR_CODES",
    reason:
      "apps/timer-sync/test/error-code-coverage.test.ts がソースと双方向に照合済みの権威列挙として起点にしている（PR #34 のレビューで塞いだ穴の土台）",
  },
  {
    file: "packages/timer-core/src/schemas.ts",
    name: "ServerMsgSchema",
    reason: "apps/timer-sync/test/live-ws.protocol.test.ts が実 WS の全フレームを突き合わせる契約",
  },
  {
    file: "packages/timer-core/src/schemas.ts",
    name: "RoomSchema",
    reason:
      "packages/timer-core/test/ai-unlock.test.ts がスキーマの entries を直接検査している（公開 API 経由では書けない）",
  },
  {
    file: "packages/timer-core/src/error-messages.ts",
    name: "DEFAULT_ERROR_MESSAGE",
    reason: "既定文言の正本。落とすと 3 ファイルへ文言リテラルが複製される",
  },
];

/**
 * 例外表が腐っていないかを見る（純粋）。問題が無ければ空配列。
 *
 * ## 何を見るか
 *
 * 例外 1 件ごとに、次の 3 つの向きで落とす。
 *
 *   1. 例外が指すファイルに その記号の公開宣言が無い（記号が消えた／改名された）。
 *      ファイルごと走査対象に無い場合も同じ向きの腐りとして落とす。
 *   2. 例外の記号が製品コードから参照されている（例外がもう要らない）
 *   3. 理由が空（{@link EXCLUDED_PACKAGES} と同じ作法。理由の書けない例外は置かない）
 *
 * ## 何を見ていないか — **「足りる」とは言わない**
 *
 * - **理由の内容が本当かは見ていない。** 空文字列でないことしか見ないので、
 *   でたらめな理由を書けば通る。理由はレビューが読むためのものである。
 * - **例外に挙げるべき記号が挙がっているかは見ていない。** これは
 *   「挙げた例外が腐っていないか」だけを見る片方向の検査であり、
 *   指標そのもの（{@link sc039cSelfOnlyPublicSymbols} が数える件数）が
 *   もう片方向を受け持つ。
 * - **参照の判定は `isReferencedElsewhere` と同じ精度しか持たない。**
 *   文字列リテラルとコメントを除いた素の `\bNAME\b` 照合なので、
 *   同名の別記号（別ファイルのローカル変数など）に当たれば「参照されている」に倒れる。
 *   その向きは例外が余計に消される側＝安全側である。
 * - **記号の宣言は `extractPublicDeclarations` が拾える書き方に限られる。**
 *   `export { X }` のような後置きの公開は拾えない（拾えなければ 1. で落ちる＝安全側）。
 *
 * @param exceptions 例外表（`{ file, name, reason }` の配列）
 * @param packageSrcFiles `Map<リポジトリ相対パス, ソース>`。SC-039③ が数える走査対象そのもの
 * @param productSources `Map<リポジトリ相対パス, ソース>`。参照元となる製品コード（テストを含めない）
 */
export function findStaleSymbolExceptions(exceptions, packageSrcFiles, productSources) {
  const problems = [];
  for (const e of exceptions) {
    if (typeof e.reason !== "string" || e.reason.trim() === "") {
      problems.push(`SC-039③ の例外に理由がありません: ${e.file} ${e.name}`);
    }
    const content = packageSrcFiles.get(e.file);
    if (content === undefined) {
      problems.push(
        `SC-039③ の例外が指すファイルが走査対象にありません: ${e.file}（例外を消すか、走査対象を直してください）`,
      );
      continue;
    }
    const declared = extractPublicDeclarations(content).some((d) => d.name === e.name);
    if (!declared) {
      problems.push(
        `SC-039③ の例外が指す公開宣言がありません: ${e.file} の ${e.name}（記号が消えたなら例外も消してください）`,
      );
      continue;
    }
    if (isReferencedElsewhere(e.name, e.file, productSources)) {
      problems.push(
        `SC-039③ の例外が不要になりました: ${e.file} の ${e.name} は製品コードから参照されています`,
      );
    }
  }
  return problems;
}

/**
 * SC-035 / SC-039① が名指しで参照するファイルピン。
 *
 * `web.srcFiles.get("App.tsx") ?? ""` / `sync.srcFiles.get("application/handlers.ts") ?? ""`
 * は、ファイルが無ければ空文字列へフォールバックする式になっている。空文字列を
 * 渡された `sc035MessageDefinitions` / `sc039aUnreachableBranchInApps` はカウント
 * しようがなく 0（＝目標達成）を返すため、このファイルが改名・移設されても
 * 指標は静かに PASS のまま動かない（#135 経路②⑪）。式自体（`?? ""`）は変えず、
 * 実在だけを独立に確認する。
 */
export const METRIC_FILE_PINS = [
  {
    path: "apps/timer-web/src/App.tsx",
    reason: "SC-035 の clientSource（メッセージ定義の突合対象）",
  },
  {
    path: "apps/timer-sync/src/application/handlers.ts",
    reason: "SC-039① の handlersSource（到達不能分岐の検査対象）",
  },
];

/**
 * 宣言の値が走査対象を指しているか。
 *
 * **走査対象かどうかの判定は、この 1 つの述語だけを使う**（ADR-0014 決定 9）。
 * 以前は数え上げが `d.src !== null`、読み込みが `d.src ? … : new Map()` と
 * **別々の条件**で書かれていた。両者は `""` で意味が割れ、
 * 「ガードは数えたのに実際には走査していない」状態を作れた（レビューで実測）。
 * 判定を分けて書くこと自体が穴の作り方なので、述語を 1 本に固定する。
 *
 * null（そのディレクトリを持たない）と非空の文字列（ディレクトリ名）だけが正当。
 * `""` や undefined は宣言の不備として `findInvalidDeclarations` が落とす。
 */
export function hasScanTarget(sub) {
  return typeof sub === "string" && sub.length > 0;
}

/**
 * 宣言の値として不正なものを列挙する（ADR-0014 決定 1・決定 9）。
 *
 * 正当なのは null か非空の文字列だけ。`""` は「パッケージ直下」を指す形になり、
 * 走査対象を 1 つ静かに失わせる。**件数のガードは 1 件だけ失った状態を検知
 * できない**ため、宣言そのものの妥当性をここで見る。
 */
export function findInvalidDeclarations(declarations) {
  const invalid = [];
  for (const d of declarations) {
    for (const key of ["src", "test", "entry"]) {
      const value = d[key];
      if (value === null || hasScanTarget(value)) continue;
      invalid.push(`${d.pkg}.${key} = ${JSON.stringify(value)}`);
    }
  }
  return invalid;
}

/**
 * 走査対象を読み込む。**走査量の算出も実走査もこの結果だけを使う**（ADR-0014 決定 9）。
 *
 * 以前は `main()` のガード用の計数と `runAudit()` の読み込みが別々に
 * ファイルを見ており、条件式が割れて食い違いを作った（上の `hasScanTarget` 参照）。
 * 読み込みを 1 か所に寄せることで、ガードが「走査した」と数えた集合と
 * 実際に指標を測る集合が**構造的に同一**になる。二重読み込みも同時に消える。
 *
 * `readDir(pkg, sub)` は Map<相対パス, 内容> を返す関数。
 * 実ファイル I/O は呼び出し側に置き、本関数は配線だけを持つ。
 */
export function loadScanTargets(declarations, readDir) {
  return declarations.map((d) => ({
    ...d,
    srcFiles: hasScanTarget(d.src) ? readDir(d.pkg, d.src) : new Map(),
    testFiles: hasScanTarget(d.test) ? readDir(d.pkg, d.test) : new Map(),
  }));
}

/**
 * 走査量を数える（ADR-0014 決定 6）。
 *
 * **宣言の行数ではなく、`loadScanTargets` が実際に読み込んだものを数える。**
 * `SCANNED_PACKAGES.length` を数えてはならない — 各要素の `src` / `test` を空に
 * すれば走査は 0 件になるのに、配列長は 10 のまま変わらないため、行数を見る限り
 * 「走査 0 件・全指標 PASS」の表が素通りする。
 *
 * ファイル件数は読み込んだ Map の大きさそのもの。**別経路で数え直さない。**
 */
export function measureScanVolume(loaded) {
  const volume = { srcPackages: 0, srcFiles: 0, testPackages: 0, testFiles: 0 };
  for (const p of loaded) {
    if (hasScanTarget(p.src)) {
      volume.srcPackages += 1;
      volume.srcFiles += p.srcFiles.size;
    }
    if (hasScanTarget(p.test)) {
      volume.testPackages += 1;
      volume.testFiles += p.testFiles.size;
    }
  }
  return volume;
}

/**
 * 走査量を人が読む 1 行にする。
 *
 * 書式は設計正本 §5.4 に合わせ、**パッケージ数だけでなくファイル件数も出す**
 * （決定 6 の「何を何件見たか」）。ガードが見る数と出力する数を同じ 1 か所から作る。
 */
export function formatScanVolume(volume) {
  return (
    `src ${volume.srcPackages} パッケージ / ${volume.srcFiles} 件、` +
    `test ${volume.testPackages} パッケージ / ${volume.testFiles} 件`
  );
}

/**
 * 0 件ガードが見る内訳（ADR-0014 決定 8）。
 *
 * **出力する走査量とまったく同じ 4 つ**を見る。どれか 1 つでも 0 件なら、
 * その分だけ検査は空振りしている。
 */
export function scanVolumeDimensions(volume) {
  return [
    { label: "src パッケージ", count: volume.srcPackages },
    { label: "src ファイル", count: volume.srcFiles },
    { label: "test パッケージ", count: volume.testPackages },
    { label: "test ファイル", count: volume.testFiles },
  ];
}

/**
 * SC-039②③ が使う 2 つの集合（純粋）を、読み込み済みの走査対象から組み立てる。
 *
 * **`main()` のガードと `runAudit()` の指標は、どちらもこの関数の結果だけを使う**
 * （ADR-0014 決定 9）。同じ `loaded` を渡す限り同じ結果が出るので、
 * 「ガードが見る集合」と「指標が測る集合」は構造的に同一になる。
 * 2 か所で別々に組み立てると、条件式が割れた瞬間にガードが静かに空振りする
 * （このリポジトリが実際に踏んだ形。`loadScanTargets` の docstring を参照）。
 *
 * - `packageSrcFiles`: SC-039②③ が数える対象。各 packages 配下の src のみ
 *   （FR-119②③は packages 限定）。到達性では絞らない。
 * - `productSources`: 参照元となる製品コード。**SC-027 が到達不能と判定したファイルを除く。**
 *   死んだファイルからの参照は生存の根拠にならない。これを除かないと、
 *   「撤去予定のファイルからしか参照されていない記号」が生きているように見え、
 *   G1 で撤去した瞬間に SC-039 の値が跳ね上がる（計測器が撤去を検知できない）。
 *   **テストは含めない**（FR-090）。
 *
 * SC-035 / SC-039 は timer 固有の指標なので、走査を広げてもここは timer の 3 つだけを見る。
 *
 * @param loaded {@link loadScanTargets} の結果
 */
export function buildSc039Sources(loaded) {
  const byPkg = new Map(loaded.map((p) => [p.pkg, p]));
  const core = byPkg.get("packages/timer-core");
  const sync = byPkg.get("apps/timer-sync");
  const web = byPkg.get("apps/timer-web");

  const reachable = {
    core: computeReachableFiles(core.srcFiles, [core.entry]),
    sync: computeReachableFiles(sync.srcFiles, [sync.entry]),
    web: computeReachableFiles(web.srcFiles, [web.entry]),
  };

  const productSources = new Map([
    ...[...core.srcFiles]
      .filter(([k]) => reachable.core.has(k))
      .map(([k, v]) => [`packages/timer-core/src/${k}`, v]),
    ...[...sync.srcFiles]
      .filter(([k]) => reachable.sync.has(k))
      .map(([k, v]) => [`apps/timer-sync/src/${k}`, v]),
    ...[...web.srcFiles]
      .filter(([k]) => reachable.web.has(k))
      .map(([k, v]) => [`apps/timer-web/src/${k}`, v]),
  ]);

  const packageSrcFiles = new Map(
    [...core.srcFiles].map(([k, v]) => [`packages/timer-core/src/${k}`, v]),
  );

  return { packageSrcFiles, productSources };
}

/**
 * 指標を測る。**読み込み済みの走査対象（`loadScanTargets` の結果）を受け取る。**
 * 自分で読み直さないこと — 読み込み条件が二重化した瞬間に、ガードが数えた集合と
 * ここで測る集合が食い違う（ADR-0014 決定 9）。
 */
function runAudit(loaded) {
  const byPkg = new Map(loaded.map((p) => [p.pkg, p]));

  // SC-035 / SC-039① は timer 固有の指標。走査を広げてもここは変えない。
  // （SC-039②③ の集合は `buildSc039Sources` が持つ。ここでは組み立てない。）
  const sync = byPkg.get("apps/timer-sync");
  const web = byPkg.get("apps/timer-web");

  const allTestFiles = new Map();
  for (const p of loaded) {
    for (const [k, v] of p.testFiles) allTestFiles.set(`${p.pkg}/${p.test}/${k}`, v);
  }

  // SC-027: エントリを持つパッケージごとに到達性を測り、合算する
  const sc027 = loaded
    .filter((p) => hasScanTarget(p.entry))
    .reduce((n, p) => n + sc027UnreachableModules(p.srcFiles, [p.entry]), 0);

  const sc028 = sc028DuplicateTestDoubles(allTestFiles);

  // FR-093 の例外表（除外ファイル）
  const exceptFiles = ["packages/timer-core/test/permissions-differential.test.ts"];
  const sc029 = sc029SpecIdsInNames(allTestFiles, exceptFiles);
  const sc030 = sc030CallNamesInNames(allTestFiles);
  const sc031 = sc031GuardExpects(allTestFiles);
  const sc032 = sc032GwtMarkers(allTestFiles);
  const sc036 = sc036TestCount(allTestFiles);

  const serverSources = [...sync.srcFiles.values()];
  const clientSource = web.srcFiles.get("App.tsx") ?? "";
  const sc035 = sc035MessageDefinitions(serverSources, clientSource);

  const handlersSource = sync.srcFiles.get("application/handlers.ts") ?? "";
  // **走査対象の組み立ては `buildSc039Sources` の 1 か所だけ**（ADR-0014 決定 9）。
  // ここで組み直すと、`main()` の例外表ガードが見る集合と指標が測る集合が食い違い、
  // 腐った例外を抱えたまま静かに「0 件」を報告できてしまう。
  const { packageSrcFiles, productSources } = buildSc039Sources(loaded);
  const sc039 = sc039UnreachableElements({
    handlersSource,
    packageSrcFiles,
    productSources,
    exceptions: SC039C_EXCEPTIONS,
  });

  return {
    sc027: { value: sc027, target: 0 },
    sc028: { value: sc028, target: 0 },
    sc029: { value: sc029, target: 0 },
    sc030: { value: sc030, target: 0 },
    sc031: { value: sc031, target: 0 },
    sc032: {
      value: `${sc032.numerator}/${sc032.denominator}（${(sc032.ratio * 100).toFixed(1)}%）`,
      target: "100%",
      raw: sc032,
    },
    sc035: { value: sc035, target: 0 },
    sc036: { value: sc036, target: "P1 完了時の基準値以上" },
    sc039: {
      value:
        `分岐 ${sc039.unreachableBranches} / データ ${sc039.unusedPublicDataLines} 行 / ` +
        `公開記号 ${sc039.selfOnlyPublicSymbols} 件`,
      target: "分岐0 / データ0行 / 公開記号0件",
      raw: sc039,
    },
  };
}

/**
 * 監査結果を表にする。
 *
 * 判定は**目標値が数値の指標にだけ**出す。SC036 のように目標が文章の指標は
 * 「記録のための数値」であり、合否を持たない（以前は値が数値・目標が文字列で
 * `1382 === "P1 完了時の基準値以上"` が常に false になり、構造上いつまでも
 * 「未達」と表示されていた）。
 */
export function formatTable(results) {
  const rows = Object.entries(results).map(([id, r]) => {
    const judgeable = typeof r.value === "number" && typeof r.target === "number";
    const judged = judgeable ? (r.value === r.target ? "PASS" : "未達") : "—";
    return `${id.toUpperCase()} | ${r.value} | ${r.target} | ${judged}`;
  });
  const header = "SC | 現状値 | 目標値 | 判定";
  return [header, "---", ...rows].join("\n");
}

function main() {
  // 走査対象の宣言が実体とずれていないかを最初に見る（#135 経路②⑪）。
  //
  // **これは測定値の合否ではなく計測器の健全性の合否**（ADR-0014）。
  // ADR 0009 D2 の「構造監査は値を出すだけ」は測定値についての決定であり、
  // 走査対象を失ったまま全指標 PASS の表を出すことまで許してはいない。

  // 宣言の値そのものが正当か（null か非空の文字列か）を先に見る。
  // `""` は「パッケージ直下」を指す形になり、走査対象を 1 つ静かに失わせる。
  // 件数のガードは「1 件だけ失った」状態を検知できないため、ここで落とす。
  const invalidDeclarations = findInvalidDeclarations(SCANNED_PACKAGES);

  // **走査対象の読み込みはここ 1 回だけ。** 走査量のガードも指標の測定も、
  // この `loaded` から導出する（別々に導出すると条件式が割れて食い違う）。
  // `hasScanTarget` が `""` を 0 件として扱うため、不正な宣言があっても
  // この読み込みは安全に行える（落ちる前に走査量を出すために先に計算する）。
  const loaded = loadScanTargets(SCANNED_PACKAGES, (pkg, sub) =>
    readFilesRecursive(path.join(REPO_ROOT, pkg, sub), EXT_TS),
  );
  const volume = measureScanVolume(loaded);
  const summary = formatScanVolume(volume);

  if (invalidDeclarations.length > 0) {
    console.error("[audit-structure] 走査対象の宣言が不正です（null か非空の文字列のみ）");
    for (const d of invalidDeclarations) console.error(`  ${d}`);
    console.error(`  現在の走査対象: ${summary}`);
    process.exit(1);
  }

  // 走査量のどの内訳も 0 件でないことを見る（ADR-0014 決定 8）。
  //
  // 走査 0 件のまま合否表を出す経路は 2 つある。全パッケージを理由つき除外へ移せば
  // 下の全単射照合は素通りし（除外側が workspace の全件を覆うため）、宣言を残したまま
  // 各要素の `src` / `test` を null にすれば全単射も実在確認も素通りする（null は
  // 実在確認の対象外）。**どちらも宣言の行数では検知できない**ため、出力している
  // 走査量そのものを見る。METRIC_FILE_PINS のファイル実在チェックは走査集合への
  // 所属を見ないため、この経路の歯止めにならない。
  const emptyDimensions = findEmptyScanDimensions(scanVolumeDimensions(volume));
  if (emptyDimensions.length > 0) {
    console.error(
      `[audit-structure] 走査対象が 0 件です（検査が空振りします）: ${emptyDimensions.join(" / ")}`,
    );
    console.error(`  現在の走査対象: ${summary}`);
    process.exit(1);
  }

  const packages = listWorkspacePackages(REPO_ROOT);
  const declared = [
    ...SCANNED_PACKAGES.map((d) => d.pkg),
    ...EXCLUDED_PACKAGES.map((e) => e.pkg),
  ];
  const drift = diffTargets(declared, packages);

  // ディレクトリ（src/test）とエントリ（SC-027 の到達性測定の起点）の実在を見る。
  // エントリが改名されても ADR 0009 D2 により測定値では落ちないため、ここで
  // 計測器の健全性として先に検知する（指摘4）。
  //
  // SC-035 / SC-039① が名指しで参照するファイルピンも同じ扱いにする（指摘1）。
  //
  // **実在確認そのものは共有モジュールの `findMissingPaths` に任せる**
  // （ADR-0014 決定 10）。ここで `fs.existsSync` を直に書くと、同型の実装が
  // ログ衛生側にもう 1 つできて「片側だけ直す」の再発源になる（#158）。
  const existenceTargets = [];
  for (const d of SCANNED_PACKAGES) {
    for (const sub of [d.src, d.test]) {
      if (hasScanTarget(sub)) existenceTargets.push(`${d.pkg}/${sub}`);
    }
    if (hasScanTarget(d.entry) && hasScanTarget(d.src)) {
      existenceTargets.push(`${d.pkg}/${d.src}/${d.entry}`);
    }
  }
  for (const pin of METRIC_FILE_PINS) existenceTargets.push(pin.path);
  const missingTargets = findMissingPaths(REPO_ROOT, existenceTargets);

  if (hasTargetDrift(drift) || missingTargets.length > 0) {
    const merged = {
      missing: [...drift.missing, ...missingTargets].sort(),
      unexpected: drift.unexpected,
    };
    console.error(formatTargetDiff("audit-structure", merged, summary));
    process.exit(1);
  }

  // 例外表の健全性（走査対象のずれと同じ扱いで合否を持つ）。
  // 指標を出す前に見る。腐った例外を抱えたまま「0 件」と報告させない。
  //
  // **見る集合は `runAudit()` が測る集合と同一**（ADR-0014 決定 9）。
  // 同じ `loaded` を `buildSc039Sources` に渡しているので、ここで組み直してはいない。
  // 走査対象の実在確認より後に置くのは、この関数が timer の 3 パッケージの存在を前提に
  // するためである（宣言が欠けていれば上のガードが先に落とす）。
  const sc039Sources = buildSc039Sources(loaded);
  const staleExceptions = findStaleSymbolExceptions(
    SC039C_EXCEPTIONS,
    sc039Sources.packageSrcFiles,
    sc039Sources.productSources,
  );
  // 走査量は成否によらず必ず出す（#135 D5）。何件の例外を何件のファイルに照らしたかが赤の根拠になる。
  console.log(
    `[audit-structure] SC-039③ の例外表: ${SC039C_EXCEPTIONS.length} 件 / ` +
      `照合先 ${sc039Sources.packageSrcFiles.size} ファイル・参照元 ${sc039Sources.productSources.size} ファイル`,
  );
  if (staleExceptions.length > 0) {
    for (const p of staleExceptions) console.error(`[audit-structure] ${p}`);
    process.exit(1);
  }

  const results = runAudit(loaded);
  console.log(`[audit-structure] 走査対象: ${summary}`);
  console.log(formatTable(results));
}

// このファイルが直接実行された場合のみ走査する（テストからの import 時は実行しない）。
if (process.argv[1] === __filename) {
  main();
}
