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
 * {@link isSkippableCommentLine} が真を返す行だけ、という**無状態の許可リスト**である。
 *
 * ## 許可リストの向き — **「同じ行の中」では赤に固定される**
 *
 * 断定の射程を先に置く。**`export` と `*` が同じ行に空白だけを挟んで並んでいる書き方**に
 * ついては、判定を誤る向きは過剰報告（赤）に固定される。許可リストに当たらない行に
 * `export *` の字面があれば、それが文字列の中であっても報告する。
 * 偽陽性はレビューで消せるが、偽陰性は誰にも見えない。
 *
 * **この断定は一度破れている（#193）。** 許可リストが行の**先頭だけ**を見て行全体を
 * コメント扱いしていたため、`/* c8 ignore next *\/ export * from './legacy';` のように
 * **ブロックコメントが行の途中で閉じ、その後ろに本物の `export *` が続く行**を丸ごと飛ばし、
 * **緑（＝見逃し）に倒れていた**。旧実装（剥がしてから見る）はこれを検出できていたので
 * **後退だった**。断定を弱めるのではなく、許可リストを 3 条件に直して断定を成り立たせた
 * （{@link isSkippableCommentLine}）。
 *
 * 断定の射程の外は下に列挙する。**「見ていない」ではなく「緑に倒れる」と書く。**
 *
 * ## 何を見ていないか
 *
 * ### 緑（＝見逃し）に倒れる — `export` と `*` が同じ行で隣り合っていない書き方
 *
 * 判定の単位が行で、かつ状態を持たないため、`export` と `*` の間に**改行かコメントが
 * 割り込む**書き方は拾えない。いずれも妥当な JS であることを `node --check` で実測した。
 *
 * - **`export` と `*` が別の行**（`export` だけの行 ＋ `* from './a';` の行）。後者が
 *   許可リストの `*` 始まりに当たって飛ばされる（#184 で実測）。**旧実装も同じく
 *   見逃していたので後退ではない。**
 * - **`export` と `*` の間にコメントが挟まる**（`export /* x *\/ * from './a';`）。
 *   {@link WILDCARD_RE} が `export` と `*` の隣接を見るため当たらない（#193 で実測）。
 *   **旧実装も同じく見逃していた。**
 *
 * どちらも塞ぐには「いま何行目まで読んだか」「いまコメントの中か」という状態が要り、
 * 状態を持たないという本検査の設計そのものと引き換えになるため、塞がない。
 * 走査対象は自分たちが書くエントリ 9 件であり、この書き方を選ぶ動機が無いことを
 * 受容の根拠とする。**動機を持つ者（＝規範を迂回したい者）には効かない検査である。**
 *
 * ### 赤（＝過剰報告）に倒れる — 放置してよい
 *
 * - **`*` を行頭に持たない書き方のブロックコメント**（開始行の次の行を `*` 無しで
 *   書き継ぐ形）の中に `export *` を書くと報告される。走査対象 9 件の実測では
 *   偽陽性は 0 件だった（`node scripts/audit-public-surface.mjs` が exit 0）。
 * - **行コメント（`//`）の中に `*\/` があり、その後ろに何か続く行**も報告される
 *   （{@link CODE_AFTER_COMMENT_END_RE} が当たるため）。
 * - **行頭が裸の `*` の行に `export * … from '…'` の字面がある**と、それが JSDoc の
 *   散文でも報告される（{@link WILDCARD_STATEMENT_RE}）。散文で `` `export *` `` とだけ
 *   書くぶんには当たらない。
 *
 * ### そもそも射程の外
 *
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
 *
 * `export` と `*` の間の空白は**必須にしない**（`\s*`）。`export*from"./a";` は
 * 妥当な JS であり（`node --check` で実測）、空白を必須にすると見逃していた（#193）。
 */
const WILDCARD_RE = /\bexport\s*\*/;

