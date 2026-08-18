#!/usr/bin/env node
/**
 * ドメインが環境から直接値を読んでいないかを見る検査
 * （`docs/adr/0016` 決定 2 項目 4 が #72 E3 へ割り当てた機械検査）。
 *
 * ## 何を見るか
 *
 * 宣言したドメインパッケージ（{@link DOMAIN_PACKAGES}）の `src/` 配下の `.ts` に、
 * {@link FORBIDDEN} の語が**字面として 1 つも現れない**ことだけを見る。
 *
 * ## 何を見ていないか — **「足りる」とは言わない**
 *
 * - **計算プロパティ・別名束縛はすり抜ける。** `globalThis["Date"].now()`、
 *   `const D = Date; D.now()`、`const { now } = Date; now()` はいずれも
 *   禁止語彙の字面を持たない。この検査は純粋性を見ていないので
 *   `audit-domain-purity` とは名乗らない。
 * - **宣言したパッケージの外は一切見ない。** `apps/` と `packages/rate-limit` ・
 *   `packages/ui` ・ `packages/protocol` は対象外（下の除外理由を参照）。
 * - **`test/` は見ない。** ドメインのテストが実時刻を読むのは禁じられていない。
 * - **ビルド生成物は見ない。** ただし現状これは**走査根の効果**であって、除外行の効果ではない。
 *   走査根は各パッケージの `src` であり、`dist` と `node_modules` はその**兄弟**なので
 *   最初から到達しない。`readTsFiles` にある両者の除外行は、走査根を `src` の外へ広げた
 *   ときのための防御であって、現状の走査量には影響しない（除外行の有無で走査量は同一。
 *   レビュアーが除外行を削ったコピーとの対照実行で実測）。
 *
 * ## コメント行の扱い — **読み飛ばさない**
 *
 * これは「**無いこと**」を求める検査なので、読み飛ばすと緑に倒れる。
 * `audit-domain-error-shape.mjs` と `audit-assembly-wiring.mjs` の `FORBIDDEN_IN_ENTRY` と
 * 同じ向きに倒す。コメントを剥がすには手書きの字句解析が要り、文字列リテラル中の
 * `//`・正規表現リテラル・入れ子のブロックコメントで穴が出る。
 * **穴はそのまま見逃し（緑）になる。**
 *
 * 代償として、宣言したパッケージの docstring に禁止語彙を書けない
 * （「現在時刻」「実時刻」と書く）。**この代償は既に実物で発生している** —
 * `packages/timer-core/src/problem.ts` の `pickFallback` の docstring は
 * `docs/timer/adr/0002` を逐語で引用しており、引用の中に禁止語彙の字面がある。
 * ブリーフは「2026-08-18 時点で該当は 0 件」と書いていたが、実測では 1 件ある
 * （#166 Task 4 が同日に足した行）。射程を狭めて緑にするのではなく、
 * 引用側の言い換えで解消する（規範の側を弱めない）。
 *
 * 設計方針: 判定は純粋関数（{@link findForbiddenCalls}）にし、実ファイル I/O と
 * `process.exit` は `main()` の薄い配線だけに置く。追加依存は禁止のため Node 標準の
 * fs / path のみを使う。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listWorkspacePackages,
  diffTargets,
  hasTargetDrift,
  findMissingPaths,
  findEmptyScanDimensions,
  formatTargetDiff,
} from "./lib/scan-targets.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

/**
 * 走査するドメインパッケージ。
 *
 * **`packages/` を readdir して `-core` で終わるものを拾う導出にしてはならない**
 * （`docs/adr/0014` 決定 3 の MUST NOT。pnpm の解決規則の自作再実装にあたる）。
 * サフィックス導出は `packages/timer-domain` のような名前のコアを黙って取りこぼすが、
 * 宣言＋全単射照合はパッケージが増えた時点で赤くなり、書いた人に判断を強制する。
 */
export const DOMAIN_PACKAGES = ["packages/poker-core", "packages/timer-core"];

