#!/usr/bin/env node
/**
 * 依存の向きを見る検査（憲法 原則 VI・`docs/adr/0017` 決定 4）。
 *
 * ## なぜ要るか
 *
 * 原則 VI「依存は内向き」は MUST でありながら、2026-09-06 の実測時点で
 * `scripts/*.mjs` の非テスト 14 本に**パッケージ間の依存方向を見る検査は 1 つも無かった**。
 * 近い形のものは 2 つあるが、どちらも別のものを見ている。
 *   - `audit-web-sync-boundary.mjs`: 1 つの web アプリ**内**のファイル単位 import 許可リスト
 *   - `audit-assembly-wiring.mjs`: 組み立ての集約（エントリが create-sync-server を経由するか）
 *
 * ## 何を見るか
 *
 *   1. **宣言と実体の全単射照合**（`docs/adr/0014` 決定 1）: {@link ALLOWED} のキーと、
 *      pnpm が答える実在パッケージが一致する
 *   2. **`package.json` の依存宣言**（`dependencies` と `devDependencies` の両方）に、
 *      表に無い `@tasuki/*` が無い
 *   3. **追跡下の `.ts` / `.tsx` の import 文**に、表に無い `@tasuki/*` が無い
 *   4. **同じ import 文に、パッケージの外へ出る相対パスが無い**
 *
 * 2 と 3 の**両方**を見る。片方だけだと、宣言せずに import する経路（あるいは
 * 宣言だけして使わない経路）が抜ける。
 *
 * 4 が要るのは、**規範を迂回する側だけが通る形**になっていたからである。
 * `@tasuki/room-core` と書けば赤くなるのに、`../../room-core/src/display-name.js` と
 * 書くと緑のままだった（2026-09-07 のレビューで指摘され、実測で再現した）。
 * `moduleResolution: "Bundler"` と各パッケージの `include: ["src", "tests"]` の下では
 * tsc も vite も bun もこの import を解決するので、実在しうる経路である。
 * **パッケージ間は必ずパッケージ名で参照する**（そうでなければ 2 と 3 が意味を失う）。
 *
 * **走査は `src` に限らない。** テストコードからの取り込みも依存であり、
 * `src` だけを見ると `test/` 経由の逆流が素通りする（2026-09-07 の実測では
 * `packages/timer-core/test` `apps/tasuki-sync/test` `apps/timer-web/test` の 3 つが
 * 実際に `@tasuki/*` を取り込んでいた）。テストディレクトリ名は `test` と `tests` で
 * 割れているので、名前を導出せず**パッケージ配下を再帰で見る**。
 *
 * **拡張子は {@link SCANNED_EXTENSIONS} で宣言する。** ディレクトリは絞らないが、
 * 拡張子は絞る（`packages/ui` は woff2 を 7 本 = 約 722KB 同梱しており、全ファイルを
 * 読むのは無駄である）。**当初 `.ts` / `.tsx` だけを見ていて `.mjs` が素通りした** ——
 * `apps/tasuki-sync/scripts/quality-experiment.mjs` は実在し `@tasuki/timer-core` を
 * 取り込んでいるのに走査外で、そこへ禁止依存を 2 本足しても `exit 0` だった
 * （2026-09-07 のレビューで指摘され、実測で再現した）。**拡張子を変えるだけで
 * 決定 4 を迂回できる状態だった** → 実行可能なモジュールの拡張子をすべて宣言する。
 *
 * ## 走査量は合計だけでなく内訳も見る（#253・ADR-0014 決定 8）
 *
 * **0 件ガードを走査量の合計にしか掛けないと、パッケージ単位の空振りが素通りする。**
 * 1 つのパッケージだけが走査対象ファイルを失っても、他パッケージ分で合計が非ゼロの
 * まま緑になる。2026-09-07 の実測では、`apps/timer-web` の 196 ファイル（全体の 38%）を
 * 走査から落としても `exit 0` で、**その状態で timer-web に表に無い依存を足しても
 * 報告しなかった**。走査量の行に「316 ファイル」と出るが、比較する基準が無いので
 * 人も気づけない。
 *
 * `audit-log-hygiene.mjs` は同じ型の穴を `findMissingPaths`（導出先ディレクトリの
 * 実在確認）で塞いでいるが、あちらは `${pkg}/src` というディレクトリを導出する構造で
 * あるのに対し、こちらは git の pathspec でファイルを直接列挙し**中間のディレクトリを
 * 導出しない**ため、同じ関数は当てはまらない。そこで**パッケージごとの件数を
 * 走査量の内訳として扱い**、0 件のものを {@link EXCLUDED_PACKAGES} に載っていない限り
 * 名指しして落とす（ADR-0014 決定 8 の「内訳のどれか 1 つでも 0 件なら落とす」）。
 *
 * ## 賢くしない
 *
 * 無状態の許可リストにする。「テストなら許す」「型 import なら許す」といった例外を
 * 足さない。例外を足すほど穴が増える。**新しいパッケージを足したら、表を更新するまで
 * 赤になる。それが望む挙動である**（依存方向は決定であり、黙って通してよいものではない）。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDirectRun } from "./lib/direct-run.mjs";
import {
  diffTargets,
  findEmptyScanDimensions,
  formatTargetDiff,
  hasTargetDrift,
  listTrackedFiles,
  listWorkspacePackages,
} from "./lib/scan-targets.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

/**
 * 各パッケージが依存してよい `@tasuki/*` の許可リスト。
 *
 * **これは「S1 完了時点の実体」であり、設計の最終形ではない。** 設計正本 D17 の表は
 * 最終形（`sync-client` や LP の同期依存を含む）を書いている。表は段ごとに更新する。
 *
 * **期限つきの一時依存には期限を書く**（`docs/adr/0017` 決定 4）。期限の段が終わったら
 * 行を消す。消し忘れても検査は緑のままなので、その段の DoD で確認する。
 */
