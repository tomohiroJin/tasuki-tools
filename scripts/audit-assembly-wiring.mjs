#!/usr/bin/env node
/**
 * 組み立ての集約を見る検査（`docs/adr/0004` 決定 4・#165 の E1 が E2 へ割り当てた機械検査）。
 *
 * ADR-0004 決定 4 は「サーバーの組み立て（アダプタの生成・相互配線）は
 * `create-sync-server.ts` のような **1 つの関数に集約する（MUST）**。本番の
 * エントリポイント（`server.ts`）とテストの両方が、この関数を経由して組み立てる」と
 * 定めている。この検査はその MUST のうち**機械で見える部分**を見る。
 *
 * ## 何を見るか（4 つ）
 *
 * 宣言した組（`ASSEMBLY_TARGETS`）ごとに、次を見る。
 *
 *   1. 組み立て関数のファイル（`create-sync-server.ts`）が実在する
 *   2. エントリ（`server.ts`）が実在する
 *   3. エントリが組み立て関数を **import して呼んでいる**
 *   4. エントリに `Bun.serve` が現れない（組み立てが集約されている証拠）
 *
 * ## 何を見ていないか — **「足りる」とは言わない**
 *
 * - **テスト側が経由すること**は直接見ていない。poker-sync の既存テストは
 *   `tests/helpers.ts` が `bun run src/server.ts` でサブプロセス起動する形なので、
 *   **エントリの経由を検査すれば、それらのテストも同じ経路を通る**（起動する対象が
 *   同じ `src/server.ts` だからである）。in-process で組み立てる別経路のテスト
 *   （`tests/create-sync-server.substitution.test.ts` の系統）まで機械で縛ってはいない。
 * - **組み立ての中身**（どのアダプタをどう配線したか）は見ていない。それは
 *   差し替えテスト（`docs/adr/0007` の追記が定める MUST）の領分である。
 * - 3 は「import 文にファイル名が出る」「関数名に `(` が続く」という**行単位の見方**で
 *   判定する。行をまたぐ状態は持たない（`audit-log-hygiene.mjs` と同じ方針。手書きの
 *   字句解析は直すたびに別の検出漏れを作った経緯がある）。
 *
 * ## コメント行の扱い — **向きによって非対称にする**
 *
 * 「あること」を求める 3 と、「無いこと」を求める 4 とでは、コメント行を読み飛ばす
 * ことの安全な向きが逆になる。どちらも**赤くなりやすい側**へ倒す。
 *
 * - **3（あること）ではコメント行を証拠に数えない。** 実際、このファイルの初版は
 *   コメントを読み飛ばさなかったため、`server.ts` の冒頭コメントにある
 *   「`createSyncServer()` が持つ」という**説明文が呼び出しの証拠として通り**、
 *   呼び出し行を実際に消しても緑のままだった（本 PR の破壊検証で発覚）。
 * - **4（無いこと）ではコメント行も読む。** エントリのコメントに `Bun.serve` と
 *   書くと赤くなる。現に両エントリのコメントには出てこない（2026-08-18 実測）。
 *
 * コメント判定は**行頭だけを見る無状態の形**に限る（`//` `*` `/*` で始まる行）。
 * 行をまたぐ字句解析は、直すたびに別の検出漏れを作った経緯がある。
 *
 * ## 既知の限界（意図して受け入れる）
 *
 * - import を複数行に折り返すと 3 の import 側を拾えない（赤くなる向き）。
 * - 文字列リテラルの中に `createSyncServer(` と書けば 3 の呼び出し側を騙せる
 *   （緑になる向き）。エントリはプロセスの起動だけを持つ短いファイル
 *   （2026-08-18 実測で poker-sync 19 行・timer-sync 70 行）で、レビューで見える範囲にある。
 *   ここを塞ぐには式レベルの解析が要り、割に合わないと判断した。
 *
 * 設計方針: 判定は純粋関数（{@link findAssemblyProblems}）にし、実ファイル I/O は
 * `main()` とその読み込みヘルパ（`readDeclaredSources`）だけに閉じる。
 * 追加依存は禁止のため Node 標準の fs / path のみを使う。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasZeroScanTargets } from "./lib/scan-targets.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

/**
 * 検査する組。**同期サーバーは全部ここに並べる。**
 *
 * poker-sync だけを見る形にしない。片方だけ見る検査は、もう片方が壊れても緑のままに
 * なる（#135 が繰り返し踏んだ「走査対象がハードコードで片側だけ」の形）。
 * 実在しない組を宣言したら `main()` が赤にする。
 */
export const ASSEMBLY_TARGETS = [
  {
    entry: "apps/poker-sync/src/server.ts",
    assembler: "apps/poker-sync/src/create-sync-server.ts",
    fn: "createSyncServer",
  },
  {
    entry: "apps/timer-sync/src/server.ts",
    assembler: "apps/timer-sync/src/create-sync-server.ts",
    fn: "createSyncServer",
  },
];