/**
 * **行の先頭（空白を除く）がコメントの開始に見えるか。** `//` / `/*` / `*` の 3 つ。
 *
 * ブロックコメントの継続行は慣行上 `*` で始まるため、`*` を含める。
 * ブロックコメントの終端行も `*` で始まるのでここに含まれる。
 *
 * **これだけでは飛ばさない。** {@link CODE_AFTER_COMMENT_END_RE} との組で使う。
 */
const COMMENT_LINE_START_RE = /^\s*(?:\/\/|\/\*|\*)/;

/**
 * **同じ行でブロックコメントが閉じ、その後ろに空白以外が続くか。**
 *
 * 行頭がコメントの開始でも、その行のどこかに `*\/` があり、その後ろに空白以外が続くなら、
 * その後ろは**コメントではなくコード**である。飛ばしてはならない。
 * かつては行の先頭だけを見て行全体をコメント扱いしていたため、
 * `/* c8 ignore next *\/ export * from './legacy';` のような行を丸ごと飛ばして
 * **緑（＝見逃し）に倒れていた**（#193 で実測。旧実装は検出できていたので後退だった）。
 *
 * 判定を誤る向きは赤に固定される。行コメント（`//`）の中の `*\/` に当たると
 * その行を飛ばさなくなるが、それは**過剰報告**であって見逃しではない。
 */
const CODE_AFTER_COMMENT_END_RE = /\*\/\s*\S/;

/**
 * **行頭の印が裸の `*` か。** 3 つの印のうち、これだけが**コードでもありうる**。
 *
 * `//` と `/*` は、行頭にあれば必ずコメントの開始である（文字列やテンプレートリテラルの
 * 中でも、そこにある `export *` はコードではない）。対して裸の `*` は、JSDoc の継続行の
 * 慣行であると同時に、`const n = 2` の次の行の `  * 3;` のような**式の継続**でもありうる。
 * 許可リストが取り違える余地はここにしかないので、上書きの規則もここだけに効かせる。
 */
const BARE_STAR_START_RE = /^\s*\*/;

/**
 * **本物の `export * … from '…'` の字面。** {@link BARE_STAR_START_RE} の行で許可リストを上書きする。
 *
 * ES の文法上、ワイルドカード再エクスポートは `export * from '…'` か
 * `export * as ns from '…'` の 2 形しかない。散文の中で `` `export *` `` とだけ書く
 * docstring はこの形に当たらないので、飛ばしたい側を巻き込まない。
 *
 * **この規則は報告を増やす向きにしか働かない。** 当たらなければ許可リストの判定へ戻るだけで、
 * 緑に倒す新しい経路は作らない。
 */
const WILDCARD_STATEMENT_RE = /\bexport\s*\*\s*(?:as\s+[A-Za-z_$][\w$]*\s*)?from\s*['"`]/;

/**
 * **見逃してよい行か。** 3 つの条件をすべて満たす行だけを飛ばす。
 *
 * 1. 行頭（空白を除く）がコメントの開始に見える（{@link COMMENT_LINE_START_RE}）
 * 2. その行でブロックコメントが閉じてコードが続いてはいない（{@link CODE_AFTER_COMMENT_END_RE}）
 * 3. 行頭が裸の `*` なら、本物の `export * … from '…'` の字面を持たない
 *    （{@link BARE_STAR_START_RE} × {@link WILDCARD_STATEMENT_RE}）
 *
 * **状態を持たない。** 「いまブロックコメントの中か」を追わないので、
 * 追跡の誤りが検出漏れへ化ける経路が無い。
 *
 * @param line 判定する 1 行
 * @returns 飛ばしてよければ `true`
 */
function isSkippableCommentLine(line) {
  if (!COMMENT_LINE_START_RE.test(line)) return false;
  if (CODE_AFTER_COMMENT_END_RE.test(line)) return false;
  if (BARE_STAR_START_RE.test(line) && WILDCARD_STATEMENT_RE.test(line)) return false;
  return true;
}

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
      if (WILDCARD_RE.test(line) && !isSkippableCommentLine(line)) {
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