export const ALLOWED = {
  "packages/room-core": [],
  // 同期クライアントの接続部分（#95 S5a・D18）。**@tasuki/* に依存しない** ——
  // ツールの語彙を持たないことが、3 つの web アプリから使える条件である。
  "packages/sync-client": [],
  "packages/timer-core": [], // #95 S4b で room-core への一時依存を外した（ADR-0017 決定 4 の期限）
  "packages/poker-core": ["@tasuki/protocol"], // 既存。境界のパースを protocol に一本化
  "packages/protocol": [],
  "packages/rate-limit": [],
  "packages/ui": [],
  // #95 S5a で LP は同期クライアントになった（ADR-0019）。**@tasuki/timer-core を知らない** ——
  // ハブが扱うのは名簿だけで、タイマーの状態も票も通らない（ADR-0017 の文脈分割）。
  "apps/landing": [
    "@tasuki/protocol",
    "@tasuki/room-core",
    "@tasuki/sync-client",
    "@tasuki/ui",
  ],
  "apps/timer-web": [
    "@tasuki/room-core",
    "@tasuki/sync-client",
    "@tasuki/timer-core",
    "@tasuki/ui",
  ],
  "apps/poker-web": ["@tasuki/poker-core", "@tasuki/ui"],
  // #95 S2 で apps/timer-sync と apps/poker-sync がここへ統合された。
  // poker-core が加わったのはそのため（統合前は poker-sync 側の依存）。
  "apps/tasuki-sync": [
    "@tasuki/poker-core",
    "@tasuki/protocol",
    "@tasuki/rate-limit",
    "@tasuki/room-core",
    "@tasuki/timer-core",
  ],
  e2e: ["@tasuki/landing", "@tasuki/poker-web", "@tasuki/timer-web"],
};