/** エントリに現れてはならない構文。組み立てがエントリに残っている証拠になる。 */
export const FORBIDDEN_IN_ENTRY = [{ name: "Bun.serve", re: /\bBun\s*\.\s*serve\b/ }];

/** 行が import 文か（インデントは無視。行単位・無状態）。 */
function isImportLine(line) {
  return /^\s*import\b/.test(line);
}

/**
 * 「あること」の証拠に数えてよい行か。**コメント行は数えない。**
 *
 * 行頭だけを見る。`//` `*` `/*` で始まる行はコメント（または JSDoc の継続行）と
 * みなす。判定を誤ったときに証拠が減る＝赤くなる向きなので、粗くてよい。
 */
export function isEvidenceLine(line) {
  const t = line.trimStart();
  return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
}

/**
 * 1 組ぶんの問題を返す（純粋）。問題が無ければ空配列。
 *
 * @param target `{ entry, assembler, fn }`
 * @param sources `Map<相対パス, ソース>`。**実在しないファイルはキーを持たせない。**
 *   （`undefined` を「読めなかった」ではなく「存在しない」として扱う）
 */
export function findAssemblyProblems(target, sources) {
  const { entry, assembler, fn } = target;
  const problems = [];

  if (!sources.has(assembler)) {
    problems.push(`組み立て関数のファイルがありません → ${assembler}（ADR-0004 決定 4）`);
  }

  const entrySource = sources.get(entry);
  if (entrySource === undefined) {
    problems.push(`エントリがありません → ${entry}（ADR-0004 決定 4）`);
    // エントリが読めない以上、以降の 3 つは判定できない。ここで返す。
    return problems;
  }

  const lines = entrySource.split("\n");
  // 組み立て関数のファイル名（拡張子なし）。import 指定子は `.js` 付き・無しの両方がある。
  const assemblerModule = path.basename(assembler).replace(/\.ts$/, "");

  const imported = lines.some(
    (l) => isEvidenceLine(l) && isImportLine(l) && l.includes(fn) && l.includes(assemblerModule),
  );
  if (!imported) {
    problems.push(
      `${entry} が ${assemblerModule} から ${fn} を import していません（ADR-0004 決定 4）`,
    );
  }

  const called = lines.some(
    (l) => isEvidenceLine(l) && !isImportLine(l) && l.includes(`${fn}(`),
  );
  if (!called) {
    problems.push(`${entry} が ${fn}() を呼んでいません（ADR-0004 決定 4）`);
  }

  for (const { name, re } of FORBIDDEN_IN_ENTRY) {
    // **ここだけはコメント行も読む。** 見落とすより余計に赤くなるほうが安全な向き。
    const hit = lines.findIndex((l) => re.test(l));
    if (hit >= 0) {
      problems.push(
        `${entry}:${hit + 1} エントリに ${name} が現れています。` +
          `組み立ては ${assemblerModule} へ集約してください（ADR-0004 決定 4）`,
      );
    }
  }

  return problems;
}

/** 宣言した全ファイルを読む（実在しないものはキーを作らない）。 */
function readDeclaredSources(targets) {
  const sources = new Map();
  for (const t of targets) {
    for (const rel of [t.entry, t.assembler]) {
      const abs = path.join(REPO_ROOT, rel);
      if (fs.existsSync(abs)) sources.set(rel, fs.readFileSync(abs, "utf8"));
    }
  }
  return sources;
}

function main() {
  // 走査対象が 0 件なら赤（ADR-0014 決定 8。判定は共有モジュールへ寄せる）。
  // 宣言を空にして緑にする経路を最初に塞ぐ。
  //
  // **ここで宣言の件数を渡してよい理由**: 宣言の各要素が指すファイルの実在は
  // `findAssemblyProblems` が 1 組ずつ見て、無ければ赤にする（破壊検証 D-4 で確認済み）。
  // 「宣言の行数は減らないのに走査だけ静かに空になる」経路が別に塞がれているので、
  // ここは宣言そのものが空になる経路だけを見ればよい。
  if (hasZeroScanTargets(ASSEMBLY_TARGETS.length)) {
    console.error("[audit-assembly-wiring] 検査する組が 0 件です（検査が空振りします）");
    process.exit(1);
  }

  const sources = readDeclaredSources(ASSEMBLY_TARGETS);
  // 走査量は成否によらず必ず出す（#135 D5）。何を見たかが赤の根拠になる。
  console.log(
    `[audit-assembly-wiring] 走査対象: ${ASSEMBLY_TARGETS.length} 組 / ${sources.size} ファイル`,
  );

  const problems = ASSEMBLY_TARGETS.flatMap((t) => findAssemblyProblems(t, sources));
  if (problems.length > 0) {
    for (const p of problems) console.error(p);
    console.error(`\n${problems.length} 件の問題があります`);
    process.exit(1);
  }
  console.log("組み立ての集約 OK");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