/** 走査から外すパッケージ。**理由が要る。** 実在しなくなったら落ちる（ADR-0014 決定 2）。 */
export const EXCLUDED_PACKAGES = [
  { pkg: "apps/landing", reason: "アプリ層。副作用を置いてよい境界" },
  { pkg: "apps/poker-sync", reason: "アプリ層。時刻は MonotonicClock ポートのアダプタが読む" },
  { pkg: "apps/poker-web", reason: "アプリ層。副作用を置いてよい境界" },
  { pkg: "apps/timer-sync", reason: "アプリ層。時刻は Clock ポートのアダプタが読む" },
  { pkg: "apps/timer-web", reason: "アプリ層。NoAiProvider は ProblemProvider ポートのアダプタ" },
  { pkg: "e2e", reason: "テストコード。ドメインではない" },
  { pkg: "packages/protocol", reason: "WS メッセージの型定義のみ。ドメインの判断を持たない" },
  {
    pkg: "packages/rate-limit",
    reason:
      "node 専用の共有ユーティリティ。docs/guides/architecture.md の層対応表でドメインと別の行に置かれている",
  },
  { pkg: "packages/ui", reason: "CSS トークンと書体のみ。TS を 1 つも持たない" },
];

/**
 * 実際に走査するディレクトリ。**宣言（パッケージ名）から機械的に導出する。**
 *
 * 導出先の実在は `main()` で `findMissingPaths` により検査する（#158・ADR-0014 決定 1）。
 * 全単射照合はパッケージ名しか見ないため、ここで導出した先が改名・消失しても
 * 照合は通ってしまう。
 */
const SCAN_DIRS = DOMAIN_PACKAGES.map((pkg) => `${pkg}/src`);

/**
 * 禁止語彙。**ADR-0016 決定 2 項目 4 の逐語（`Date.now()` / `Math.random()`）より広い。**
 *
 * 2 語だけにすると `new Date().getTime()` や `crypto.randomUUID()` がすり抜け、
 * 対策が自分の塞ぐ欠陥と同じ欠陥を持つことになる。射程を広げたぶんは
 * `docs/adr/0016` 決定 2 項目 4 への追記と**対で意味を持つ**（追記は同じ PR の別タスクが入れる）。
 *
 * **規範側が逐語 2 語のままである間、この検査は規範より広く網を張っている。**
 * 広い側＝安全側なので、そのこと自体は問題ない。狭めるときは**規範を先に直すこと** —
 * 検査だけを狭めるのは「赤を消す最短経路」であり、`scripts/audit-domain-side-effects.test.mjs`
 * の `REQUIRED_FORBIDDEN` がそれを赤にする。
 *
 * `new Date(` は引数の有無で分けない（分けると字句解析が要る）。過剰検出側へ倒す。
 */
export const FORBIDDEN = [
  "Date.now(",
  "Math.random(",
  "new Date(",
  "performance.now(",
  "crypto.",
  "process.env",
];

/**
 * 本文から禁止語彙の出現を拾う。**状態を持たない純粋関数。**
 *
 * 各行は他の行と無関係に、独立に判定する。コメント行も読む
 * （このファイル冒頭の「コメント行の扱い」を参照）。
 *
 * @param {string} text ファイル本文
 * @param {string} filePath 報告に使うリポジトリ相対パス
 * @returns {Array<{ path: string, line: number, token: string }>} 行番号は 1 始まり
 */
export function findForbiddenCalls(text, filePath) {
  const found = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const token of FORBIDDEN) {
      if (lines[i].includes(token)) {
        found.push({ path: filePath, line: i + 1, token });
      }
    }
  }
  return found;
}

/**
 * ディレクトリ配下の `.ts` を再帰的に集める。戻り値はリポジトリ相対パス → 本文の Map。
 *
 * `dist` と `node_modules` を読み飛ばすが、**現状この行は一度も効かない。**
 * 呼び出し元が渡す走査根は各パッケージの `src` で、どちらもその兄弟だからである。
 * 将来 `src` の外へ走査根を広げたときのための防御として置いてあり、今の走査量は
 * この行の有無で変わらない。**「効いている」と書かないこと** — 除外が無い仮説でも
 * 同じ観測になるので、走査量が安定していることは除外行の証拠にならない。
 *
 * **実在しないディレクトリを渡してはならない。** ここに `fs.existsSync` の
 * 早期 return を置くと、走査対象を失った状態を静かに「0 件読めた」に変換してしまう
 * （#158 が `audit-log-hygiene.mjs` から取り除いた穴と同じ形）。実在確認は `main()` が
 * 走査の前に済ませるため、実在しないディレクトリを受け取ったら例外で落ちるのが正しい。
 *
 * `.d.ts` は**除外しない**。この検査は「無いこと」を求めるので、射程を狭める向きの
 * 例外を置かない（`audit-log-hygiene.mjs` は `.d.ts` を外しているが、あちらは
 * 「ログの出口」という実行される経路を見る検査であり、向きが逆である）。
 */
