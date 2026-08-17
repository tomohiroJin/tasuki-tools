#!/usr/bin/env node
/**
 * ログ衛生の検査（Issue #136・ADR 0012 D1）。
 *
 * 規則は 1 つだけ:
 *   禁止された構文（正本は下の `FORBIDDEN` 配列。console.* / process.stdout.write /
 *   process.stderr.write / publicText の呼び出し / as LogSafe / ロガの第 1 引数が
 *   素の文字列リテラルでない呼び出し）は、**許可ファイルの、許可マーカーが
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
 *   3. 宣言から導出した走査ディレクトリが実在しない → 赤（#158・ADR-0014 決定 1）。
 *      1 と 2 のどちらも「1 パッケージ分だけ走査対象を失った」状態を検知できない。
 *      走査量は他パッケージ分で非ゼロのまま、必須ファイルも他パッケージに残るからである。
 *
 * 設計方針: 判定は純粋関数にし、実ファイル I/O は main() の薄い配線だけにする。
 * 追加依存は禁止のため Node 標準の fs / path のみを使う。
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

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

/**
 * 走査するパッケージ（リポジトリルート起点）。各パッケージの `src/` 配下の `.ts` を見る。
 *
 * **ハードコードの配列をやめ、workspace の実体と全単射で照合する**（#135 経路⑪）。
 * 以前は timer-sync・poker-sync・rate-limit の 3 つだけを見ており、新設パッケージは
 * 黙って対象外になった。packages/rate-limit（生の IP を最も直接扱う）が実際に
 * 素通りし、最終レビューで人が気づくまで緑のままだった。
 */
export const SCANNED_PACKAGES = [
  "apps/landing",
  "apps/poker-sync",
  "apps/poker-web",
  "apps/timer-sync",
  "apps/timer-web",
  "packages/poker-core",
  "packages/protocol",
  "packages/rate-limit",
  "packages/timer-core",
];

/** 走査から外すパッケージ。**理由が要る。** 実在しなくなったら落ちる。 */
export const EXCLUDED_PACKAGES = [
  { pkg: "packages/ui", reason: "TS を 1 つも持たない（CSS トークンとフォントのみ）" },
  { pkg: "e2e", reason: "src/ を持たない。テストコードのログ経路は本検査の対象外" },
];

/**
 * 実際に走査するディレクトリ。**宣言（パッケージ名）から機械的に導出する。**
 *
 * 導出先の実在は `main()` で `findMissingPaths` により検査する（#158・E1）。
 * 全単射照合はパッケージ名しか見ないため、ここで導出した `src/` が改名・消失しても
 * 照合は通ってしまう。
 */
const SCAN_DIRS = SCANNED_PACKAGES.map((pkg) => `${pkg}/src`);

/**
 * 禁止構文を置いてよいファイル。**行に許可マーカーが必要。**
 *
 * 載せてよいのは、**禁止構文を仕事として実際に含むファイル**である
 * （**件数は書かない。** 項目を足すたびに本文の数を直す運用は必ず腐る）。
 * 現在の全件は、次のいずれかに当たる（2026-08-18 に 1 件ずつ実測）。
 *   - ログの出口そのもの（`console` を実際に呼ぶ場所）
 *   - `publicText()` を呼んで `LogSafe` の値を作る場所（語彙定数の定義と、
 *     例外の分類名をログへ渡す箇所）
 *   - `LogSafe` を型注釈を経由せず直接キャストする場所（相関 ID の生成点と
 *     `publicText` の本体）
 *
 * **この分類は観測であって規則ではない。** 禁止構文の正本は `FORBIDDEN` 配列であり、
 * 上の類型で尽きる保証はない。当てはまらない件が出たらこの箇条書きを増やす。
 * 「この類型**だけ**」と読まないこと。
 *
 * 実在と陳腐化は機械が見る: 走査結果に無いファイルや、許可マーカーを 1 つも
 * 持たないファイルは `findStaleAllowances` が赤にする。
 */
