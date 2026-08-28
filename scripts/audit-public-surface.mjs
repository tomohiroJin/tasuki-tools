#!/usr/bin/env node
/**
 * 公開面の検査（`docs/adr/0016` 決定 2 項目 2）。
 *
 * ADR-0016 決定 2 項目 2 は「`index.ts` は**公開記号を明示列挙**する。`export *` を使わない
 * （MUST NOT）」と定めている。この検査は、走査対象のエントリに `export *` が現れないことを見る。
 *
 * ## 走査対象の決め方 — **列挙しない**
 *
 * `packages/*-core/src/index.ts` のようなグロブや、パッケージ名の手書き列挙は使わない。
 * パッケージが増減するたびに検査側の列挙が腐り、新しいパッケージが黙って走査から漏れる
 * （#175 が CI ジョブ表に対して行ったのと同じ判断）。
 * `audit-structure.mjs` の `SCANNED_PACKAGES` から `src` と `entry` の両方を持つ宣言を取り、
 * `<pkg>/<src>/<entry>` を対象とする。宣言の実在確認は `audit-structure.mjs` が行っている。
 *
 * **対象は ADR-0016 が言う `index.ts` より広い**（`main.tsx` / `server.ts` も入る）。
 * 「エントリが `index.ts` のものだけ」という絞り込みを書くほうが腐りやすく、
 * かつアプリのエントリに `export *` を置きたい理由も無いため、広いまま採る。
 *
 * ## コメント・文字列の扱い — **剥がさない。コメント行を許可リストで飛ばす**
 *
 * `packages/timer-core/src/index.ts` と `packages/poker-core/src/index.ts` の docstring は
 * 由来や規範を説明するために `` `export *` `` という文字列を含む。これは規範違反ではないので
 * 見逃す必要がある。
 *
 * かつてはこれを `stripStringsAndComments`（`audit-structure.mjs` の共有ヘルパ）で
 * 落としてから見ていた。**これは向きが逆だった。** この検査は「無いこと」を求めるので、
 * 剥がす処理が誤って剥がしすぎるたびに**緑に倒れる**。実際にそうなった（#184）:
 * 共有ヘルパは正規表現リテラルを知らないため、`const re = /it's/;` のアポストロフィを
 * 文字列の開始と誤読し、そこから先にある本物の `export *` ごと捨てて exit 0 になった。
 * **アポストロフィの有無だけで検出が消えていた。**
 *
 * そこで**素のソースを行ごとに見る**方式へ変えた。剥がす処理を一切通さないので、
 * 字句解析の穴が検出漏れに化ける経路が無い。見逃すのは
 * {@link COMMENT_LINE_RE} に当たる行だけ、という**無状態の許可リスト**である。
 *
 * **判定を誤る向きは過剰報告（赤）に固定される。** 許可リストに当たらない行に
 * `export *` の字面があれば、それが文字列の中であっても報告する。
 * 偽陽性はレビューで消せるが、偽陰性は誰にも見えない。
 *
 * ## 何を見ていないか
 *
 * - **コメント行の判定は行の先頭しか見ない。** {@link COMMENT_LINE_RE} は
 *   `//` / `/*` / `*` で始まる行だけを飛ばす。`*` を行頭に持たない書き方の
 *   ブロックコメント（開始行の次の行を `*` 無しで書き継ぐ形）の中に `export *` を書くと
 *   報告される。**赤に倒れる側なので放置してよい**（コメントの書き方を変えるか、
 *   `export *` の字面を避ければ済む）。走査対象 9 件の実測では偽陽性は 0 件だった。
 * - **同じ行に複数あっても 1 件としか数えない。** 報告の単位は行である。
 * - **明示列挙の網羅性は見ていない。** 記号を列挙から落としても、その記号を
 *   エントリ経由で使う利用者がいなければ型検査も通る（`computeStats` で実測）。
 *   網羅性を見るには別の検査が要る。
 * - **エントリ以外のファイルの `export *` は見ていない。** ADR-0016 が言うのは
 *   `index.ts`（公開面の正本）であり、内部モジュール間の再エクスポートは対象外。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasZeroScanTargets } from "./lib/scan-targets.mjs";
import { SCANNED_PACKAGES, hasScanTarget } from "./audit-structure.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

/**
 * `export *` / `export * as ns` を拾う。**行頭に固定しない。**
 *
 * かつては行頭に固定した形（`^\s*export\s+\*`）で先頭（空白は許す）にしか当たらず、
 * `const x = 1; export * from './a';` のように同じ行の 2 つ目以降の文として書くと
 * 検出できなかった（#184 で実測）。`\b` で始めることで行のどこにあっても当たる。
 */
const WILDCARD_RE = /\bexport\s+\*/;

/**
 * **見逃してよい行の許可リスト。** 行の先頭（空白を除く）が `//` / `/*` / `*` の行。
 *
 * ブロックコメントの継続行は慣行上 `*` で始まるため、`*` を含める。
 * ブロックコメントの終端行も `*` で始まるのでここに含まれる。
 *
 * **状態を持たない。** 「いまブロックコメントの中か」を追わないので、
 * 追跡の誤りが検出漏れへ化ける経路が無い。
 */
const COMMENT_LINE_RE = /^\s*(?:\/\/|\/\*|\*)/;

/**
 * エントリの中の `export *` を列挙する（純粋）。
 *
 * **素のソースをそのまま行に割る。** 前処理を挟まないので、報告する行番号は
 * 元ファイルの行番号と必ず一致する（かつては `stripStringsAndComments` が
 * ブロックコメントを改行ごと落としていたため、5 行のブロックコメントを挟むだけで
 * 報告が 4 行ずれた。#184 で実測）。
 *
 * @param entrySources `Map<相対パス, ソース>`
 * @returns 問題の説明の配列（`<path>:<行番号> …`）。問題が無ければ空配列
 */
export function findWildcardReexports(entrySources) {
  const problems = [];
  for (const [file, source] of entrySources) {
    source.split("\n").forEach((line, i) => {
      if (!COMMENT_LINE_RE.test(line) && WILDCARD_RE.test(line)) {
        problems.push(
          `${file}:${i + 1} export * があります。公開記号を明示列挙してください（ADR-0016 決定 2 項目 2）`,
        );
      }
    });
  }
  return problems;
}

/** 走査対象のエントリを `SCANNED_PACKAGES` から導く（実在しないものはキーを作らない）。 */
function readEntrySources() {
  const sources = new Map();
  for (const d of SCANNED_PACKAGES) {
    if (!hasScanTarget(d.src) || !hasScanTarget(d.entry)) continue;
    const rel = `${d.pkg}/${d.src}/${d.entry}`;
    const abs = path.join(REPO_ROOT, rel);
    if (fs.existsSync(abs)) sources.set(rel, fs.readFileSync(abs, "utf8"));
  }
  return sources;
}

function main() {
  const sources = readEntrySources();

  // 走査対象が 0 件なら赤（ADR-0014 決定 8）。宣言を空にして緑にする経路を塞ぐ。
  if (hasZeroScanTargets(sources.size)) {
    console.error("[audit-public-surface] 走査するエントリが 0 件です（検査が空振りします）");
    process.exit(1);
  }

  // 走査量は成否によらず必ず出す（#135 D5）。
  console.log(`[audit-public-surface] 走査対象: エントリ ${sources.size} 件`);

  const problems = findWildcardReexports(sources);
  if (problems.length > 0) {
    for (const p of problems) console.error(p);
    console.error(`\n${problems.length} 件の問題があります`);
    process.exit(1);
  }
  console.log("公開面 OK（export * は 0 件）");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