function readTsFiles(relDir) {
  const collected = new Map();
  const walk = (abs) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      // 走査根が src の間は到達しない防御（上の docstring を参照）。
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const child = path.join(abs, entry.name);
      if (entry.isDirectory()) {
        walk(child);
      } else if (entry.name.endsWith(".ts")) {
        const rel = path.relative(REPO_ROOT, child).split(path.sep).join("/");
        collected.set(rel, fs.readFileSync(child, "utf8"));
      }
    }
  };
  walk(path.join(REPO_ROOT, relDir));
  return collected;
}

function main() {
  // 宣言が workspace の実体とずれていないかを最初に見る（ADR-0014 決定 1）。
  const packages = listWorkspacePackages(REPO_ROOT);
  const declared = [...DOMAIN_PACKAGES, ...EXCLUDED_PACKAGES.map((e) => e.pkg)];
  const drift = diffTargets(declared, packages);

  // 宣言から導出した走査ディレクトリ（上の SCAN_DIRS）が実在するかを見る（#158・決定 1）。
  // **この行に導出のテンプレート文字列を書いてはならない。** 破壊検証は導出の行を
  // 文字列置換で壊し、置換後に残存数が 0 であることを確かめる。コメントに同じ
  // リテラルがあると「壊せていません」で落ちる（#135 で 1 度踏んでいる）。
  // **全単射照合はパッケージ名しか見ない。** 宣言したパッケージの導出先が改名・消失
  // しても照合は通り、走査だけが静かに空になる。
  const missingDirs = findMissingPaths(REPO_ROOT, SCAN_DIRS);

  // **走査対象はここで 1 回だけ確定させる**（ADR-0014 決定 9）。走査量の算出も
  // 実走査もこの `scanDirs` から導出し、書き分けない。実在しないものを除いた集合なので、
  // 出力する走査量は「宣言の行数」ではなく**実際に走査した対象**の件数になる。
  const scanDirs = SCAN_DIRS.filter((dir) => !missingDirs.includes(dir));
  const scanned = new Map();
  for (const dir of scanDirs) {
    for (const [rel, text] of readTsFiles(dir)) scanned.set(rel, text);
  }
  const summary = `${scanDirs.length} パッケージ / ${scanned.size} ファイル`;

  // 宣言のずれ（両方向）と導出先の不在は、どちらも計測器の故障なので同じ形で出す。
  if (hasTargetDrift(drift) || missingDirs.length > 0) {
    const merged = {
      missing: [...drift.missing, ...missingDirs].sort(),
      unexpected: drift.unexpected,
    };
    console.error(formatTargetDiff("audit-domain-side-effects", merged, summary));
    process.exit(1);
  }

  // 走査量は成否によらず必ず出す（ADR-0014 決定 6）。何を見たかが赤の根拠になる。
  console.log(`[audit-domain-side-effects] 走査対象: ${summary}`);

  // 走査量のどの内訳も 0 件でないことを見る（ADR-0014 決定 8）。
  // 数えるのは宣言の行数ではなく、実在確認を通った走査対象そのもの（決定 8・決定 9）。
  // 全パッケージを理由つき除外へ移せば全単射照合は素通りし、走査 0 件のまま
  // 「OK」を出せてしまう経路をここで塞ぐ。
  const emptyDimensions = findEmptyScanDimensions([
    { label: "パッケージ", count: scanDirs.length },
    { label: "ファイル", count: scanned.size },
  ]);
  if (emptyDimensions.length > 0) {
    console.error(
      `[audit-domain-side-effects] 走査対象が 0 件です（${emptyDimensions.join(" / ")}）。検査が空振りしています`,
    );
    process.exit(1);
  }

  const problems = [];
  for (const [rel, text] of scanned) {
    problems.push(...findForbiddenCalls(text, rel));
  }

  if (problems.length > 0) {
    console.error(
      `[audit-domain-side-effects] ドメイン内で環境から直接値を読んでいます（${problems.length} 件）`,
    );
    for (const p of problems) {
      console.error(`  ${p.path}:${p.line}  ${p.token}`);
    }
    console.error(
      "  時刻・乱数・環境変数は引数で注入し、読み取りはアダプタ（境界）に置いてください",
    );
    console.error("  根拠: 憲法 原則 VI / docs/adr/0016 決定 2 項目 4 / docs/timer/adr/0002");
    process.exit(1);
  }

  console.log("[audit-domain-side-effects] OK（禁止語彙 0 件）");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