export const ALLOWED_FILES = [
  "apps/timer-sync/src/adapters/console-log-sink.ts",
  "apps/timer-sync/src/server.ts",
  "apps/timer-sync/src/adapters/ws-adapter.ts",
  "apps/timer-sync/src/application/log/vocabulary.ts",
  "apps/timer-sync/src/application/log/ref-encoder.ts",
  "apps/timer-sync/src/application/log/log-safe.ts",
  "apps/poker-sync/src/server.ts",
  // #165 PR-2 で conn-rejected / derive-client-key-error が server.ts から移った先。
  "apps/poker-sync/src/adapters/ws-adapter.ts",
];

/** 走査結果に必ず存在しなければならないファイル（走査対象の消失を検出する）。 */
export const REQUIRED_FILES = [
  "apps/timer-sync/src/create-sync-server.ts",
  "apps/timer-sync/src/application/problem-delegation.ts",
  "apps/timer-sync/src/adapters/console-log-sink.ts",
  "apps/poker-sync/src/server.ts",
  // #165 PR-2 の組み立て関数。**ここで見ているのは実在だけである。**
  // E1 が E2 へ割り当てた機械検査は「実在し、server.ts とテストの両方が経由すること」
  // で、経由の側は scripts/audit-assembly-wiring.mjs が見る。
  "apps/poker-sync/src/create-sync-server.ts",
  // 生の IP を最も直接扱うモジュール（W-3）。SCAN_DIRS からまた落ちたら赤にする。
  "packages/rate-limit/src/client-key.ts",
];

/**
 * 許可マーカー。行末コメントに付ける。
 *
 * **既知の限界（W-4・最終レビューで実証）: マーカーの中身は検査しない。**
 * この検査は「その行に `log-hygiene:allow` という文字列が含まれるか」だけを見る。
 * マーカーに続く説明文（例: `// log-hygiene:allow 列挙値のみ`）は人間向けの注記に
 * すぎず、実際に渡している値が本当に列挙値かどうかは machine-checked ではない。
 * `console.log(JSON.stringify({ client: ws.data.clientAddress })) // log-hygiene:allow 列挙値のみ`
 * のように、説明文が嘘でも検査は素通りする。
 *
 * **意図して直さない。** 「その行が渡す値の形（変数の由来）」を機械的に検証するには
 * 本物の型情報つきパーサ（少なくとも簡易的な式解析）が要る。この検査はかつて
 * 文字単位の状態機械でコメント判定を試み、直すたびに**別の場所に新しい検出漏れ**を
 * 3 回連続で作った（上の `findViolations` の docstring を参照）。無状態＋許可リストへ
 * 倒したことで解消した経緯があり、マーカーの中身まで解析する式レベルの検査を足すと
 * 同じ轍を踏む可能性が高い。偽のマーカーより「賢い検査が新しい穴を作る」ほうが
 * 実害が大きいと判断し、ここでは踏み込まない。
 *
 * 対策としては、レビューで許可マーカー付きの行を重点的に見る（人間の目が最後の砦）
 * ことと、`ALLOWED_FILES` を必要最小限に保つことで、マーカー行そのものの数を
 * 少なく保つ運用でカバーする。恒久対応（値の型を `LogSafe` や語彙定数に強制する等）は
 * 別 Issue で追跡する。
 */
const ALLOW_MARKER = "log-hygiene:allow";

