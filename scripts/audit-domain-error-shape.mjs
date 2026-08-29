#!/usr/bin/env node
/**
 * ドメインエラー型の形を見る検査（`docs/adr/0016` 決定 2 項目 3 が #72 E2 へ割り当てた機械検査）。
 *
 * ADR-0016 決定 2 項目 3 は「エラー値は**判別子と機械可読な詳細だけ**を持ち、表示文言は
 * 別モジュール（`error-messages.ts`）が担う」と定めている。この検査はその規範のうち
 * **機械で見える部分**、すなわち**ドメインエラー型の宣言に `message` フィールドが現れない**
 * ことだけを見る。ADR-0016 の逐語（`docs/adr/0016-core-domain-representation.md`）:
 *
 * > 項目 3 の検査は E2 が置く（`packages/poker-core` のドメインエラー型（`RoundError`
 * > `RoomError`）に `message` フィールドが 0 件。WS プロトコルの `ProtocolError` や
 * > `ServerMessage` の `message` は対象外）。
 *
 * 型システムはこれを守り切らない。`RoundError` の**合併の一部メンバーへ任意フィールドとして**
 * `message?:` を足すと、既存の構築箇所はどのメンバーにも適合するのでコンパイルは通り、
 * 文言関数は `code` しか見ないので既存テストも緑のままである（本 PR の破壊検証で確認済み）。
 * 全メンバーへ必須フィールドとして足した場合は構築箇所で型検査が落ちる。
 * **通ってしまう書き方がある**以上、機械検査が要る。
 *
 * ## 何を見るか
 *
 * 宣言した組（{@link DOMAIN_ERROR_TARGETS}）ごとに、次を見る。
 *
 *   1. 宣言したファイルが実在する
 *   2. そのファイルに `export type <名前>` / `export interface <名前>` の宣言が実在する
 *      （改名・削除で検査が静かに空振りするのを防ぐ）
 *   3. その**宣言の範囲**（下記「範囲の決め方」）に禁止フィールド（{@link FORBIDDEN_FIELDS}）が
 *      現れない
 *
 * ## 何を見ていないか — **「足りる」とは言わない**
 *
 * - **対象は宣言した型だけである。** 走査するのは {@link DOMAIN_ERROR_TARGETS} が名指しした
 *   ファイルと型に限られる。**WS プロトコルの `ProtocolError`（`packages/poker-core/src/protocol.ts`）や
 *   `ServerMessage` は宣言に入れていないので、一切読まない。** これらは `message` を
 *   正しく持っており、巻き込めば誤検出になる（ADR-0016 の逐語がそう限定している）。
 *   `packages/poker-core/src/error-messages.ts`（文言生成関数）も同じ理由で対象外である。
 * - **文言が実際にどこで作られているか**は見ていない。「エラー型が文言を持たない」ことしか
 *   見ないので、たとえばハンドラが `code` を無視して即席の文字列を組み立てても緑になる。
 *   そちらは文言の特性テスト（`apps/poker-sync/tests/error-messages.characterization.test.ts`）の領分である。
 * - **型の外に置いた文言**（`error-messages.ts` の `switch`）は規範どおりなので、当然見ない。
 * - **`export` の有無は見ていない。** 非公開の宣言も同じ規範に服する（ADR-0016 決定 2 項目 3 は
 *   公開かどうかを条件にしていない）。その代わり、**同名の宣言がファイル内に複数ある場合は
 *   最初に現れたものだけ**を読む。走査対象はファイルと型名で明示宣言しているため、
 *   同名の別宣言を作らない限り問題にならない。
 *
 * ## 範囲の決め方 — **宣言の 1 個ぶんだけを読む**
 *
 * 型宣言の開始行から、次の規則で終端行まで（両端を含む）を範囲とする。
 * 中括弧の深さ（`{` と `}` の個数の差の累計）だけを持つ。
 *
 * - `interface` 始まり: **深さが 0 に戻り、かつその行に `}` を含む**最初の行で終える。
 * - `type` 始まり: **深さが 0 で、かつ行の末尾が `;`** である最初の行で終える。
 *
 * 分けているのは、この 2 つを 1 つの規則にまとめると実物で壊れるからである。
 * 「深さ 0 かつ末尾が `}`」で終えると `RoundError` の合併型が 1 メンバー目で切れる
 * （`  | { code: 'not-host'; op: ... }` が終端に見える）。実物 4 形すべてで確かめた:
 * 1 行の `type`（`RoomError`）、複数行の合併 `type`（`RoundError`）、
 * 複数行の `interface`（timer-core の 9 個）、名前の合併 `type`（timer-core の `DomainError`）。
 *
 * 終端が見つからないまま EOF に達したら**問題として報告する**（黙って全文を読まない）。
 *
 * ## 禁止フィールドの見つけ方 — **行に名前が現れる書き方だけを拾う**
 *
 * {@link fieldRegExp} が返す正規表現は `message:` `message?:` `'message':` `"message":` を拾う。
 * **「`message` フィールドをすべて拾う」とも「この 4 形だけを拾う」とも言えない。**
 * 語境界で見るので `'send-message': ...` のようなハイフン付きキーにも当たる（過剰検出＝安全側）。
 * 拾えないと分かっているもの:
 *
 * - **計算キー**（`[FIELD_NAME]: string` のように変数経由で書いたもの）。名前が行に現れない。
 * - **複数形・別名・複合語**（`messages` `msg` `errorMessage` など）。`\bmessage\b` は
 *   前後に語構成文字が続くと一致しない（`messages` は `s` が、`errorMessage` は `r` が
 *   語境界を潰す。2026-08-18 にプローブで両方とも不一致になることを確認）。
 *   ADR-0016 の逐語が名指ししているのは `message` なので、それに合わせている。
 * - **別ファイルに置いた型を合併しただけの場合**。合併先の型を宣言に足さない限り読まない
 *   （だから timer-core は合併の `DomainError` ではなく**メンバーの 9 個を個別に宣言**している）。
 *
 * ## コメント行の扱い — **読み飛ばさない**
 *
 * これは「**無いこと**」を求める検査なので、読み飛ばすと緑に倒れる。
 * `audit-assembly-wiring.mjs` の `FORBIDDEN_IN_ENTRY` と同じ向きに倒し、
 * **範囲内のコメント行も読む**。宣言の中に `message:` と書いたコメントを置くと赤くなる。
 * **「範囲内にコメントは無い」ではない** — 対象 12 型の範囲を全件書き出して数えたところ、
 * `packages/timer-core/src/errors.ts:60`（`InputLimitExceeded` の `field` に付いた
 * `/** どの入力か（例: "requirements"） *\/`）の 1 行が範囲内にある（2026-08-18 実測）。
 * その 1 行は `message:` を含まないので緑のままである。
 * 宣言の**手前**にある doc コメントは範囲外（範囲は `export` の行から始まる）。
 *
 * ## 既知の限界（意図して受け入れる）
 *
 * **緑になる向き**（見落とす側）: 上記「拾えないと分かっているもの」の 3 形。
 * **赤になる向き**（余計に落ちる側。安全なので放置する）: 範囲内のコメント・文字列リテラルに
 * `message:` と書いた場合。
 *
 * これらを塞ぐには TypeScript の構文解析器が要る（追加依存は禁止）。対象は 12 個の短い型宣言で、
 * どれもレビューで目に入る。**精緻にすると「賢い検査ほど穴が増える」を踏む**と判断し、踏み込まない。
 *
 * 設計方針: 判定は純粋関数（{@link findDomainErrorProblems} / {@link findDeclarationSpan}）にし、
 * 実ファイル I/O は `main()` とその読み込みヘルパ（`readDeclaredSources`）だけに閉じる。
 * 追加依存は禁止のため Node 標準の fs / path のみを使う。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasZeroScanTargets } from "./lib/scan-targets.mjs";
import { isDirectRun } from "./lib/direct-run.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

/**
 * 検査するドメインエラー型。**core パッケージは両方ここに並べる。**
 *
 * poker-core だけを見る形にしない。片方だけ見る検査は、もう片方が壊れても緑のままになる
 * （#135 が繰り返し踏んだ「走査対象がハードコードで片側だけ」の形）。ADR-0016 決定 2 は
 * poker / timer の**両方**に同じ規範を課しており、項目 3 の表で timer は「準拠」と
 * 記録されている。準拠している側を宣言に入れておけば、後から崩れたときに落ちる。
 *
 * timer-core は合併の `DomainError` ではなく**メンバーの 9 interface を個別に**並べる。
 * 合併の別名だけを見てもフィールドは 1 つも読めない（名前が並んでいるだけ）。
 * 実在しない型・ファイルを宣言したら `findDomainErrorProblems` が赤にする。
 */
