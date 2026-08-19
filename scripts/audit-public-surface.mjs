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
 * ## コメント・文字列の扱い — **落としてから見る**
 *
 * `packages/timer-core/src/index.ts` の docstring は T055 の由来を説明するために
 * `` `export *` `` という文字列を含む。これは規範違反ではないので、
 * `stripStringsAndComments` を通してから行を見る。
 * **これは「無いこと」を求める検査だが、コメントを読み飛ばしても緑には倒れない** —
 * 読み飛ばすのはコメントの中だけであり、コードは全部読むためである。
 *
 * ## 何を見ていないか
 *
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
import { SCANNED_PACKAGES, hasScanTarget, stripStringsAndComments } from "./audit-structure.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

/** `export *` / `export * as ns` を拾う。行頭の空白は許す。 */
const WILDCARD_RE = /^\s*export\s+\*/;

/**
 * エントリの中の `export *` を列挙する（純粋）。
 *
 * @param entrySources `Map<相対パス, ソース>`
 * @returns 問題の説明の配列（`<path>:<行番号> …`）。問題が無ければ空配列
 */
export function findWildcardReexports(entrySources) {
  const problems = [];
  for (const [file, source] of entrySources) {
    const stripped = stripStringsAndComments(source);
    stripped.split("\n").forEach((line, i) => {
      if (WILDCARD_RE.test(line)) {
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