/**
 * ロガ呼び出しの第 1 引数（`event`）が、**その場に書かれた素の文字列リテラルで
 * ないもの**を拾う。
 *
 * `Logger` の `fields` は `LogField`（`number | boolean | LogSafe`）で型の壁に
 * 守られているが、**第 1 引数の `event` は生の `string`** である。そのため
 * 次の 1 行は型検査も全テストもログ衛生の検査もすべて通ってしまい、
 * ルームコードが journal へ出る（最終レビューが実証した反例）。
 *
 *   logger.info(`reclaimed ${code}`, { idleMs });
 *
 * 型で塞げない以上、検査の側で**書ける形そのもの**を縛る。
 *
 * **許可リスト方式にした理由**: 「テンプレートリテラルと `+` を禁止する」という
 * 禁止リスト方式では、別の行で組み立てた変数を渡す形（`logger.info(msg, ...)`）が
 * 素通りする。行をまたぐ状態を持たないこの検査では変数の中身を追えないので、
 * **第 1 引数は素の文字列リテラルだけ**という形に限る。`event` はコード側で
 * 決め打つ短い識別子（`"reclaimed"` 等）なので、この制限で困ることはない。
 *
 * 対象のメソッド名は `Logger` が持つ `info` / `warn` / `error` に、将来の追加を
 * 見越して `debug` / `trace` を加えた 5 つ。**`log` は含めない** — `console.log`
 * は上の `console` 規則が既に拾っており、`Math.log(` のような無関係な呼び出しを
 * 巻き込むと ALLOWED_FILES の外では逃げ道が無いためである。
 *
 * 既知の偽陽性（いずれも安全側＝余計に赤くなる向き。行の書き方で回避できる）:
 *   - 第 1 引数を次の行へ折り返した呼び出し（`logger.info(\n  "event",`）
 *   - リテラルにエスケープされた引用符を含む呼び出し（`logger.info("say \"hi\"")`）
 *   - `logger[level]("event", ...)` のような動的なメソッド参照は、そもそも
 *     `.info(` 等に一致しないため拾えない（この検査の射程外）
 */
