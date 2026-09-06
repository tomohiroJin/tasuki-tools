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
 * `packages/timer-core/test` `apps/timer-sync/test` `apps/timer-web/test` の 3 つが
 * 実際に `@tasuki/*` を取り込んでいた）。テストディレクトリ名は `test` と `tests` で
 * 割れているので、名前を導出せず**パッケージ配下の追跡下ファイルを全部見る**。
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
  "packages/timer-core": ["@tasuki/room-core"], // ⏳ S4b で削除する（#95・一時依存）
  "packages/poker-core": ["@tasuki/protocol"], // 既存。境界のパースを protocol に一本化
  "packages/protocol": [],
  "packages/rate-limit": [],
  "packages/ui": [],
  "apps/landing": ["@tasuki/ui"],
  "apps/timer-web": ["@tasuki/room-core", "@tasuki/timer-core", "@tasuki/ui"],
  "apps/poker-web": ["@tasuki/poker-core", "@tasuki/ui"],
  "apps/timer-sync": [
    "@tasuki/protocol",
    "@tasuki/rate-limit",
    "@tasuki/room-core",
    "@tasuki/timer-core",
  ],
  "apps/poker-sync": ["@tasuki/poker-core", "@tasuki/rate-limit"],
  e2e: ["@tasuki/landing", "@tasuki/poker-web", "@tasuki/timer-web"],
};

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
 * パッケージ配下の追跡下 `.ts` / `.tsx` を列挙する。
 *
 * git の pathspec の `*` は `/` を跨ぐので、`<pkg>/*.ts` だけで再帰列挙になる
 * （`**` を書いてはならない。`scripts/lib/scan-targets.mjs` の docstring を見よ）。
 * 追跡下だけを見るので `node_modules` と `dist` は自動的に外れる。
 */
function listPackageSources(pkg) {
  return listTrackedFiles(REPO_ROOT, [`${pkg}/*.ts`, `${pkg}/*.tsx`]);
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