/**
 * 走査対象が 0 件でよいパッケージ。**理由が要る**（`docs/adr/0014` 決定 2）。
 *
 * ここに載せられるのは「{@link SCANNED_EXTENSIONS} のファイルを 1 つも持たない」
 * という**現在の実測**であり、そう決めたという話ではない。したがって次の 2 つを機械が見る。
 *   - **宛先が実在しなくなったら落とす**（決定 2）。改名・移設で除外だけが残る経路。
 *   - **走査対象を持つようになったら落とす**（陳腐化）。放置すると、そのパッケージが
 *     後で走査対象を失ったときに黙って除外され、#253 の穴がここから再生する。
 *
 * **現在は空である。** かつて `packages/ui` が該当したが、`.mjs` を
 * {@link SCANNED_EXTENSIONS} へ足した時点で走査対象を持つようになり、除外は不要になった。
 * 空の表を残すのは、該当が出たときに規範ごと迷わないためである。
 *
 * **件数はここに書かない**（足すたびに腐り、それを守る検査も無い）。現況は
 * このスクリプトを実行すれば走査量として出るし、0 件のパッケージがあれば赤くなる。
 *
 * @type {{ pkg: string, reason: string }[]}
 */
export const EXCLUDED_PACKAGES = [];

/**
 * 除外の宣言そのものの妥当性を見る（`docs/adr/0014` 決定 2・決定 9）。
 *
 * **決定 2 は「除外には理由を書く」を MUST にしている。** 理由の欄が無い・空・空白だけ、
 * という行を通すと、赤くなった検査を `{ pkg: "..." }` の 1 行で黙らせられる。決定 9 も
 * 「宣言の値の妥当性（空文字列・書き忘れ）も検査する」を MUST としており、
 * **件数のガードでは 1 行の書き忘れを検知できない**（表の長さは変わらないため）。
 *
 * 判定は純粋関数にして、I/O と `process.exit` は呼び出し側に置く。
 */
export function findInvalidExclusions(entries) {
  return entries
    .filter((e) => typeof e?.reason !== "string" || e.reason.trim() === "")
    .map((e) => e?.pkg ?? "(pkg の指定がありません)")
    .sort();
}

