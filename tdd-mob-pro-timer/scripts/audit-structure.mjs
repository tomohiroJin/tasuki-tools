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
 */
export function sc039aUnreachableBranchInApps(handlersSource) {
  return /!room\.onBreak/.test(handlersSource) ? 1 : 0;
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
  return source.replace(/export\s*\{[^}]*\}\s*from\s*["'][^"']+["'];?/g, "");
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
 * 非公開のトップレベル宣言を経由する参照の連鎖が切れてしまう（実例: `packages/core/src/schemas.ts`
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
 * これだと「死んだ記号からの参照」まで生存の根拠にしてしまう（実例: `packages/core/src/i18n/ja.ts` の
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
 */
export function sc039cSelfOnlyPublicSymbols(packageSrcFiles, productSources) {
  // 【②との違い】ここでは間接利用（同一ファイル内の他の公開関数経由での参照）を
  // 「生きている」根拠にしない。③ が数えるのは「export が不要かどうか」であり、
  // 他ファイルが export された名前そのものを直接使っているかだけが判定材料になる。
  // 同一ファイル内でしか使われていない（＝直接 import されていない）なら、
  // その関数経由で内部的に使われていても export は不要である
  // （実例: problem.ts の FALLBACK_PROBLEMS は pickFallback から内部参照されるが、
  // 他ファイルは FALLBACK_PROBLEMS を直接 import していないため export 不要＝③対象）。
  let count = 0;
  for (const [file, content] of packageSrcFiles) {
    for (const decl of extractPublicDeclarations(content)) {
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
}) {
  return {
    unreachableBranches: sc039aUnreachableBranchInApps(handlersSource),
    unusedPublicDataLines: sc039bUnusedPublicData(packageSrcFiles, productSources),
    selfOnlyPublicSymbols: sc039cSelfOnlyPublicSymbols(packageSrcFiles, productSources),
  };
}

/* ============================================================
 * 実リポジトリへの配線（main）
 * ============================================================ */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const EXT_TS = [".ts", ".tsx"];

function loadPackage(pkgRelDir) {
  const srcDir = path.join(REPO_ROOT, pkgRelDir, "src");
  const testDir = path.join(REPO_ROOT, pkgRelDir, "test");
  return {
    src: readFilesRecursive(srcDir, EXT_TS),
    test: readFilesRecursive(testDir, EXT_TS),
  };
}

function runAudit() {
  const core = loadPackage("packages/core");
  const sync = loadPackage("apps/sync");
  const web = loadPackage("apps/web");

  const allTestFiles = new Map([
    ...[...core.test].map(([k, v]) => [`packages/core/test/${k}`, v]),
    ...[...sync.test].map(([k, v]) => [`apps/sync/test/${k}`, v]),
    ...[...web.test].map(([k, v]) => [`apps/web/test/${k}`, v]),
  ]);

  // SC-027: パッケージごとに独立して到達性を測り、合算する
  const unreachableCore = sc027UnreachableModules(core.src, ["index.ts"]);
  const unreachableSync = sc027UnreachableModules(sync.src, ["server.ts"]);
  const unreachableWeb = sc027UnreachableModules(web.src, ["main.tsx"]);
  const sc027 = unreachableCore + unreachableSync + unreachableWeb;

  // SC-039②③ の「参照元」から、SC-027 が到達不能と判定したファイルを除く。
  // なぜ: 死んだファイルからの参照は生存の根拠にならない。これを除かないと、
  // 「撤去予定のファイルからしか参照されていない記号」が生きているように見え、
  // G1 で撤去した瞬間に SC-039 の値が跳ね上がる（計測器が撤去を検知できない）。
  const reachable = {
    core: computeReachableFiles(core.src, ["index.ts"]),
    sync: computeReachableFiles(sync.src, ["server.ts"]),
    web: computeReachableFiles(web.src, ["main.tsx"]),
  };

  const sc028 = sc028DuplicateTestDoubles(allTestFiles);

  // FR-093 の例外表（除外ファイル）
  const exceptFiles = ["packages/core/test/permissions-differential.test.ts"];
  const sc029 = sc029SpecIdsInNames(allTestFiles, exceptFiles);
  const sc030 = sc030CallNamesInNames(allTestFiles);
  const sc031 = sc031GuardExpects(allTestFiles);
  const sc032 = sc032GwtMarkers(allTestFiles);
  const sc036 = sc036TestCount(allTestFiles);

  const serverSources = [...sync.src.values()];
  const clientSource = web.src.get("App.tsx") ?? "";
  const sc035 = sc035MessageDefinitions(serverSources, clientSource);

  const handlersSource = sync.src.get("application/handlers.ts") ?? "";
  const productSources = new Map([
    ...[...core.src]
      .filter(([k]) => reachable.core.has(k))
      .map(([k, v]) => [`packages/core/src/${k}`, v]),
    ...[...sync.src]
      .filter(([k]) => reachable.sync.has(k))
      .map(([k, v]) => [`apps/sync/src/${k}`, v]),
    ...[...web.src]
      .filter(([k]) => reachable.web.has(k))
      .map(([k, v]) => [`apps/web/src/${k}`, v]),
  ]);
  // packages/*/src のみを走査対象にする（FR-119②③は packages 限定）
  const coreOnly = new Map(
    [...core.src].map(([k, v]) => [`packages/core/src/${k}`, v]),
  );
  const sc039 = sc039UnreachableElements({
    handlersSource,
    packageSrcFiles: coreOnly,
    productSources,
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

function formatTable(results) {
  const rows = Object.entries(results).map(([id, r]) => {
    const judged = typeof r.value === "number" ? (r.value === r.target ? "PASS" : "未達") : "—";
    return `${id.toUpperCase()} | ${r.value} | ${r.target} | ${judged}`;
  });
  const header = "SC | 現状値 | 目標値 | 判定";
  return [header, "---", ...rows].join("\n");
}

function main() {
  const results = runAudit();
  console.log(formatTable(results));
}

// このファイルが直接実行された場合のみ走査する（テストからの import 時は実行しない）。
if (process.argv[1] === __filename) {
  main();
}