export const DOMAIN_ERROR_TARGETS = [
  // poker-core（ADR-0016 決定 2 項目 3 が名指しした 2 型）
  { file: "packages/poker-core/src/round.ts", type: "RoundError" },
  { file: "packages/poker-core/src/room.ts", type: "RoomError" },
  // timer-core（`DomainError` の合併メンバー。フィールドを持つのはこちら）
  { file: "packages/timer-core/src/errors.ts", type: "EmptyName" },
  { file: "packages/timer-core/src/errors.ts", type: "DuplicateName" },
  { file: "packages/timer-core/src/errors.ts", type: "MemberLimitExceeded" },
  { file: "packages/timer-core/src/errors.ts", type: "BelowMinMembers" },
  { file: "packages/timer-core/src/errors.ts", type: "Unauthorized" },
  { file: "packages/timer-core/src/errors.ts", type: "PhaseConflict" },
  { file: "packages/timer-core/src/errors.ts", type: "InvalidInterval" },
  { file: "packages/timer-core/src/errors.ts", type: "InvalidIndex" },
  { file: "packages/timer-core/src/errors.ts", type: "InputLimitExceeded" },
  { file: "packages/timer-core/src/errors.ts", type: "DomainError" },
];

/**
 * ドメインエラー型の宣言に現れてはならないフィールド。
 *
 * 表示文言をエラー値に持たせた証拠になる（ADR-0016 決定 2 項目 3）。
 */