const LOGGER_EVENT_ARG =
  /\.(?:info|warn|error|debug|trace)\s*\(\s*(?!(?:"[^"\\\n]*"|'[^'\\\n]*')\s*[,)]|\))/;

/**
 * 禁止構文。`publicText` は定義ではなく呼び出しだけを拾う。
 * `hint` は違反として報告するときの説明文。
 */
const FORBIDDEN = [
  { name: "console", re: /\bconsole\s*\./ },
  { name: "process.stdout", re: /\bprocess\s*\.\s*stdout\s*\.\s*write\b/ },
  { name: "process.stderr", re: /\bprocess\s*\.\s*stderr\s*\.\s*write\b/ },
  { name: "publicText", re: /(?<!function\s)\bpublicText\s*\(/ },
  // `as LogSafe` は型の壁を迂回する第 2 の経路。publicText だけを見ていると
  // `foo as LogSafe` がどこにでも書けてしまい、検査が意味を失う。
  { name: "as LogSafe", re: /\bas\s+LogSafe\b/ },
  {
    name: "logger event",
    re: LOGGER_EVENT_ARG,
    hint:
      "ロガの第 1 引数（event）は素の文字列リテラルだけです（ADR 0012 D1）。" +
      "値を出したいときは fields 側へ相関 ID・語彙定数・真偽値で渡してください",
  },
];

/**
 * ブロックコメントを閉じたあとに空白以外の内容が続くか。
 *
 * `*\/` はブロックコメントを**閉じる**ので、その後ろに書かれたものは
 * コメントではなく**実行されるコード**である（`**\/` も同じく閉じる）。
 * よって `*` 始まりの行であっても、この形の行は読み飛ばしてはならない。
 */
const CLOSES_THEN_CODE = /\*\/\s*\S/;

/**
 * 行を読み飛ばしてよいコメント行かどうか（インデントは無視）。
 *
 * 読み飛ばす条件は 2 つだけ:
 *   1. `//` で始まる行。行末までコメントなので、書かれた内容は実行されない。
 *   2. `*` で始まり、かつその行でブロックコメントを閉じたあとに内容が続かない行。
 *      JSDoc / ブロックコメントの継続行（` * 本文`）と閉じ行（` *\/`）が該当する。
 *
 * `*\/ 実コード` のように閉じたあとにコードが続く行は**読み飛ばさない**。
 * 見た目が `*` 始まりでも、`*\/` の後ろは実行されるコードだからである。
 */
function isCommentLine(line) {
  const t = line.trimStart();
  if (t.startsWith("//")) return true;
  if (!t.startsWith("*")) return false;
  return !CLOSES_THEN_CODE.test(t);
}

/**
 * 1 ファイル分の違反行を返す（純粋）。
 * 戻り値: `[{ file, line, kind, hint }]`
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
 * ケースが偽陽性として残る（下記）。**この検査の目的（資格情報がログへ出ない
 * ことを機械的に見張る）にとって、非局所的で予測不能な検出漏れの方が、局所的で
 * 説明可能な偽陽性よりはるかに悪いと判断した。** 偽陽性が実際に邪魔になるなら、
 * そのときは行の書き方（コメントの文言を変える等）か ALLOWED_FILES・マーカーで
 * 個別に対処する。
 *
 * **検出対象は「実行されるコード」だけである。** 実行されないものを拾わないのは
 * 見落としではなく、この検査の定義そのものである。
 *   - `//` で始まる行に書かれた `console.log(x)` はコメントであり、実行されない。
 *     よって検出しない。
 *   - テンプレートリテラルや複数行文字列の中身は**文字列データであってコードでは
 *     ない**。そこに `console.log(x)` と書かれていても `console` は呼ばれない。
 *     行が `//` や `*` で始まるために読み飛ばされるが、これは正しい結果である。
 *     （かつてこれを「既知の偽陰性」と記録していたが、誤りだったので訂正した。
 *      穴だと思って精密な字句解析を持ち込むと、撤去したはずの状態機械が戻る。）
 *   - 逆に `*\/` はブロックコメントを**閉じる**ので、その後ろは実行されるコード
 *     である。`*` 始まりでも読み飛ばさない（`isCommentLine` を参照）。
 *
 * 既知の偽陽性（意図して受け入れる。すべて安全側＝余計に赤くなる向き）:
 *   - ブロックコメントの継続行が `*` で始まらない場合、コメントの地の文が
 *     禁止構文の語を含んでいると違反として拾われる。
 *   - 文字列・正規表現リテラルの中身に禁止構文の語が含まれていると、そのまま
 *     違反として拾われる。
 *
 * 許可マーカーの検出も同じ生のテキストに対して行う。
 */
export function findViolations(relPath, source) {
  const allowed = ALLOWED_FILES.includes(relPath);
  const out = [];
  source.split("\n").forEach((text, i) => {
    if (isCommentLine(text)) return;
    for (const { name, re, hint } of FORBIDDEN) {
      if (!re.test(text)) continue;
      if (allowed && text.includes(ALLOW_MARKER)) continue;
      out.push({
        file: relPath,
        line: i + 1,
        kind: name,
        hint: hint ?? `直接の ${name} は使えません（ADR 0012 D1）`,
      });
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

/**
 * ディレクトリ配下の .ts を読む（`dist` と `node_modules` は除外）。
 *
 * **実在しないディレクトリを渡してはならない。** かつてここには
 * `if (!fs.existsSync(abs)) return result;` があり、走査対象を失った状態を
 * 静かに「0 件読めた」に変換していた（#158 が塞いだ穴の実行部）。実在確認は
 * `main()` が走査の前に済ませるため、ここで実在しないディレクトリを受け取ったら
 * 例外で落ちるのが正しい（黙って空を返すより、うるさく落ちるほうが安全）。
 */
function readTsFiles(rootDir) {
  const result = new Map();
  const abs = path.join(REPO_ROOT, rootDir);
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

/**
 * 走査対象ディレクトリにある `.tsx` の件数を数える（走査はしない）。
 *
 * **見ていないものを黙っていない**ための出力（#135 D7）。射程を `.ts` に
 * 据え置く判断そのものは別 Issue で行う。
 */
function countSkippedTsx(scanDirs) {
  let n = 0;
  for (const dir of scanDirs) {
    const abs = path.join(REPO_ROOT, dir);
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === "dist") continue;
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith(".tsx")) n++;
      }
    };
    walk(abs);
  }
  return n;
}

function main() {
  // 走査対象の宣言が workspace の実体とずれていないかを最初に見る（#135 経路⑪）。
  const packages = listWorkspacePackages(REPO_ROOT);
  const declared = [...SCANNED_PACKAGES, ...EXCLUDED_PACKAGES.map((e) => e.pkg)];
  const drift = diffTargets(declared, packages);

  // 宣言から導出した走査ディレクトリ（上の SCAN_DIRS）が実在するかを見る（#158・E1）。
  // **この行に導出のテンプレート文字列を書いてはならない。** 破壊検証は導出の行を
  // 文字列置換で壊し、置換後に残存数が 0 であることを確かめる。コメントに同じ
  // リテラルがあると「壊せていません」で落ちる（#135 で 1 度踏んでいる）。
  // **全単射照合はパッケージ名しか見ない。** 宣言したパッケージの src/ が改名・消失
  // しても照合は通り、走査だけが静かに空になる。#72 のパッケージ移設で踏む経路。
  const missingDirs = findMissingPaths(REPO_ROOT, SCAN_DIRS);

  // **走査対象はここで 1 回だけ確定させる**（ADR-0014 決定 9）。走査量の算出も
  // 実走査もこの `scanDirs` から導出する。実在しないものを除いた集合なので、
  // 出力する走査量は「宣言の行数」ではなく**実際に走査した対象**の件数になる。
  const scanDirs = SCAN_DIRS.filter((dir) => !missingDirs.includes(dir));
  const scanned = new Map();
  for (const dir of scanDirs) {
    for (const [k, v] of readTsFiles(dir)) scanned.set(k, v);
  }
  const summary = `${scanDirs.length} パッケージ / ${scanned.size} ファイル`;

  // 宣言のずれ（両方向）と導出先の不在は、どちらも計測器の故障なので同じ形で出す。
  if (hasTargetDrift(drift) || missingDirs.length > 0) {
    const merged = {
      missing: [...drift.missing, ...missingDirs].sort(),
      unexpected: drift.unexpected,
    };
    console.error(formatTargetDiff("audit-log-hygiene", merged, summary));
    process.exit(1);
  }

  // 走査量と未走査 .tsx の件数は、成否によらず必ず出す（#135 D5・E7）。
  // 違反が出ているときこそ「何を見ていないか」が要る（分岐の前にまとめる）。
  console.log(`[audit-log-hygiene] 走査対象: ${summary}`);
  console.log(
    `  走査していない .tsx: ${countSkippedTsx(scanDirs)} 件` +
      "（ブラウザの console が ADR 0012 D1 の射程に入るかは別 Issue で判断する）",
  );

  // 走査量のどの内訳も 0 件でないことを見る（ADR-0014 決定 8）。
  //
  // 全パッケージを理由つき除外へ移す経路では、パッケージ側の内訳が 0 件になる。
  // `findMissingRequired` は REQUIRED_FILES が走査結果に無ければ結果的に検知するが、
  // それは副次効果であり明示的な保証ではない。ここで明示的に塞ぐ。
  //
  // **ガードの形は audit-structure.mjs と同じだが、置き場所は意図的に違う。**
  // あちらは全単射照合より前に置かれているが、実走査（`loadScanTargets`）より後で
  // ある（「走査前に判る」のは半分だけ正しい）。こちらは走査と走査量の出力より後。
  // どちらも「赤の直前に根拠の行が出ている」ことを優先した結果。
  //
  // ここで数えている「パッケージ」は実在確認を通った `scanDirs` の件数であり、
  // 宣言の行数（`SCANNED_PACKAGES.length`）ではない（ADR-0014 決定 8・決定 9）。
  // 以前は `SCAN_DIRS.length` を数えていたため、導出先が実在しなくても件数が
  // 減らず「9 パッケージ走査した」と出したまま緑になった（#158 で塞いだ）。
  const emptyDimensions = findEmptyScanDimensions([
    { label: "パッケージ", count: scanDirs.length },
    { label: "ファイル", count: scanned.size },
  ]);
  if (emptyDimensions.length > 0) {
    console.error(
      `[audit-log-hygiene] 走査対象が 0 件です（検査が空振りします）: ${emptyDimensions.join(" / ")}`,
    );
    process.exit(1);
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
      problems.push(`${v.file}:${v.line} ${v.hint}`);
    }
  }

  if (problems.length > 0) {
    for (const p of problems) console.error(p);
    console.error(`\n${problems.length} 件の問題があります`);
    process.exit(1);
  }
  console.log("ログ衛生 OK");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
