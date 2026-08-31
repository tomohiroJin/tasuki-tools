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
import { isDirectRun } from "./lib/direct-run.mjs";

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
 *
 * `exceptions` は {@link SC029_EXCEPTIONS} と同じ形（`{ file, reason }` の配列）を受ける。
 * **除外は分母から行う**（SC-032 の例外表と同じ作法。{@link sc032GwtMarkers} を参照）。
 *
 * @param testFiles `Map<リポジトリ相対パス, ソース>`
 * @param exceptions 例外表（`{ file, reason }` の配列）
 */
export function sc029SpecIdsInNames(testFiles, exceptions = []) {
  const excepted = new Set(exceptions.map((e) => e.file));
  let count = 0;
  for (const [file, content] of testFiles) {
    if (excepted.has(file)) continue;
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
 * テスト本体が前提・操作の区切りを持つか。
 *
 * SC-032 の分子と、例外表の腐り判定（{@link findStaleTestExceptions} の「もう要らない」）が
 * **同じ 1 つの述語**を使う。片方だけ書き換えると、区切りが付いたのに例外が残る状態を
 * 検知できなくなる。
 */
function hasGwtMarkers(body) {
  return GIVEN_RE.test(body) && WHEN_RE.test(body);
}

/**
 * テスト本体の**先頭行**から、そのテストの名前（`it(...)` の第 1 引数の文字列）を取る。
 * 取れなければ null。
 *
 * ## 何を見ていないか — **「足りる」とは言わない**
 *
 * - **先頭行しか見ていない。** `it.each([…])("… %s", …)` のように名前が先頭行に
 *   現れない書き方では null になる。その場合そのテストは例外表で名指しできず、
 *   **従来どおり分母に入る**（例外に載せられないだけで、指標は静かに緩まない）。
 * - **同名のテストを区別していない。** 同じファイルに同じ名前が 2 件あれば、
 *   例外はその両方に掛かる。
 */
function testNameOfBody(bodyLines) {
  const names = extractTestNames(bodyLines[0] ?? "");
  return names.length > 0 ? names[0] : null;
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
 *
 * `exceptions`（{@link SC032_EXCEPTIONS} と同じ形）に載る `file::testName` の組は
 * **分母に数える前に**外す。分子に足して「満たしたことにする」のではない
 * （ADR-0006 決定 2 の「本体が 2 行以下の自明なテストは対象外」と同じ扱い）。
 * 例外表が腐っていないかは {@link findStaleTestExceptions} が別に見る。
 * **ここは腐りを見ない** — 実在しないテストを例外に書けば、ここは黙って何も外さないだけである。
 */
export function sc032GwtMarkers(testFiles, exceptions = []) {
  const excepted = new Set(exceptions.map((e) => `${e.file}::${e.testName}`));
  let denominator = 0;
  let numerator = 0;
  for (const [file, content] of testFiles) {
    for (const bodyLines of splitIntoTestBodies(content)) {
      const name = testNameOfBody(bodyLines);
      if (name !== null && excepted.has(`${file}::${name}`)) continue;
      const meaningfulCount = countMeaningfulBodyLines(bodyLines);
      if (meaningfulCount < 3) continue;
      denominator++;
      if (hasGwtMarkers(bodyLines.join("\n"))) numerator++;
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
 * SC-039① が測った範囲を指標の値に添える名札（#180）。
 *
 * ①の走査は**広げていない**。{@link sc039aUnreachableBranchInApps} が見るのは
 * `!room.onBreak` という既知のパターン 1 つだけで、対象は
 * {@link METRIC_FILE_PINS} が名指しする 1 ファイルに限られる。それを書かずに
 * 「分岐 0」とだけ出すと、`apps/` 全体に到達不能な分岐が無いと読める。
 * ②③が「timer-core についてのみ 0」を「0」と report していたのが #180 の現象そのもので、
 * ①は同じ形の誤読をまだ残している。**広げないなら、どこを測った 0 なのかを出す。**
 */
const SC039A_SCOPE = "apps/timer-sync の既知パターンのみ";

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
 * ソースから文字列リテラルとコメントを取り除く。**改行は落とさない。**
 *
 * 完全な字句解析ではない簡易スキャンだが、エスケープ（`\"` 等）は考慮する。
 *
 * 【欠陥4の対応】`isReferencedElsewhere` が文字列リテラルの中身にまで `\bNAME\b` で一致してしまい
 * 誤判定する問題（実例: `ja` が他ファイルの言語コード文字列 `"ja"` に一致してしまう）を避けるため、
 * 参照判定の対象を「識別子としての使用」に近づける前処理として使う。
 *
 * ## 剥がしすぎの向き（#184）
 *
 * このヘルパは**正規表現リテラルを知らない**。`const re = /it's/;` の `/…/` をコードとして
 * 読み進めるため、中のアポストロフィを文字列の開始と誤読する。正しく扱う字句解析を書く道は
 * 採らない（このリポジトリでは手書きの字句解析が 3 回続けて新しい検出漏れを作っている）。
 * 代わりに、**誤読したときの被害をその行の中に閉じ込める**:
 *
 * - `'` と `"` の文字列は**改行をまたげない**（言語仕様）。閉じ引用符が見つからないまま
 *   改行に達したらそこで打ち切る。以前は次の `'` を求めてファイル末尾まで走ったため、
 *   `/it's/` の 1 行だけで**それ以降のソース全体が消えていた**。
 * - 行継続（`\` の直後の改行）とテンプレートリテラル（`` ` ``）は改行をまたぐので、
 *   またいだ改行は結果へ残す。
 *
 * ## 行番号を保つ（#184）
 *
 * ブロックコメント・テンプレートリテラルの中の改行を**そのまま結果へ書き出す**ので、
 * 剥がした後の行番号は元ソースの行番号と一致する。以前は改行ごと落としていたため、
 * 剥がした結果の添字を行番号として報告すると元ファイルとずれた
 * （5 行のブロックコメントで 4 行ずれるのを実測）。
 *
 * **「無いこと」を求める検査はこのヘルパに依存しないこと。** 剥がしすぎは
 * その種の検査を緑（＝見逃し）へ倒す。公開面の検査（`audit-public-surface.mjs`）は
 * この理由で #184 に依存を外し、素の行走査＋コメント行の許可リストへ移した。
 * 残る利用箇所のうち、参照判定（{@link findStaleSymbolExceptions} が使う
 * `isReferencedElsewhere` と推移的な生存性の伝播）は剥がしすぎると
 * 「参照されていない」＝赤へ倒れるので安全側だが、
 * {@link sc039aUnreachableBranchInApps} は「分岐が無いこと」を求めるため緑へ倒れる
 * （被害は上の改行打ち切りで 1 行に閉じ込めたが、同じ行の中では依然として起こりうる）。
 */
export function stripStringsAndComments(source) {
  let result = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      // 改行そのものは消費しない（次の周回で結果へ入る）。
      while (i < n && source[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") result += "\n";
        i++;
      }
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      const spansLines = quote === "`";
      i++;
      while (i < n) {
        if (source[i] === "\\") {
          // 行継続。またいだ改行は残す。
          if (source[i + 1] === "\n") result += "\n";
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i++;
          break;
        }
        if (source[i] === "\n") {
          // `'` / `"` は改行をまたげない。閉じずに改行へ達したらそこで打ち切る
          // （改行は消費せず、次の周回で結果へ入る）。
          if (!spansLines) break;
          result += "\n";
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
  // 記号を公開しているパッケージのディレクトリ（"packages/timer-core/"）。
  const ownPackageDir = /^(packages\/[^/]+\/)/.exec(ownFile)?.[1] ?? null;
  for (const [file, src] of productSources) {
    if (file === ownFile) continue;
    // 欠陥4の修正: 文字列リテラル・コメントを除去してから照合し、識別子としての使用のみを見る。
    if (!re.test(stripStringsAndComments(stripNamedReexports(src)))) continue;
    // 同じパッケージの中なら、識別子が一致すればその記号の参照である（相対 import で届く）。
    if (ownPackageDir === null || file.startsWith(ownPackageDir)) return true;
    // **別のパッケージからの参照は、公開元を取り込んでいるファイルに限る（#214）。**
    // 名前だけで製品コード全体を探すと、**同名の別記号**を根拠に「使われている」と
    // 誤判定する。#214 では poker-core と timer-core が両方 DEFAULT_ERROR_MESSAGE を
    // 公開した時点で、poker 側の 2 行が timer 側の例外を不要と言わせた。
    //
    // 取り込みの判定は**名前空間の綴りに依存させない**（`@tasuki/` を書き写すと、
    // 名前空間を変えたときにここが黙って何も拾わなくなる）。末尾のディレクトリ名だけを見る。
    if (isImportedBy(src, ownPackageDir)) return true;
  }
  return false;
}

/**
 * `source` が `packageDir`（"packages/timer-core/"）のパッケージを取り込んでいるか。
 *
 * import 指定子の**末尾のディレクトリ名**だけを見る（`@tasuki/timer-core` でも
 * 名前空間が変わっても拾えるように）。
 *
 * **サブパスの取り込みも数える**（`@tasuki/timer-core/aggregate` など）。
 * `apps/timer-web` にはサブパスからしか取り込まないファイルが多数あり、
 * クォートだけを見ていると**それらからの参照を生存の根拠として数え落とす**
 * （#214 の敵対的検証が SC-039③ の件数 15→14 の差として実測した）。
 * 直後がクォートか `/` であることまで見るので、`timer-core-extra` のような
 * 前方一致では当たらない。
 */
function isImportedBy(source, packageDir) {
  const name = packageDir.slice("packages/".length).replace(/\/$/, "");
  return new RegExp(`/${escapeForRegExp(name)}['"/]`).test(source);
}

/** 正規表現に埋め込む文字列を安全にする。 */
function escapeForRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
 * `index.ts` の**再エクスポート節**から、公開している名前を「値」と「型」に分けて返す（純粋）。
 *
 * ## 判定は index.ts の書き方だけで行う — **宣言側を読みに行かない**
 *
 * 「その名前が本当に値か型か」は宣言ファイルを読めば分かるが、読みに行くと
 * 判定が字句解析の深さに依存し、穴が増えるたびに**静かに緑へ倒れる**
 * （#184 / #193 で `audit-public-surface.mjs` が実際にたどった道）。
 * ここでは `export type { … }` とインラインの `type` 修飾子という、
 * **書き手が明示した印だけ**を見る。印を書き忘れた型は値として数えられ、
 * 過剰報告（赤）に倒れる。偽陽性はレビューで消せるが、偽陰性は誰にも見えない。
 *
 * ## 何を見ていないか
 *
 * - **`export *`** は扱わない。ADR-0016 決定 2 項目 2 が禁じており、
 *   `scripts/audit-public-surface.mjs` が別に落とす。
 * - **index.ts 自身に書かれた宣言**（`export const X = 1;`）は数えない。
 *   再エクスポート節（`… from '…'`）だけを見る。index を単なる公開面に保つ規約の裏返しであり、
 *   直接宣言を置けばこの指標からは消える（**緑へ倒れる経路**。走査対象は自分たちが書く
 *   エントリであり、この書き方を選ぶ動機が無いことを受容の根拠とする）。
 * - **コメントや文字列の中にある `export { … } from '…'` の字面**も節として拾う。
 *   拾えば実在しない名前が「未使用の値」として数えられるので、倒れる向きは赤である。
 *   ただし**節の中身からはコメントを落とす**（{@link stripCommentsOnly}）。落とさないと、
 *   カンマを含むブロックコメントが分割を壊し、記号名そのものがコメントの断片に化ける
 *   （実測: 節の中でブロックコメントがカンマをまたぐと、記号名が 2 つの断片に割れた。
 *   この docstring 自身がブロックコメントなので、再現例はテストに置いた）。
 */
export function extractContractNames(indexSource) {
  const values = [];
  const types = [];
  for (const m of indexSource.matchAll(/export\s+(type\s+)?\{([^}]*)\}\s*from\s*["'][^"']+["']/g)) {
    const isTypeClause = Boolean(m[1]);
    for (const raw of stripCommentsOnly(m[2]).split(",")) {
      const entry = raw.trim();
      if (entry === "") continue;
      const isInlineType = /^type\s/.test(entry);
      // **公開名は `as` の右側。** 利用者が書くのはこちらである。
      const name = entry.replace(/^type\s+/, "").split(/\s+as\s+/).pop().trim();
      if (name === "") continue;
      (isTypeClause || isInlineType ? types : values).push(name);
    }
  }
  return { values, types };
}

/**
/**
 * コメントだけを取り除く（純粋）。**文字列リテラルは残す。**
 *
 * {@link stripStringsAndComments} は使えない。あれは文字列リテラルごと落とすので、
 * `from '@tasuki/poker-core'` の**指定子まで消える**。指定子が消えると
 * {@link extractNamedImportsFromPackage} はどの取り込みも見つけられなくなり、
 * 全記号が「取り込まれていない」に化ける（実測で確認した）。
 *
 * **剥がしすぎる向きは赤（＝過剰報告）に固定される。** 本物の import 文を巻き込んで
 * 消せば、その記号は「取り込まれていない」と数えられるだけである。
 * 逆に剥がし足りないと記号が黙って「生きている」側へ倒れる（緑＝見逃し）ので、
 * 迷ったら消す側へ倒す。
 */
function stripCommentsOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * `source` が `packageName` のパッケージ**本体**から名前つきで取り込んでいる記号名（純粋）。
 *
 * **サブパスからの取り込みは数えない。** `@tasuki/timer-core/aggregate` は `index.ts` を
 * 通らないため、index の列挙が使われた根拠にならない（{@link isImportedBy} が
 * SC-039③ のためにサブパスまで数えるのと、ここは意図的に向きが違う）。
 *
 * 名前空間の綴りには依存させない（`@tasuki/` を書き写すと、名前空間を変えたときに
 * ここが黙って何も拾わなくなる）。末尾のパッケージ名までで終わっていることだけを見る。
 *
 * **末尾一致だけでは足りない。** 相対 import は同名の隣接モジュールに当たる —
 * `packages/poker-core/src/index.ts` の `export { … } from './protocol'` は
 * `/protocol$` に一致し、`@tasuki/protocol` からの取り込みに化ける（#182 の実測）。
 * 化けると記号が黙って「生きている」側へ倒れるので、**素の（相対でも絶対でもない）
 * 指定子だけを見る**。
 *
 * **取り込み側の `as` は左側が公開名。** `import { a as localName }` が使っているのは `a` である
 * （{@link extractContractNames} が右側を採るのと逆向きになる）。
 *
 * ## コメントは先に落とす — **ここを怠ると緑（＝見逃し）に倒れる**
 *
 * 素のソースへ正規表現を当てると、**コメントアウトされた import 文**や docstring 中の
 * 例示（行頭が `*` の行）を「取り込みあり」と数え、死んだ公開値が黙って生きている側へ倒れる。
 * 実測で 3 形すべてが拾われた（#182 の敵対的検証）。
 *
 * 歯止めは 2 つ重ねる。**どちらも無状態である。**
 *
 * 1. {@link stripCommentsOnly} でコメントを落とす（文字列リテラルは残す。理由はそちらの docstring）
 * 2. `import` / `export` が**行頭（字下げは許す）から始まる**ことを求める。
 *    docstring の `* import { … }` も `const s = "import { … }"` もこれで外れる
 *
 * ## 何を見ていないか
 *
 * ### 緑（＝見逃し）に倒れる — 行頭から import 文が始まる文字列リテラル
 *
 * 複数行の文字列（テンプレートリテラルなど）の中に、**行頭から始まる完全な import 文**を
 * 書くと拾われる。塞ぐには文字列リテラルを落とすしかないが、それをすると
 * 指定子ごと消えて検査が丸ごと空振りする（{@link stripCommentsOnly} 参照）。
 * 走査対象は自分たちが書く製品コードであり、この書き方を選ぶ動機が無いことを受容の根拠とする。
 *
 * ### 赤（＝過剰報告）に倒れる — 放置してよい
 *
 * **名前空間ごとの取り込み**（`import * as core from '@tasuki/poker-core'` から
 * `core.computeStats` を使う形）は拾わない。中括弧を持たないためである。
 * この形の利用者がいる記号は「取り込まれていない」と数えられる。
 * 2026-09-01 の実測ではリポジトリ全体で 0 件だった。
 *
 * ブロックコメントの除去が**行をまたいで剥がしすぎた**場合も、本物の import 文が
 * 消えるだけなので同じく赤へ倒れる。
 */
export function extractNamedImportsFromPackage(source, packageName) {
  const names = new Set();
  const isOwnPackage = new RegExp(`/${escapeForRegExp(packageName)}$`);
  for (const m of stripCommentsOnly(source).matchAll(
    /^[ \t]*(?:import|export)\s+(?:type\s+)?(?:[A-Za-z0-9_$]+\s*,\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/gm,
  )) {
    const specifier = m[2];
    if (specifier.startsWith(".") || specifier.startsWith("/")) continue;
    if (!isOwnPackage.test(specifier)) continue;
    for (const raw of m[1].split(",")) {
      const entry = raw.trim().replace(/^type\s+/, "");
      if (entry === "") continue;
      const name = entry.split(/\s+as\s+/)[0].trim();
      if (name !== "") names.add(name);
    }
  }
  return names;
}

/**
 * SC-039④: 各パッケージの `index.ts` が列挙する**値**のうち、
 * そのパッケージの外の製品コードから一度も取り込まれないものの件数（#182）。
 *
 * ## ②③ との違い — 測っているのは「`export` の要否」ではなく「公開契約の要否」
 *
 * ③ は宣言ファイルの `export` が要るかを見る。④ は**パッケージの公開面（`index.ts`）に
 * 載せる理由があるか**を見る。両者は独立している。実測（#182・2026-09-01）では、
 * `computeStats` は `snapshot.ts` が相対 import で使うので③では生きているが、
 * index 経由の利用者は 1 人もいないので④では死んでいた。逆に③が数える記号でも、
 * index が再エクスポートし公開署名から到達できる型は公開契約として生きている。
 *
 * ## 型を数えない理由
 *
 * 型は**取り込まれなくても契約の一部**である。`createRoom(…, ids: ParticipantIds):
 * Result<RoomUpdate, RoomError>` は型推論が効くので誰も `ParticipantIds` を import しないが、
 * 注釈を書きたい利用者は名前を要求する。「公開している値の署名から到達できるか」を
 * 機械で判定するには型解決が要り、この検査の素朴さと引き換えになるため、
 * **型は最初から数えない**（ADR-0016 追記 2026-09-01）。
 *
 * **テストからの参照は根拠に含めない**（FR-090。productSources にテストを渡さないこと）。
 * 自パッケージの中からの取り込みも根拠にしない（index に載せる理由は外から使われることである）。
 */
export function sc039dContractOnlyValues(contractFiles, productSources) {
  let count = 0;
  for (const [file, source] of contractFiles) {
    const packageName = /^packages\/([^/]+)\//.exec(file)?.[1];
    if (packageName === undefined) {
      // 黙って 0 件にしない。走査対象の組み立てが壊れたときは赤で気づけること。
      throw new Error(`SC-039④ の走査対象が packages/ 層のパスではありません: ${file}`);
    }
    const ownPrefix = `packages/${packageName}/`;
    const importedFromOutside = new Set();
    for (const [f, src] of productSources) {
      if (f.startsWith(ownPrefix)) continue;
      for (const name of extractNamedImportsFromPackage(src, packageName)) {
        importedFromOutside.add(name);
      }
    }
    for (const name of extractContractNames(source).values) {
      if (!importedFromOutside.has(name)) count++;
    }
  }
  return count;
}

/**
 * SC-039 まとめ。4 種の内訳をまとめて返す（他の SC 関数と異なり複合値）。
 */
export function sc039UnreachableElements({
  handlersSource,
  packageSrcFiles,
  productSources,
  contractFiles,
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
    contractOnlyValues: sc039dContractOnlyValues(contractFiles, productSources),
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
 * **「まだ決めていない」は理由ではない**（#180）。走査を `packages/` 全体へ広げたとき、
 * 新たに 16 件が検出された。うちここへ載せたのは上の条件に当てはまる 3 件だけである。
 * 残りは未決の判断であり、判断を待つあいだ例外表へ入れると指標が 0 に戻って
 * **読むべき信号を消してしまう**。測定値は落ちない
 * （ADR-0009 D2。実測で `audit-structure.mjs` は exit 0）ので、見えたまま残す。
 * #135 が走査を広げた結果 SC-031 が未達へ変わったときと同じ扱いである（ADR-0014「影響」）。
 *
 * **未決の宛先は #223 である。#182 ではない**（#182 / PR #222 で訂正した）。
 * ここは長く「それは #182 が扱う問いそのものである」と書いていたが、誤りだった。
 * ③が測るのは**宣言ファイルの `export` の要否**で、#182 が扱ったのは
 * **公開面（`index.ts`）に載せる理由の有無**（SC-039④）であり、両者は独立している。
 * 実測: `computeStats` は `snapshot.ts` が相対 import で使うので③では生きており、
 * index 経由の利用者はゼロなので④では死んでいた。さらに {@link stripNamedReexports} が
 * index の再エクスポートを参照から外すため、**index から落としても③の件数は動かない**。
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
    name: "RoomSchema",
    reason:
      "packages/timer-core/test/ai-unlock.test.ts がスキーマの entries を直接検査している（公開 API 経由では書けない）",
  },
  {
    file: "packages/timer-core/src/error-messages.ts",
    name: "DEFAULT_ERROR_MESSAGE",
    reason: "既定文言の正本。落とすと 3 ファイルへ文言リテラルが複製される",
  },
  {
    file: "packages/rate-limit/src/client-key.ts",
    name: "normalizeClientAddress",
    reason:
      "packages/rate-limit/tests/client-key.test.ts が IP 正規化そのものを直接検証している唯一の土台。index.ts は ADR-0012 D3 により意図的にこの記号を公開しておらず（生の IP を外へ出さない）、公開 API 経由では HMAC 済みの不透明な文字列しか観測できないため、/64 丸め・IPv4-mapped の畳み込みという安全上の不変条件を書けなくなる",
  },
  {
    file: "packages/rate-limit/src/token-bucket.ts",
    name: "DEFAULT_SWEEP_THRESHOLD",
    reason:
      "掃除の既定しきい値の正本（#103 設計正本 D4）。落とすと packages/rate-limit/tests/token-bucket.test.ts へ 1_000 という数値リテラルが複製され、値の変更を検知する検査が値の写しを検査するだけになる（DEFAULT_ERROR_MESSAGE と同型）",
  },
  {
    file: "packages/rate-limit/src/token-bucket.ts",
    name: "MAX_SWEEP_THRESHOLD",
    reason:
      "掃除しきい値の上限の正本（#103 設計正本 D4）。createTokenBucketLimiter の入力検証と例外文言が参照しており、テストは境界値（上限ちょうど・上限＋1）をこの記号から作る。落とすと 1_000_000 が検査側へ複製される",
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
 * SC-029（FR-093）の例外。**テスト名に仕様の識別番号を含めてよいファイルだけ**を、理由つきで載せる。
 *
 * ADR-0006 決定 5（#168 で timer 限定の規約から全体規範へ昇格）は、仕様の識別番号を
 * テスト名ではなく `describe` 直上の JSDoc `@requirements` へ置くと定めている。
 * 名前へ書かざるを得ないファイル（組み合わせを名前で網羅する差分テスト等）は、
 * ここへ理由つきで挙げる。理由を書けないものは例外にしない。
 *
 * **除外は分母から行う。**「この規約の対象ではない」という意味であり、
 * 「満たしたことにする」のではない（SC-032 の例外表と同じ作法）。
 *
 * **例外表は両方向に腐る。** ファイルが消えたのに例外が残れば静かに空回りし、
 * 名前から識別番号が消えても例外だけが残る。どちらも
 * {@link findStaleSc029Exceptions} が落とす。
 *
 * **現在は 0 件。** timer 時代の唯一のエントリ
 * `packages/timer-core/test/permissions-differential.test.ts` は、そのテスト名から
 * 識別番号が既に消えており（`` `${label} → オラクルと一致する` `` /
 * `"対象コマンドは25件である"` など）、例外表から外しても SC-029 は 0 のままだった
 * （#184 で実測）。何も外していない例外だったので外した。
 */
export const SC029_EXCEPTIONS = [];

/**
 * SC-029 の例外表が腐っていないかを見る（純粋）。問題が無ければ空配列。
 *
 * ## 何を見るか
 *
 * 例外 1 件ごとに、次の 3 つの向きで落とす。**それぞれ違う文言で報告する。**
 *
 *   1. 例外が指すファイルが走査対象に無い（改名・移設・削除）
 *   2. そのファイルのテスト名に仕様の識別番号が 1 つも無い（例外がもう要らない）
 *   3. 理由が空（{@link EXCLUDED_PACKAGES} と同じ作法。理由の書けない例外は置かない）
 *
 * **2 は SC-032 の「分母に入らなくなった」とは違う。** {@link findStaleTestExceptions} が
 * その向きで落とさないのは、生死が理由と無関係な行数のしきい値に連動してしまうためである。
 * SC-029 の例外が外す条件（そのファイルの名前に識別番号があるか）は、例外の理由
 * そのものなので、条件が消えた例外は端的に空回りである。
 *
 * ## 何を見ていないか — **「足りる」とは言わない**
 *
 * - **理由の内容が本当かは見ていない。** 空文字列でないことしか見ない。
 * - **例外に挙げるべきファイルが挙がっているかは見ていない。** もう片方向は
 *   指標そのもの（{@link sc029SpecIdsInNames} の件数）が受け持つ。
 * - **識別番号の判定は {@link SPEC_ID_RE} と同じ精度しか持たない。**
 *
 * @param exceptions 例外表（`{ file, reason }` の配列）
 * @param testFiles `Map<リポジトリ相対パス, ソース>`。SC-029 が測る走査対象そのもの
 */
export function findStaleSc029Exceptions(exceptions, testFiles) {
  const problems = [];
  for (const e of exceptions) {
    if (typeof e.reason !== "string" || e.reason.trim() === "") {
      problems.push(`SC-029 の例外に理由がありません: ${e.file}`);
    }
    const content = testFiles.get(e.file);
    if (content === undefined) {
      problems.push(
        `SC-029 の例外が指すファイルが走査対象にありません: ${e.file}（例外を消すか、走査対象を直してください）`,
      );
      continue;
    }
    if (!extractTestNames(content).some((name) => SPEC_ID_RE.test(name))) {
      problems.push(
        `SC-029 の例外が不要になりました: ${e.file} のテスト名に仕様の識別番号はもうありません（例外を消してください）`,
      );
    }
  }
  return problems;
}

/**
 * SC-032 の例外。**前提・操作・検証の区切りが概念的に当てはまらないテストだけ**を、理由つきで載せる。
 *
 * ADR-0006 決定 2 は「本体が 2 行以下の自明なテストは対象外」と定めている。その意図は
 * 「区切っても読み手の役に立たないテストには求めない」ことである。ところが分母の判定は
 * **物理行**を数えるため、**1 つの式が複数行にまたがるだけ**で 3 行以上と見なされる。
 * その結果、操作が一つも無いテストが対象に入りうる。
 *
 * 判定を「文数え」へ変える案は #168 の敵対的検証で却下した（`it.each` の 41 件中 35 件が
 * 対象外に落ち、区切り済みの 34 行のテストまで分母から消えるため）。**尺度は変えず、
 * 当てはまらないものを名指しで挙げる。**
 *
 * 散文での前例もある（`apps/timer-sync/test/error-code-coverage.test.ts` が
 * 「メタテストであり、前提・操作・検証という区切りが通常の意味では当てはまらない」と明記）。
 *
 * **除外は分母から行う。**「この規約の対象ではない」という意味であり、
 * 分子に足して「満たしたことにする」のではない。
 *
 * **例外表は両方向に腐る。**{@link findStaleTestExceptions} が落とす。
 */
export const SC032_EXCEPTIONS = [
  {
    file: "packages/poker-core/tests/deck.test.ts",
    testName: "フィボナッチ10種を順序どおりに含む（0,1,2,3,5,8,13,21,?,☕）",
    reason:
      "import 済みのモジュール定数の形を expect で直接見るだけで、テスト本体の中に操作と呼べる処理が無い。// When を足すと操作を指すふりの飾りになる（#168 で実装者とレビュアが独立に同じ結論）",
  },
];

/**
 * SC-032 の例外表が腐っていないかを見る（純粋）。問題が無ければ空配列。
 *
 * ## 何を見るか
 *
 * 例外 1 件ごとに、次の 4 つの向きで落とす。**それぞれ違う文言で報告する**
 * （赤を見たときに、どの向きで腐ったのかが取り違えなく分かるように）。
 *
 *   1. 例外が指すファイルが走査対象に無い（改名・移設・削除）
 *   2. 例外が指すテスト名がそのファイルに無い（改名・削除）
 *   3. そのテストが区切りを持つようになった（例外がもう要らない）
 *   4. 理由が空（{@link EXCLUDED_PACKAGES} と同じ作法。理由の書けない例外は置かない）
 *
 * **「分母に入らなくなった」は落とさない。** 本体が縮んで
 * {@link countMeaningfulBodyLines} が 3 未満になったテストは、例外が無くても
 * SC-032 の分母に入らない。その状態の例外は何も外していない＝空回りだが、赤にはしない。
 *
 * 落とす向きへ倒すと、例外の生死が**行数のしきい値**に連動する。このしきい値は
 * 例外の理由（「テスト本体の中に操作と呼べる処理が無い」）とは無関係な尺度なので、
 * 主張が何も変わらないまま意味のある行が 1 行増減しただけで、例外が「要らない」と
 * 「要る」を往復し、そのたびに検査が赤くなって例外表の削除と再追加を強いる。
 * 空回りしたまま残る側の害は、表に 1 行残ることだけである。
 *
 * ## 何を見ていないか — **「足りる」とは言わない**
 *
 * - **理由の内容が本当かは見ていない。** 空文字列でないことしか見ないので、
 *   でたらめな理由を書けば通る。理由はレビューが読むためのものである。
 * - **例外に挙げるべきテストが挙がっているかは見ていない。** これは
 *   「挙げた例外が腐っていないか」だけを見る片方向の検査であり、
 *   もう片方向は指標そのもの（{@link sc032GwtMarkers} の割合）が受け持つ。
 * - **テストの同定は先頭行の名前だけで行う。** {@link testNameOfBody} の限界を
 *   そのまま引き継ぐ。名前が先頭行に無い書き方（`it.each`）は 2. で落ちる＝安全側。
 * - **区切りの有無は {@link hasGwtMarkers} と同じ精度しか持たない。**
 *   `// Given` / `// When` の文字列が本体のどこかにあれば「持っている」に倒れるので、
 *   飾りとして足したコメントも区切りと見なされる。その向きは例外が余計に消される側＝安全側である。
 *
 * @param exceptions 例外表（`{ file, testName, reason }` の配列）
 * @param testFiles `Map<リポジトリ相対パス, ソース>`。SC-032 が測る走査対象そのもの
 */
export function findStaleTestExceptions(exceptions, testFiles) {
  const problems = [];
  for (const e of exceptions) {
    if (typeof e.reason !== "string" || e.reason.trim() === "") {
      problems.push(`SC-032 の例外に理由がありません: ${e.file} の「${e.testName}」`);
    }
    const content = testFiles.get(e.file);
    if (content === undefined) {
      problems.push(
        `SC-032 の例外が指すファイルが走査対象にありません: ${e.file}（例外を消すか、走査対象を直してください）`,
      );
      continue;
    }
    const bodies = splitIntoTestBodies(content).filter(
      (bodyLines) => testNameOfBody(bodyLines) === e.testName,
    );
    if (bodies.length === 0) {
      problems.push(
        `SC-032 の例外が指すテストがありません: ${e.file} の「${e.testName}」（改名・削除したなら例外も消してください）`,
      );
      continue;
    }
    // 同名が複数あるときは、**すべてが区切りを持って初めて**不要と見なす。
    // 1 件でも区切りを持たないものが残っているなら、例外はまだ仕事をしている。
    if (bodies.every((bodyLines) => hasGwtMarkers(bodyLines.join("\n")))) {
      problems.push(
        `SC-032 の例外が不要になりました: ${e.file} の「${e.testName}」は前提・操作の区切りを持っています`,
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
 * FR-119②③ が層で切っている境界。
 *
 * FR-119 は対象を層の言葉で定めている（設計正本
 * `docs/plans/codebase-refactoring/spec.md` の FR-119）:
 * 「**`packages/` の公開データ（定数・テーブル）は対象である**」。
 * `packages/timer-core` のような**特定のパッケージ名は 1 つも出てこない**。
 * したがって走査対象はこの接頭辞から導き、パッケージ名を名指ししない
 * （名指しは #180 が実際に踏んだ形。「列挙は腐る。機構で指す」）。
 */
const PACKAGE_LAYER_PREFIX = "packages/";

/** 宣言されたパッケージが `packages/` 層かどうか。**判定はこの 1 か所だけ**（ADR-0014 決定 9）。 */
export function isPackageLayer(pkg) {
  return pkg.startsWith(PACKAGE_LAYER_PREFIX);
}

/**
 * SC-039②③ の**照合先**として宣言されているパッケージ（純粋）。
 *
 * `packages/` 層のうち src を持つもの。`loaded` ではなく**宣言**から導くので、
 * {@link buildSc039Sources} が実際に組み立てた一覧と全単射で照合できる（#135 の機構）。
 */
export function sc039DeclaredComparedPackages(declarations) {
  return declarations
    .filter((d) => isPackageLayer(d.pkg) && hasScanTarget(d.src))
    .map((d) => d.pkg)
    .sort();
}

/**
 * SC-039②③ の**参照元**として宣言されているパッケージ（純粋）。
 *
 * 層は問わない（`apps/` も `packages/` も製品コードである）。到達性で絞るために
 * エントリが要るので、src とエントリの両方を持つ宣言だけが参照元になる。
 * エントリを持たない src 宣言は {@link findSrcWithoutEntry} が別に落とす。
 */
export function sc039DeclaredReferencePackages(declarations) {
  return declarations
    .filter((d) => hasScanTarget(d.src) && hasScanTarget(d.entry))
    .map((d) => d.pkg)
    .sort();
}

/**
 * SC-039②③ の**照合先ファイル**として宣言されているファイル（純粋）。
 *
 * **パッケージ単位の名乗り（{@link sc039DeclaredComparedPackages}）では足りない。**
 * 「そのパッケージは 1 件以上寄与し続けるが、特定のファイルだけが集合から抜ける」
 * 狭め方は、パッケージ名の全単射照合にも 0 件ガードにも例外表の健全性にも掛からず
 * exit 0 で素通りする（#180 の敵対的レビューが実測。`stats.ts` 1 件を間引くと
 * 「照合先 4 パッケージ / 28 ファイル」で緑になった）。照合の粒度をファイルへ上げる。
 *
 * 導出は宣言（`packages/` 層で src を持つ）と、その src ディレクトリを実際に読んだ
 * 結果だけから行う。**パッケージ名もファイル名も名指ししない**（「列挙は腐る。機構で指す」）。
 * 照合先には絞り込みが一切無い（到達性でも絞らない）ので、読めたファイルがそのまま宣言になる。
 *
 * @param loaded {@link loadScanTargets} の結果
 */
export function sc039DeclaredComparedFiles(loaded) {
  const files = [];
  for (const p of loaded) {
    if (!isPackageLayer(p.pkg) || !hasScanTarget(p.src)) continue;
    for (const k of p.srcFiles.keys()) files.push(`${p.pkg}/${p.src}/${k}`);
  }
  return files.sort();
}

/**
 * SC-039②③ の**参照元ファイル**として宣言されているファイル（純粋）。
 *
 * 参照元には**意図した絞り込みが 1 つだけ**ある — 到達性
 * （{@link computeReachableFiles}）。死んだファイルからの参照は生存の根拠にならない
 * ため、これは宣言の一部である。したがって宣言側でも同じ絞り込みを適用する。
 *
 * **ここに書いてよい絞り込みは到達性だけ。** 追加の条件を書くと、その条件で
 * 組み立て側を狭めたときに宣言側も揃って狭まり、照合が素通りする。
 *
 * @param loaded {@link loadScanTargets} の結果
 */
export function sc039DeclaredReferenceFiles(loaded) {
  const files = [];
  for (const p of loaded) {
    if (!hasScanTarget(p.src) || !hasScanTarget(p.entry)) continue;
    const reachable = computeReachableFiles(p.srcFiles, [p.entry]);
    for (const k of p.srcFiles.keys()) {
      if (!reachable.has(k)) continue;
      files.push(`${p.pkg}/${p.src}/${k}`);
    }
  }
  return files.sort();
}

/**
 * SC-039④ の**走査対象ファイル**として宣言されているファイル（純粋）。
 *
 * 公開契約は「`packages/` 層のエントリ」そのものである。`apps/` のエントリは
 * 公開契約ではないので入らない（`scripts/audit-public-surface.mjs` が `export *` を
 * 見る範囲より狭い。あちらは「エントリに `export *` を置く動機が無い」ことを根拠に
 * 広く採ったが、こちらは「外から取り込まれるか」を問うので、取り込まれる側に限る）。
 *
 * **絞り込みを書かない。** 実在確認は `main()` の `existenceTargets` が先に行っており、
 * ここで `srcFiles.has(entry)` のような条件を足すと、組み立て側が同じ条件で狭まったときに
 * 宣言側も揃って狭まり、照合が素通りする（{@link sc039DeclaredReferenceFiles} と同じ理由）。
 *
 * @param loaded {@link loadScanTargets} の結果
 */
export function sc039DeclaredContractFiles(loaded) {
  return loaded
    .filter((p) => isPackageLayer(p.pkg) && hasScanTarget(p.src) && hasScanTarget(p.entry))
    .map((p) => `${p.pkg}/${p.src}/${p.entry}`)
    .sort();
}

/**
 * ファイル単位のずれを人が読める形にする（純粋）。
 *
 * **`formatTargetDiff` を流用しない。** あちらの文言は「宣言にあるが実在しない ←
 * 移設したなら宣言を直す」であり、ここで落ちるファイルは**実在している**。
 * 実在するのに集合へ入っていない、という別の失敗なので、直し方の案内も別になる。
 * 誤った案内を出す赤は、赤が出ないのと同じくらい人を遠回りさせる。
 *
 * 走査量を必ず添えるのは `formatTargetDiff` と同じ理由（#135 D5・ADR-0014 決定 6）。
 */
export function formatSc039FileDrift(diff, scanSummary) {
  const lines = ["[audit-structure/SC-039] 走査対象のファイルが宣言とずれています"];
  for (const m of diff.missing) {
    lines.push(`  宣言では走査するのに集合へ入っていない: ${m}    ← 組み立て側の絞り込みを外す`);
  }
  for (const u of diff.unexpected) {
    lines.push(`  集合に入っているが宣言では走査しない:  ${u}    ← 宣言へ足すか、集合へ入れない`);
  }
  lines.push(`  現在の走査対象: ${scanSummary}`);
  return lines.join("\n");
}

/**
 * src を持つのにエントリを持たない宣言を列挙する（純粋）。
 *
 * この形の宣言は**2 つの検査を同時に静かに失わせる**。SC-027 は
 * `hasScanTarget(p.entry)` で絞るので測定対象から外れ、SC-039 の参照元も
 * 到達性を計算できないため外れる。外れた分の走査量は他パッケージ分で
 * 非ゼロのままなので、0 件ガードにも全単射照合にも掛からない（#158 と同型）。
 *
 * 落とすのは呼び出し側（`process.exit` は呼ばない）。
 */
export function findSrcWithoutEntry(declarations) {
  return declarations
    .filter((d) => hasScanTarget(d.src) && !hasScanTarget(d.entry))
    .map((d) => d.pkg)
    .sort();
}

/**
 * SC-039②③④ が使う 3 つの集合（純粋）を、読み込み済みの走査対象から組み立てる。
 *
 * **呼ぶのは `main()` の 1 回だけ。`runAudit()` はその結果を引数で受け取る**
 * （ADR-0014 決定 9）。以前は両者が同じ `loaded` から**別々に呼んで**いたため、
 * 決定 9 を「呼び出し箇所の数」では満たしても**同一性**では満たしておらず、
 * 照合が終わった後で指標側の集合だけを間引けた（#198）。
 * 2 か所で別々に組み立てると、条件式が割れた瞬間にガードが静かに空振りする
 * （このリポジトリが実際に踏んだ形。`loadScanTargets` の docstring を参照）。
 *
 * - `packageSrcFiles`: SC-039②③ が数える対象。**`packages/` 層で src を持つ宣言すべて**
 *   （FR-119②③は層で切っている。{@link isPackageLayer}）。到達性では絞らない。
 * - `productSources`: 参照元となる製品コード。**SC-027 が到達不能と判定したファイルを除く。**
 *   死んだファイルからの参照は生存の根拠にならない。これを除かないと、
 *   「撤去予定のファイルからしか参照されていない記号」が生きているように見え、
 *   G1 で撤去した瞬間に SC-039 の値が跳ね上がる（計測器が撤去を検知できない）。
 *   **テストは含めない**（FR-090）。
 * - `contractFiles`: SC-039④ が数える対象。**`packages/` 層のエントリそのもの**
 *   （＝そのパッケージの公開契約）。宣言は {@link sc039DeclaredContractFiles} が導く。
 * - `comparedPackages` / `referencePackages`: **実際に 1 件以上寄与したパッケージ**の一覧。
 *   宣言（{@link sc039DeclaredComparedPackages} / {@link sc039DeclaredReferencePackages}）と
 *   全単射で照合するために返す。ここを「宣言をそのまま写す」実装にしてはならない —
 *   写すと、組み立て側にパッケージ名の名指しが戻っても照合が素通りする。
 *
 * **#180 まで、ここは `packages/timer-core` を名指しで取り出していた。**
 * 指標は「公開記号 0 件」と報告していたが、それは timer-core についてのみ 0 で、
 * 他の 3 パッケージは一度も測られていなかった。
 *
 * ## 照合の粒度は**ファイル**
 *
 * 返す 3 つの Map のキーそのものが、宣言（{@link sc039DeclaredComparedFiles} /
 * {@link sc039DeclaredReferenceFiles} / {@link sc039DeclaredContractFiles}）と
 * 全単射で照合される。**パッケージ単位の
 * 名乗りだけでは足りない** — この関数の中に
 * `if (p.pkg === "packages/poker-core" && k === "stats.ts") continue;` の 1 行を
 * 差し込むと、そのパッケージは他の 7 ファイルで寄与し続けるためパッケージ名の照合を
 * 通り、走査量も 0 件にならず、例外表も腐らない。実測ではこの状態が
 * 「照合先 4 パッケージ / 28 ファイル」（正規は 29）で **exit 0** だった（#180 の
 * 敵対的レビュー）。ファイル単位へ上げるとこれは赤になり、抜けたファイルが名指しされる。
 *
 * ## 塞げていないこと（すべて実測。**緑は「走査範囲が正しい」ことを証明しない**）
 *
 * 落ちるのは**この関数の中の絞り込み**と、`main()` の照合より**手前**での間引きだけ。
 * 次の 4 つは落ちない。共通する形は「宣言側と実体側が同じ上流を通るので揃って狭まる」
 * か「照合より後段にある」かのどちらかである。
 *
 * 1. **層の述語（{@link isPackageLayer}）そのものの書き換え。** 宣言側も実体側も
 *    同じ述語を通る（判定を 1 本に固定する決まり・ADR-0014 決定 9 の裏返しであり、
 *    両立しない）。実測: `packages/` を timer-core と rate-limit の 2 つへ狭めると
 *    「照合先 2 パッケージ / 19 ファイル」で exit 0。**例外表（{@link SC039C_EXCEPTIONS}）が
 *    名指しするパッケージを外すと偶然落ちるが、それは例外表の中身に依存した
 *    偶然であって構造的な歯止めではない。**
 * 2. **読み込みそのものの書き換え**（`main()` が {@link loadScanTargets} へ渡す
 *    `readFilesRecursive` / 拡張子の集合）。宣言側も実体側も同じ `loaded` から導くので
 *    揃って狭まる。実測: 読み込み時に 1 ファイルを落とすと「照合先 28 / 参照元 185」で exit 0。
 * 3. **照合より後段での間引き**（指標を測る側の中）。照合は既に終わっている。
 *    **#198 で「走査対象そのものを間引く形」だけを塞いだ。** `runAudit()` は集合を
 *    組み立て直さず引数で受け取り、**自分が指標を測るのに使った走査対象の規模を名乗る**
 *    （{@link scanVolumeOf}）。`main()` が組み立て直後に控えた規模と突き合わせ、
 *    食い違えば指標の表を出す前に落とす（{@link findScanVolumeDrift}）。
 *    塞ぐ前の実測: 組み立て直した Map から 1 件 delete しても、`loaded` から 1 件
 *    落としても、走査量の表示すら変わらず exit 0（いずれも出力がバイト単位で同一）。
 *    **残るのは「別の集合を渡す形」**。`sc032GwtMarkers(new Map([...allTestFiles].slice(1)))`
 *    のように**絞り込んだ別の集合を指標関数へ渡す**と、名乗りは元の集合を読んだままなので
 *    差が出ない（実測で exit 0）。突き合わせが見るのは件数だけなので、**同数の入れ替え**も
 *    検知しない。そこを守るのは指標関数自身のテストと `scripts/mutation-check.mjs` である。
 * 4. **宣言の `entry` を別ファイルへ差し替えて到達性を痩せさせる。** 参照元の絞り込みは
 *    到達性であり、宣言側（{@link sc039DeclaredReferenceFiles}）も同じ到達性を通る。
 *    実測: poker-core の entry を `index.ts` → `deck.ts` にすると参照元 186 → 179 で exit 0。
 *
 * 1・2・4 の歯止めは、出力する走査量の数字が変わることと、それが 1 行の差分として
 * diff に現れることの 2 つに限られる（この 3 つは宣言側と実体側が同じ上流を通るため
 * 構造的に不可避。#196 で文書化した）。3 に残った形にはその歯止めすら無い。
 *
 * @param loaded {@link loadScanTargets} の結果
 */
export function buildSc039Sources(loaded) {
  const packageSrcFiles = new Map();
  const productSources = new Map();
  const contractFiles = new Map();
  const comparedPackages = [];
  const referencePackages = [];

  for (const p of loaded) {
    if (!hasScanTarget(p.src)) continue;
    const prefix = `${p.pkg}/${p.src}/`;

    if (isPackageLayer(p.pkg)) {
      // **名乗りは「実際に集合へ入ったか」で決める。** `p.srcFiles.size > 0` で
      // 判断すると、ここへ名指しの絞り込みが差し込まれても名乗りだけが残り、
      // 宣言との照合が素通りする（この検査自身が塞ぐはずの穴を自分で開ける）。
      const before = packageSrcFiles.size;
      for (const [k, v] of p.srcFiles) packageSrcFiles.set(prefix + k, v);
      if (packageSrcFiles.size > before) comparedPackages.push(p.pkg);

      // SC-039④ の走査対象は `packages/` 層のエントリそのもの（#182）。
      // **エントリが読めなかったときは入れない。** 宣言側
      // （{@link sc039DeclaredContractFiles}）は無条件に挙げるので、
      // 入れ損ねはファイル単位の照合で赤になる（空文字列で埋めると黙って 0 件になる）。
      const entrySource = hasScanTarget(p.entry) ? p.srcFiles.get(p.entry) : undefined;
      if (entrySource !== undefined) contractFiles.set(prefix + p.entry, entrySource);
    }

    if (!hasScanTarget(p.entry)) continue;
    const reachable = computeReachableFiles(p.srcFiles, [p.entry]);
    const before = productSources.size;
    for (const [k, v] of p.srcFiles) {
      if (!reachable.has(k)) continue;
      productSources.set(prefix + k, v);
    }
    if (productSources.size > before) referencePackages.push(p.pkg);
  }

  return {
    packageSrcFiles,
    productSources,
    contractFiles,
    comparedPackages: comparedPackages.sort(),
    referencePackages: referencePackages.sort(),
  };
}

/**
 * SC-039②③ の走査量を人が読む 1 行にする（ADR-0014 決定 6）。
 *
 * **パッケージ数とファイル件数の両方を出す。** ファイル件数だけでは、
 * 「どこを測った 0 件なのか」が読み手に伝わらない（#180 の現象そのもの）。
 */
export function formatSc039ScanVolume(sources) {
  return (
    `照合先 ${sources.comparedPackages.length} パッケージ / ${sources.packageSrcFiles.size} ファイル、` +
    `参照元 ${sources.referencePackages.length} パッケージ / ${sources.productSources.size} ファイル、` +
    `公開契約 ${sources.contractFiles.size} ファイル`
  );
}

/**
 * SC-039②③ の 0 件ガードが見る内訳（ADR-0014 決定 8）。
 *
 * **{@link formatSc039ScanVolume} が出力するのとまったく同じ 5 つ**を見る。
 * **片方に足したらもう片方にも足すこと**（#182 で公開契約を足したとき、この数字だけが
 * 4 のまま取り残された）。
 */
export function sc039ScanVolumeDimensions(sources) {
  return [
    { label: "SC-039 の照合先パッケージ", count: sources.comparedPackages.length },
    { label: "SC-039 の照合先ファイル", count: sources.packageSrcFiles.size },
    { label: "SC-039 の参照元パッケージ", count: sources.referencePackages.length },
    { label: "SC-039 の参照元ファイル", count: sources.productSources.size },
    { label: "SC-039④ の公開契約ファイル", count: sources.contractFiles.size },
  ];
}

/**
 * テスト系の指標（SC-028/029/030/031/032/036）が見る 1 つの集合を組み立てる（純粋）。
 *
 * 鍵は**リポジトリ相対パス**（`packages/poker-core/tests/deck.test.ts` の形）。
 *
 * **呼ぶのは `main()` の 1 回だけ。`runAudit()` はその結果を引数で受け取る**
 * （ADR-0014 決定 9）。SC-032 の例外表はこの鍵でファイルを名指しするため、
 * 2 か所で組み立てると鍵の作り方が割れた瞬間に、例外表のガードは「実在する」と言い、
 * 指標側は 1 件も外さない、という食い違いが静かに成立する。以前は同じ `loaded` から
 * **別々に呼んで**いたため、照合が終わった後で指標側だけを間引けた（#198）。
 *
 * @param loaded {@link loadScanTargets} の結果
 */
export function buildAllTestFiles(loaded) {
  const allTestFiles = new Map();
  for (const p of loaded) {
    for (const [k, v] of p.testFiles) allTestFiles.set(`${p.pkg}/${p.test}/${k}`, v);
  }
  return allTestFiles;
}

/**
 * 走査対象の規模を、**その集合そのものから読む**（#198）。
 *
 * 照合した側（`main()`）と指標を測った側（`runAudit()`）の両方がこれを呼び、
 * 値が食い違えば「照合より後段で間引かれた」ことになる。
 *
 * **渡すのは実際に指標関数へ手渡した集合であること。** `sc039Sources` のような
 * 入れ物から読み直すと、中で別の集合へ差し替えられたときに気づけない。
 *
 * **`loaded` そのものも走査対象である。** SC-027 は `loaded` を直接たどり、
 * SC-035 / SC-039① は個々のパッケージの `srcFiles` を直接読む。3 つの派生集合だけを
 * 名乗ると、`loaded` を痩せさせる変更が丸ごと素通りする（実測: `loaded` から 1 件
 * 落としても出力がバイト単位で同一のまま exit 0 だった）。
 */
export function scanVolumeOf(loaded, packageSrcFiles, productSources, allTestFiles, contractFiles) {
  return {
    走査パッケージ: loaded.length,
    "src ファイル": loaded.reduce((n, p) => n + p.srcFiles.size, 0),
    "test ファイル": loaded.reduce((n, p) => n + p.testFiles.size, 0),
    "SC-039 照合先": packageSrcFiles.size,
    "SC-039 参照元": productSources.size,
    テスト集合: allTestFiles.size,
    "SC-039 公開契約": contractFiles.size,
  };
}

/**
 * 照合したときの規模と、指標が測ったときの規模のずれを名指しする（#198）。
 *
 * **照合の後で集合を間引く変更は、他のどのガードにも掛からない。** 全単射照合も
 * 0 件ガードも例外表の健全性も、指標より手前で終わっている。走査量の表示も
 * 手前なので数字にすら痕跡が残らない（#196 の時点で実測。出力がバイト単位で同一）。
 *
 * 判定は純粋関数、I/O と `process.exit` は呼び出し側に置く。
 * `measured` にキーが欠けていれば `undefined` との比較でずれとして出る（不足側へ倒す）。
 */
export function findScanVolumeDrift(scanned, measured) {
  return Object.keys(scanned)
    .filter((label) => scanned[label] !== measured[label])
    .map((label) => `${label}: ${scanned[label]} → ${measured[label]}`);
}

/**
 * 指標を測る。**読み込み済みの走査対象（`loadScanTargets` の結果）を受け取る。**
 * 自分で読み直さないこと — 読み込み条件が二重化した瞬間に、ガードが数えた集合と
 * ここで測る集合が食い違う（ADR-0014 決定 9）。
 */
function runAudit(loaded, sc039Sources, allTestFiles) {
  const byPkg = new Map(loaded.map((p) => [p.pkg, p]));

  // SC-035 / SC-039① は timer 固有の指標。走査を広げてもここは変えない
  // （SC-035 は timer の文言テーブル、SC-039① は timer の既知パターン 1 つが対象。
  //   測った範囲は SC039A_SCOPE として指標の値に添える）。
  // **SC-039②③ は #180 で `packages/` 全体へ広げた。** 集合は `buildSc039Sources` が
  // 宣言から導く。ここでは組み立てない。
  const sync = byPkg.get("apps/timer-sync");
  const web = byPkg.get("apps/timer-web");

  // **テスト集合は `main()` が照合したものをそのまま受け取る**（ADR-0014 決定 9）。
  // ここで組み立て直すと、呼び出し箇所の数では決定 9 を満たしても**同一性**では
  // 満たさず、照合が終わった後で静かに間引ける（#198）。

  // SC-027: エントリを持つパッケージごとに到達性を測り、合算する
  const sc027 = loaded
    .filter((p) => hasScanTarget(p.entry))
    .reduce((n, p) => n + sc027UnreachableModules(p.srcFiles, [p.entry]), 0);

  const sc028 = sc028DuplicateTestDoubles(allTestFiles);

  // FR-093 の例外表。**組み立ては SC029_EXCEPTIONS の 1 か所だけ**（ADR-0014 決定 9）。
  // ここで別の配列を書くと、`main()` の例外表ガードが見る表と指標が使う表が食い違う。
  const sc029 = sc029SpecIdsInNames(allTestFiles, SC029_EXCEPTIONS);
  const sc030 = sc030CallNamesInNames(allTestFiles);
  const sc031 = sc031GuardExpects(allTestFiles);
  const sc032 = sc032GwtMarkers(allTestFiles, SC032_EXCEPTIONS);
  const sc036 = sc036TestCount(allTestFiles);

  const serverSources = [...sync.srcFiles.values()];
  const clientSource = web.srcFiles.get("App.tsx") ?? "";
  const sc035 = sc035MessageDefinitions(serverSources, clientSource);

  const handlersSource = sync.srcFiles.get("application/handlers.ts") ?? "";
  // **走査対象は `main()` が照合したものをそのまま受け取る**（ADR-0014 決定 9）。
  // ここで組み立て直すと、腐った例外を抱えたまま静かに「0 件」を報告できてしまう。
  const { packageSrcFiles, productSources, contractFiles } = sc039Sources;
  const sc039 = sc039UnreachableElements({
    handlersSource,
    packageSrcFiles,
    productSources,
    contractFiles,
    exceptions: SC039C_EXCEPTIONS,
  });

  // **測った集合そのものから規模を名乗る**（#198）。`main()` が照合したときの値と
  // 突き合わせるための申告であり、ここで数え直しているのは「件数」ではなく
  // 「いま指標を測るのに使った集合の `size`」である。
  const measured = scanVolumeOf(loaded, packageSrcFiles, productSources, allTestFiles, contractFiles);

  const results = {
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
        `分岐 ${sc039.unreachableBranches}（${SC039A_SCOPE}）/ ` +
        `データ ${sc039.unusedPublicDataLines} 行 / ` +
        `公開記号 ${sc039.selfOnlyPublicSymbols} 件 / ` +
        `公開契約 ${sc039.contractOnlyValues} 件`,
      target: "分岐0 / データ0行 / 公開記号0件 / 公開契約0件",
      raw: sc039,
    },
  };

  return { results, measured };
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

  // src を持つのにエントリを持たない宣言を落とす（#180）。
  // その形の宣言は SC-027 の測定対象からも SC-039 の参照元からも静かに外れる。
  // 外れても走査量は他パッケージ分で非ゼロのままなので、0 件ガードでは捕まらない。
  const srcWithoutEntry = findSrcWithoutEntry(SCANNED_PACKAGES);
  if (srcWithoutEntry.length > 0) {
    console.error(
      "[audit-structure] src を宣言したのにエントリ（entry）がありません（SC-027 と SC-039 の参照元を静かに失います）",
    );
    for (const pkg of srcWithoutEntry) console.error(`  ${pkg}`);
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

  // 派生集合の組み立てはここ 1 か所だけ（ADR-0014 決定 9）。`runAudit()` へは
  // **この同じオブジェクトを渡す**。以前は指標側でも組み立て直しており、
  // 呼び出し箇所の数では決定 9 を満たしても同一性では満たしていなかった（#198）。
  const sc039Sources = buildSc039Sources(loaded);
  const allTestFiles = buildAllTestFiles(loaded);

  // **規模を控えるのは組み立てた直後**（#198）。以降の照合・例外表・走査量の表示は
  // すべてこの控えと同じ集合を見る。**控えを後ろへ置くと、照合や表示のあとで
  // 間引かれた状態がそのまま基準値になり、突き合わせが素通りする**
  // （実測: 控えの直前で 1 件消すと、表示は 268 のまま SC-032 の分母だけが動いて exit 0）。
  const scannedVolume = scanVolumeOf(
    loaded,
    sc039Sources.packageSrcFiles,
    sc039Sources.productSources,
    allTestFiles,
    sc039Sources.contractFiles,
  );

  // SC-039②③ の走査範囲そのものの健全性（#180）。**指標を出す前に見る。**

  // 走査量は成否によらず必ず出す（#135 D5・ADR-0014 決定 6）。
  // **パッケージ数まで出す。** #180 まではファイル件数だけを出していたため、
  // 「照合先 14 ファイル」が 1 パッケージ分しか無いことが誰にも見えなかった。
  console.log(`[audit-structure] SC-039②③ の走査対象: ${formatSc039ScanVolume(sc039Sources)}`);

  // 宣言（SCANNED_PACKAGES から導いた一覧）と、実際に組み立てた一覧を全単射で照合する
  // （#135 の機構・ADR-0014 決定 1）。`buildSc039Sources` にパッケージ名の名指しが
  // 戻れば、照合先の一覧が宣言より短くなってここで落ちる。
  const sc039Drift = diffTargets(
    sc039DeclaredComparedPackages(SCANNED_PACKAGES),
    sc039Sources.comparedPackages,
  );
  const sc039RefDrift = diffTargets(
    sc039DeclaredReferencePackages(SCANNED_PACKAGES),
    sc039Sources.referencePackages,
  );
  if (hasTargetDrift(sc039Drift) || hasTargetDrift(sc039RefDrift)) {
    const merged = {
      missing: [...sc039Drift.missing, ...sc039RefDrift.missing].sort(),
      unexpected: [...sc039Drift.unexpected, ...sc039RefDrift.unexpected].sort(),
    };
    console.error(
      formatTargetDiff("audit-structure/SC-039", merged, formatSc039ScanVolume(sc039Sources)),
    );
    process.exit(1);
  }

  // **照合はファイル単位でも行う**（#180 の敵対的レビュー）。上のパッケージ単位の
  // 名乗りは「そのパッケージが 1 件以上寄与したか」しか見ないため、
  // 「パッケージは残るが特定のファイルだけが集合から抜ける」狭め方を素通りさせる。
  // 実測では `packages/poker-core/src/stats.ts` 1 件を間引いた状態が
  // 「照合先 4 パッケージ / 28 ファイル」（正規は 29）で exit 0 だった。
  //
  // 機構は上とまったく同じ（`diffTargets` の両方向）。粒度だけをファイルへ上げる。
  const sc039FileDrift = diffTargets(
    sc039DeclaredComparedFiles(loaded),
    [...sc039Sources.packageSrcFiles.keys()],
  );
  const sc039RefFileDrift = diffTargets(
    sc039DeclaredReferenceFiles(loaded),
    [...sc039Sources.productSources.keys()],
  );
  // SC-039④ の走査対象（`packages/` 層のエントリ）も同じ機構で照合する（#182）。
  const sc039ContractDrift = diffTargets(
    sc039DeclaredContractFiles(loaded),
    [...sc039Sources.contractFiles.keys()],
  );
  if (
    hasTargetDrift(sc039FileDrift) ||
    hasTargetDrift(sc039RefFileDrift) ||
    hasTargetDrift(sc039ContractDrift)
  ) {
    const merged = {
      missing: [
        ...sc039FileDrift.missing,
        ...sc039RefFileDrift.missing,
        ...sc039ContractDrift.missing,
      ].sort(),
      unexpected: [
        ...sc039FileDrift.unexpected,
        ...sc039RefFileDrift.unexpected,
        ...sc039ContractDrift.unexpected,
      ].sort(),
    };
    console.error(formatSc039FileDrift(merged, formatSc039ScanVolume(sc039Sources)));
    process.exit(1);
  }

  // 走査量のどの内訳も 0 件でないことを見る（ADR-0014 決定 8）。
  // 全体の走査量が非ゼロでも、SC-039 の照合先だけが空になる経路は独立に存在する。
  const emptySc039Dimensions = findEmptyScanDimensions(sc039ScanVolumeDimensions(sc039Sources));
  if (emptySc039Dimensions.length > 0) {
    console.error(
      `[audit-structure] SC-039 の走査対象が 0 件です（検査が空振りします）: ${emptySc039Dimensions.join(" / ")}`,
    );
    process.exit(1);
  }

  // 例外表の健全性（走査対象のずれと同じ扱いで合否を持つ）。
  // 指標を出す前に見る。腐った例外を抱えたまま「0 件」と報告させない。
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

  // SC-032 の例外表も同じ扱いで見る。**指標を出す前に**見る。
  // 腐った例外を抱えたまま「100.0%」と報告させない。
  // 見る集合は上で組み立てて控えた `allTestFiles` そのもの（ADR-0014 決定 9）。

  // SC-029 の例外表も同じ扱いで見る。**指標を出す前に**見る。
  // 腐った例外（実在しないパス・何も外していないエントリ）を抱えたまま「0 件」と報告させない。
  const staleSc029Exceptions = findStaleSc029Exceptions(SC029_EXCEPTIONS, allTestFiles);
  // 走査量は成否によらず必ず出す（#135 D5）。何件の例外を何件のファイルに照らしたかが赤の根拠になる。
  console.log(
    `[audit-structure] SC-029 の例外表: ${SC029_EXCEPTIONS.length} 件 / ` +
      `照合先 ${allTestFiles.size} ファイル`,
  );
  if (staleSc029Exceptions.length > 0) {
    for (const p of staleSc029Exceptions) console.error(`[audit-structure] ${p}`);
    process.exit(1);
  }

  const staleTestExceptions = findStaleTestExceptions(SC032_EXCEPTIONS, allTestFiles);
  // 走査量は成否によらず必ず出す（#135 D5）。何件の例外を何件のファイルに照らしたかが赤の根拠になる。
  console.log(
    `[audit-structure] SC-032 の例外表: ${SC032_EXCEPTIONS.length} 件 / ` +
      `照合先 ${allTestFiles.size} ファイル`,
  );
  if (staleTestExceptions.length > 0) {
    for (const p of staleTestExceptions) console.error(`[audit-structure] ${p}`);
    process.exit(1);
  }

  const { results, measured } = runAudit(loaded, sc039Sources, allTestFiles);

  // **指標が測った対象が、照合した対象と同じかを見る**（#198・ADR-0014 決定 9）。
  // 照合・0 件ガード・例外表の健全性・走査量の表示はすべて指標より手前で終わるため、
  // 後段で間引かれると数字にすら痕跡が残らないまま全指標 PASS の表が出る。
  // **指標の表より前に落とす**（腐った表を出させない。決定 7 と同じ扱い）。
  const measuredDrift = findScanVolumeDrift(scannedVolume, measured);
  if (measuredDrift.length > 0) {
    console.error("[audit-structure] 指標が測った走査対象が、照合した走査対象と食い違っています");
    for (const d of measuredDrift) {
      console.error(`  ${d}    ← 照合より後段で間引いています`);
    }
    // **控えた規模そのものを出す。** 全体走査の要約（`summary`）を出していたが、
    // 差分行が名指しする次元の数がそこに現れず、読み手が数字の出どころを追えなかった。
    const scanned = Object.entries(scannedVolume)
      .map(([label, n]) => `${label} ${n}`)
      .join("、");
    console.error(`  照合したときの走査対象: ${scanned}`);
    process.exit(1);
  }

  console.log(`[audit-structure] 走査対象: ${summary}`);
  console.log(formatTable(results));
}

// このファイルが直接実行された場合のみ走査する（テストからの import 時は実行しない）。
if (isDirectRun(import.meta.url, process.argv[1])) main();