/** `@tasuki/*` の import 指定子を 1 行から拾う。 */
const TASUKI_SPECIFIER = /["'](@tasuki\/[a-z0-9-]+)/g;

/**
 * 相対パスの指定子を拾う。
 *
 * `from "..."` と `import("...")` の両方を見る。`export ... from "..."` も
 * `from` を持つので同じ式で拾える。
 */
const RELATIVE_SPECIFIER = /(?:from|import)\s*\(?\s*["'](\.[^"']*)["']/g;

/**
 * パッケージごとの `{ manifest, imports }` から違反を返す。
 *
 * 引数を受け取る形にしてあるのは、ファイルシステムを触らずに検査できるようにするため。
 * **同じ依存を経路ごとに 1 件ずつ**返す（`package.json` と import の両方に出れば 2 件）。
 * 片方だけ直して終わる取りこぼしを、件数の側から見えるようにする。
 */
export function findViolations(observed) {
  const violations = [];
  for (const [pkg, { manifest, imports, escapes = [] }] of Object.entries(observed)) {
    const allowed = ALLOWED[pkg];
    if (allowed === undefined) {
      violations.push({ pkg, dep: null, via: "declaration" });
      continue;
    }
    const set = new Set(allowed);
    for (const dep of new Set(manifest)) {
      if (!set.has(dep)) violations.push({ pkg, dep, via: "package.json" });
    }
    for (const dep of new Set(imports)) {
      if (!set.has(dep)) violations.push({ pkg, dep, via: "import" });
    }
    // 相対パスでパッケージの外へ出る取り込みは、依存先が表にあるかどうかによらず違反。
    // 表に載っている依存先であっても、パッケージ名で参照しなければ 2 と 3 が空振りする。
    for (const dep of new Set(escapes)) {
      violations.push({ pkg, dep, via: "相対パス" });
    }
  }
  return violations;
}

/**
 * 走査する拡張子。**JS / TS で実行される可能性のあるものをすべて挙げる。**
 *
 * ここを狭めると、狭めた拡張子のファイルから自由に越境できるようになる。
 * `.ts` / `.tsx` だけだった版では `.mjs` が素通りした（本ファイル冒頭を見よ）。
 * **設定ファイル（`*.config.js` / `*.config.mjs`）も含む** —— 設定から
 * `@tasuki/*` を取り込む経路も依存であり、除く理由が無い。
 */
export const SCANNED_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

/**
 * パッケージ配下の追跡下ファイルを列挙する（拡張子は {@link SCANNED_EXTENSIONS}）。
 *
 * git の pathspec の `*` は `/` を跨ぐので、`<pkg>/*.ts` だけで再帰列挙になる
 * （`**` を書いてはならない。`scripts/lib/scan-targets.mjs` の docstring を見よ）。
 * 追跡下だけを見るので `node_modules` と `dist` は自動的に外れる。
 *
 * **pathspec は宣言から導く。** ここに拡張子を直書きすると、宣言を書き換えても
 * 走査が変わらない（宣言と実体がずれるのに検査は緑のまま）。
 */
function listPackageSources(pkg) {
  return listTrackedFiles(
    REPO_ROOT,
    SCANNED_EXTENSIONS.map((ext) => `${pkg}/*${ext}`),
  );
}

/** 実体を観測する。 */
function observe(pkg, files) {
  const manifestPath = path.join(REPO_ROOT, pkg, "package.json");
  const manifest = [];
  if (fs.existsSync(manifestPath)) {
    const json = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    for (const field of ["dependencies", "devDependencies"]) {
      for (const dep of Object.keys(json[field] ?? {})) {
        if (dep.startsWith("@tasuki/")) manifest.push(dep);
      }
    }
  }
  const imports = [];
  const escapes = [];
  for (const rel of files) {
    const text = fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
    for (const m of text.matchAll(TASUKI_SPECIFIER)) imports.push(m[1]);
    for (const m of text.matchAll(RELATIVE_SPECIFIER)) {
      // 解決先はリポジトリ相対で持つ。パッケージの接頭辞から外れたら越境。
      // `path.posix` で畳むのは、走査対象のパスが常に `/` 区切りだから。
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1]));
      if (!target.startsWith(`${pkg}/`)) escapes.push(`${rel} → ${m[1]}`);
    }
  }
  return { manifest, imports, escapes };
}