export const FORBIDDEN_FIELDS = ["message"];

/** `message:` `message?:` `'message':` `"message":` の 4 形を拾う（それ以外は拾えない）。 */
function fieldRegExp(name) {
  return new RegExp(`["']?\\b${name}\\b["']?\\s*\\??\\s*:`);
}

/**
 * ソースから型宣言 1 個ぶんの範囲を切り出す（純粋）。
 *
 * @param source ファイル全文
 * @param typeName 型の名前
 * @returns `{ startLine, endLine, lines }`（1 始まりの行番号）。宣言が無ければ `null`、
 *   宣言はあるが終端に達しなければ `{ startLine, endLine: null, lines }`。
 */
export function findDeclarationSpan(source, typeName) {
  const lines = source.split("\n");
  // `export` は任意にする。ADR-0016 決定 2 項目 3 は「ドメインエラーは判別子と機械可読な
  // 詳細のみを持つ」と定めており、**公開されているかどうかを条件にしていない**。
  // #168 Task 1 で timer-core の合併メンバーが非公開になったとき、`export` 必須の
  // 正規表現では「宣言が見つかりません」に落ちて検査が空振りした（実測）。
  const startRe = new RegExp(`^\\s*(?:export\\s+)?(type|interface)\\s+${typeName}\\b`);

  let start = -1;
  let kind = null;
  for (let i = 0; i < lines.length; i++) {
    const m = startRe.exec(lines[i] ?? "");
    if (m) {
      start = i;
      kind = m[1];
      break;
    }
  }
  if (start < 0) return null;

  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;
    depth += opens - closes;

    const ended =
      kind === "interface"
        ? depth === 0 && closes > 0
        : depth === 0 && line.trimEnd().endsWith(";");
    if (ended) {
      return { startLine: start + 1, endLine: i + 1, lines: lines.slice(start, i + 1) };
    }
  }
  return { startLine: start + 1, endLine: null, lines: lines.slice(start) };
}

/**
 * 1 組ぶんの問題を返す（純粋）。問題が無ければ空配列。
 *
 * @param target `{ file, type }`
 * @param sources `Map<相対パス, ソース>`。**実在しないファイルはキーを持たせない。**
 *   （`undefined` を「読めなかった」ではなく「存在しない」として扱う）
 */
export function findDomainErrorProblems(target, sources) {
  const { file, type } = target;
  const source = sources.get(file);
  if (source === undefined) {
    return [`宣言にあるが実在しない: ${file}（ADR-0016 決定 2 項目 3）`];
  }

  const span = findDeclarationSpan(source, type);
  if (span === null) {
    return [
      `${file} に ${type} の型宣言が見つかりません（改名・削除で検査が空振りします。ADR-0016 決定 2 項目 3）`,
    ];
  }
  if (span.endLine === null) {
    return [
      `${file}:${span.startLine} ${type} の宣言の終端が見つかりません（検査の範囲を決められません）`,
    ];
  }

  const problems = [];
  for (const name of FORBIDDEN_FIELDS) {
    const re = fieldRegExp(name);
    span.lines.forEach((line, offset) => {
      if (re.test(line)) {
        problems.push(
          `${file}:${span.startLine + offset} ドメインエラー型 ${type} に ${name} フィールドがあります。` +
            `文言は error-messages.ts が持ちます（ADR-0016 決定 2 項目 3）`,
        );
      }
    });
  }
  return problems;
}

/** 宣言した全ファイルを読む（実在しないものはキーを作らない）。 */
function readDeclaredSources(targets) {
  const sources = new Map();
  for (const t of targets) {
    if (sources.has(t.file)) continue;
    const abs = path.join(REPO_ROOT, t.file);
    if (fs.existsSync(abs)) sources.set(t.file, fs.readFileSync(abs, "utf8"));
  }
  return sources;
}

function main() {
  // 走査対象が 0 件なら赤（ADR-0014 決定 8。判定は共有モジュールへ寄せる）。
  // 宣言を空にして緑にする経路を最初に塞ぐ。
  //
  // **ここで宣言の件数を渡してよい理由**: 宣言の各要素が指すファイルと型の実在は
  // `findDomainErrorProblems` が 1 組ずつ見て、無ければ赤にする。「宣言の行数は減らないのに
  // 走査だけ静かに空になる」経路が別に塞がれているので、ここは宣言そのものが
  // 空になる経路だけを見ればよい。
  if (hasZeroScanTargets(DOMAIN_ERROR_TARGETS.length)) {
    console.error("[audit-domain-error-shape] 検査する型が 0 件です（検査が空振りします）");
    process.exit(1);
  }

  const sources = readDeclaredSources(DOMAIN_ERROR_TARGETS);
  // 走査量は成否によらず必ず出す（#135 D5）。何を見たかが赤の根拠になる。
  console.log(
    `[audit-domain-error-shape] 走査対象: ${DOMAIN_ERROR_TARGETS.length} 型 / ${sources.size} ファイル`,
  );

  const problems = DOMAIN_ERROR_TARGETS.flatMap((t) => findDomainErrorProblems(t, sources));
  if (problems.length > 0) {
    for (const p of problems) console.error(p);
    console.error(`\n${problems.length} 件の問題があります`);
    process.exit(1);
  }
  console.log("ドメインエラー型の形 OK");
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