function main() {
  // 走査対象の宣言が workspace の実体とずれていないかを最初に見る（ADR-0014 決定 1）。
  // **権威は pnpm 自身**であり、pnpm-workspace.yaml の自作解析やディレクトリの
  // readdir で代替しない（ADR-0014 決定 3 の MUST NOT）。
  const packages = listWorkspacePackages(REPO_ROOT);
  const declared = Object.keys(ALLOWED);
  const drift = diffTargets(declared, packages);

  // **走査対象はここで 1 回だけ確定させる**（ADR-0014 決定 9）。走査量の算出も
  // 実走査もこの `sources` から導出する。
  const sources = new Map(packages.map((pkg) => [pkg, listPackageSources(pkg)]));
  const fileCount = [...sources.values()].reduce((n, files) => n + files.length, 0);
  const summary = `${packages.length} パッケージ / ${fileCount} ファイル`;

  if (hasTargetDrift(drift)) {
    console.error(formatTargetDiff("audit-dependency-direction", drift, summary));
    process.exit(1);
  }

  // 走査量は成否によらず必ず出す（ADR-0014 決定 6）。
  console.log(`[audit-dependency-direction] 走査対象: ${summary}`);

  // 走査量のどの内訳も 0 件でないことを見る（ADR-0014 決定 8）。
  // 表を空にすれば全単射照合は「実在するのに宣言に無い」で落ちるが、走査側の
  // 空振り（追跡下のファイルを 1 つも読めていない）はそれでは検知できない。
  const emptyDimensions = findEmptyScanDimensions([
    { label: "パッケージ", count: packages.length },
    { label: "ファイル", count: fileCount },
  ]);
  if (emptyDimensions.length > 0) {
    console.error(
      `[audit-dependency-direction] 走査対象が 0 件です（検査が空振りします）: ${emptyDimensions.join(" / ")}`,
    );
    process.exit(1);
  }

  // 走査量の**内訳**（パッケージごとの件数）も 0 件でないことを見る
  // （ADR-0014 決定 8 の「走査量に内訳があるなら、内訳のどれか 1 つでも 0 件なら落とす」）。
  // 上の合計のガードでは、1 つのパッケージだけが走査対象を失った状態を検知できない
  // （他パッケージ分で合計が非ゼロのまま緑になる。#253）。
  //
  // **数えるのは宣言ではなく `sources`。** 走査量の算出も実走査も同じ 1 か所から
  // 導出する（決定 9）ので、ここで 0 件と判じた集合は実走査が見ていない集合と一致する。
  // 理由の書き忘れを最初に見る（決定 2・決定 9）。宛先の実在より前に置くのは、
  // 「理由なしの行で検査を黙らせる」経路を、宛先が実在するかどうかに依らず塞ぐため。
  const invalidExclusions = findInvalidExclusions(EXCLUDED_PACKAGES);
  if (invalidExclusions.length > 0) {
    console.error(
      `[audit-dependency-direction] 除外に理由がありません（なぜ 0 件でよいのかを書く）: ${invalidExclusions.join(" / ")}`,
    );
    process.exit(1);
  }

  const excludedNames = EXCLUDED_PACKAGES.map((e) => e.pkg);

  // 除外の宛先の実在を先に見る（決定 2）。`sources` は実在パッケージからしか作らないので、
  // 実在しない宛先を後段で数えると `undefined` を読む。**順序に意味がある。**
  const missingExclusions = excludedNames.filter((pkg) => !sources.has(pkg)).sort();
  if (missingExclusions.length > 0) {
    console.error(
      `[audit-dependency-direction] 除外の宛先が実在しません（改名・移設したなら除外表を直す）: ${missingExclusions.join(" / ")}`,
    );
    process.exit(1);
  }

  // 除外の行は「いま 0 件である」という主張なので、主張が偽になったら落とす。
  const staleExclusions = excludedNames.filter((pkg) => sources.get(pkg).length > 0).sort();
  if (staleExclusions.length > 0) {
    console.error(
      `[audit-dependency-direction] 除外が陳腐化しています（走査対象を持つので除外は不要）: ${staleExclusions.join(" / ")}`,
    );
    process.exit(1);
  }

  const emptyPackages = findEmptyScanDimensions(
    packages
      .filter((pkg) => !excludedNames.includes(pkg))
      .map((pkg) => ({ label: pkg, count: sources.get(pkg).length })),
  );
  if (emptyPackages.length > 0) {
    console.error(
      `[audit-dependency-direction] 走査対象が 0 件のパッケージがあります（そのパッケージ分だけ検査が空振りします）: ${emptyPackages.join(" / ")}` +
        "\n  ← 走査対象を失ったなら直す。0 件が正しいなら EXCLUDED_PACKAGES へ理由つきで載せる",
    );
    process.exit(1);
  }

  const observed = Object.fromEntries(
    packages.map((pkg) => [pkg, observe(pkg, sources.get(pkg))]),
  );
  const violations = findViolations(observed);

  if (violations.length === 0) {
    console.log("依存の向き OK（表に無い @tasuki/* の依存は 0 件）");
    return;
  }
  console.error("依存の向きに違反があります:");
  for (const v of violations) {
    console.error(
      v.dep === null
        ? `  ${v.pkg}: 許可表に宣言がありません`
        : v.via === "相対パス"
          ? `  ${v.pkg}: パッケージの外を相対パスで取り込んでいます ${v.dep}`
          : `  ${v.pkg} → ${v.dep}（${v.via}）`,
    );
  }
  process.exit(1);
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
