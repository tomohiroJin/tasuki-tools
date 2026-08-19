#!/usr/bin/env node
/**
 * web 層の同期境界を見る検査（`docs/adr/0015` MUST 2 が #72 E4 へ割り当てた機械検査）。
 *
 * ## 何を見るか（3 つ）
 *
 * 宣言した web アプリ（{@link WEB_APPS}）ごとに、`src` 配下の `.ts` / `.tsx` について
 * 次を見る。
 *
 *   1. **許可リスト**: 同期クライアント（`syncModules`）を import してよいのは
 *      `allowedImporters` に挙げたファイルだけである
 *   2. **WS の保持先**: `new WebSocket(` を書いてよいのは `wsHolders` に挙げた
 *      ファイルだけである
 *   3. **宣言の実在**: `WEB_APPS` に書いたすべてのパスが実在する（`docs/adr/0014` 決定 7）
 *
 * **timer と poker の両方を宣言する。** poker-web には `sync/client` に相当する
 * モジュールが無く、`hooks/useSync.ts` が `new WebSocket` を直接持つ。検査 1 だけだと
 * poker 側は宣言が空でも通ってしまう（片側検査）。検査 2 が両アプリに効く形なので、
 * これで poker 側も縛られる。
 *
 * ## ファイル収集は git 由来にする
 *
 * `listRepoFiles` は `git ls-files` の追跡分と未追跡分（`--exclude-standard`）を合わせる。
 * 手書きのディレクトリ走査より穴が少なく、**`src/dist/*.ts` も追跡下なら拾える**
 * （#166 が `audit-domain-side-effects` の実在する穴として記録した経路が、ここでは開かない）。
 *
 * **pathspec に `**` を使ってはならない。** git の `ls-files` は既定で `FNM_PATHNAME` を
 * 使わないため `src/*.ts` が入れ子のファイルにも当たる。一方 `src/**\/*.ts` は
 * **ディレクトリを 1 段以上要求する**ので、`src` 直下のファイルを落とす
 * （2026-08-19 実測: `apps/timer-web` で `src/*.ts` + `src/*.tsx` が 82 件、
 * `src/**\/*.ts` + `src/**\/*.tsx` が 78 件）。
 *
 * ## `allowedImporters` を timer-web で 2 本にしている理由
 *
 * `apps/timer-web/src/sync/dispatch.ts` は `import type { Identity } from "./client.js";`
 * を持つ（2026-08-19 実測。`src` 配下で `./client.js` を import しているのは
 * `use-timer-sync.ts` と `dispatch.ts` の 2 ファイルだけ）。この import を許すのは:
 *
 *   - `dispatch.ts` は**同期クライアント自身の実装の一部**である。サーバーメッセージの
 *     振り分けという `client.ts` の関心を切り出したファイルであり、`client.ts` の側が
 *     `dispatch.ts` を import する（依存の向きは client → dispatch）。つまり
 *     `dispatch.ts` は同期クライアントの**消費者ではない**
 *   - import しているのは **`import type`**、つまり型のみである。実行時の依存は無い
 *
 * `use-timer-sync.ts`（同期フック）とこの 2 本だけを許可する。**この 2 本以外を
 * 許さないことが検査の主旨**であり、`App.tsx` など画面側のファイルが同期クライアントを
 * 直接 import することは引き続き禁止する。
 *
 * ## 何を見ていないか — **「足りる」とは言わない**
 *
 * - **re-export はすり抜ける。** `src/sync/index.ts` が `client.ts` を re-export し、
 *   別のファイルがそこから import すると検査 1 は当たらない。**これは実在する穴**で、
 *   「まだ見ていないだけ」ではない。re-export を作ったら `syncModules` へ足す運用に依存する
 * - **動的 import**（`await import("./client.js")`）は行単位の許可リストに当たらない形にできる
 * - **`.mts` / `.cts` は収集の対象外**（`listRepoFiles` へ渡す pathspec の作りから決まる）
 * - **`test` 配下は対象外**（`docs/adr/0015` 影響節）。`client.connection` / `client.dispose` /
 *   `client.reconnect` の 3 本が `SyncClient` を直接 import しているためである
 * - **無力化の最短経路は `allowedImporters` に 1 行足すこと。** 実在検査も 0 件ガードも
 *   自己テストも素通りする（`audit-domain-side-effects` の `EXCLUDED_PACKAGES` と同型）。
 *   この構えは人手のレビューに依存している
 *
 * ## コメント行の扱い — **読み飛ばさない**
 *
 * 検査 1・2 はどちらも「**無いこと**」を求めるので、読み飛ばすと緑に倒れる。
 * `audit-domain-side-effects.mjs` と同じ向きである。代償として、許可されていない
 * ファイルのコメントに `sync/client` や `new WebSocket(` と書けない（言い換える）。
 *
 * 設計方針: 判定は純粋関数にし、実ファイル I/O と `process.exit` は `main()` の
 * 薄い配線だけに置く。追加依存は禁止のため Node 標準と `scripts/lib/scan-targets.mjs` のみを使う。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findMissingPaths, findEmptyScanDimensions, listRepoFiles } from "./lib/scan-targets.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 検査対象の宣言。
 *
 * - `syncModules`: 同期クライアントの実体（`app` からの相対パス）
 * - `allowedImporters`: それを import してよいファイル（＝同期フックと、その実装の一部）
 * - `wsHolders`: `new WebSocket(` を書いてよいファイル
 */
export const WEB_APPS = [
  {
    app: "apps/timer-web",
    syncModules: ["src/sync/client.ts"],
    // dispatch.ts を許す理由はファイル冒頭の docstring を参照
    // （同期クライアント自身の実装の一部・import type のみ）。
    allowedImporters: ["src/sync/use-timer-sync.ts", "src/sync/dispatch.ts"],
    wsHolders: ["src/sync/client.ts"],
  },
  {
    app: "apps/poker-web",
    // poker-web に sync/client 相当のモジュールは無い（フックが WS を直接持つ）。
    syncModules: [],
    allowedImporters: [],
    wsHolders: ["src/hooks/useSync.ts"],
  },
];

/** `new WebSocket(` の字面。空白の揺れを吸収するため正規表現で見る。 */
const WS_CONSTRUCTION = /new\s+WebSocket\s*\(/;

/**
 * import 指定子が同期クライアントを指しているとみなす字面を作る。
 * `./client.js` `./sync/client.js` `../sync/client` のいずれにも当たるよう、
 * 拡張子を落とした末尾（`sync/client` と `client`）で見る。
 */
function importNeedles(syncModule) {
  const withoutExt = syncModule.replace(/\.tsx?$/, ""); // src/sync/client
  const base = withoutExt.split("/").slice(1).join("/"); // sync/client
  return [base, withoutExt.split("/").pop()].filter(Boolean);
}

/** 正規表現の特殊文字をエスケープする。 */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 行に needle が「相対 import の指定子として」現れているかを見る。
 *
 * 単一セグメントの needle（例: `client`）は `./` の直後だけを見る。**そうしないと
 * `"react-dom/client"` のような無関係な bare specifier の末尾セグメントに
 * 一致してしまう**（`apps/timer-web/src/main.tsx` の `import { createRoot } from
 * "react-dom/client";` で実測）。複数セグメントの needle（例: `sync/client`）は
 * `sync/client` という綴りが無関係な specifier に紛れ込む可能性が低いため、
 * 前方の区切りは問わない。
 *
 * 終端はクォート・空白・`)` のいずれか、または行末とする。**クォートの直後だけに
 * 限定しない** — コメント中では `./sync/client.js を` のように後ろにクォートが
 * 付かない字面で現れるため、クォート限定にすると「コメント行も読む」が崩れる。
 */
function needleAppearsAsSpecifier(line, needle) {
  const escaped = escapeRegExp(needle);
  const withPrefix = needle.includes("/") ? escaped : `\\.\\/${escaped}`;
  const pattern = new RegExp(`${withPrefix}(\\.js)?(["'\\s)]|$)`);
  return pattern.test(line);
}

/** 行が import 文で、指定子に needle を含むか。行をまたぐ状態は持たない。 */
function lineImports(line, needles) {
  if (!/\b(import|from|require)\b/.test(line)) return false;
  return needles.some((n) => needleAppearsAsSpecifier(line, n));
}

/**
 * 許可されていないファイルからの同期クライアント import を返す。
 * @param {{path: string, lines: string[]}[]} files `app` からの相対パスと行の配列
 */
export function findDisallowedImporters(files, app) {
  const allowed = new Set(app.allowedImporters);
  const needles = app.syncModules.flatMap(importNeedles);
  if (needles.length === 0) return [];
  const found = [];
  for (const file of files) {
    if (allowed.has(file.path)) continue;
    if (app.syncModules.includes(file.path)) continue; // 実体そのものは対象外
    file.lines.forEach((line, i) => {
      if (lineImports(line, needles)) found.push({ path: file.path, line: i + 1, text: line.trim() });
    });
  }
  return found;
}

/** 許可されていないファイルでの `new WebSocket(` を返す。 */
export function findDisallowedWsHolders(files, app) {
  const allowed = new Set(app.wsHolders);
  const found = [];
  for (const file of files) {
    if (allowed.has(file.path)) continue;
    file.lines.forEach((line, i) => {
      if (WS_CONSTRUCTION.test(line)) found.push({ path: file.path, line: i + 1, text: line.trim() });
    });
  }
  return found;
}

/** 宣言から導出したリポジトリ相対パスの一覧（実在確認の入力）。 */
export function declaredPathsOf(app) {
  return [
    app.app,
    ...[...app.syncModules, ...app.allowedImporters, ...app.wsHolders].map(
      (rel) => `${app.app}/${rel}`,
    ),
  ];
}

/** `src` 配下の `.ts` / `.tsx` を git 由来で集め、`app` からの相対パスに直す。 */
function readAppFiles(app) {
  // `**` は使わない（docstring 参照。`src` 直下を落とす）。
  const rels = listRepoFiles(REPO_ROOT, [`${app.app}/src/*.ts`, `${app.app}/src/*.tsx`]);
  return rels.map((rel) => ({
    path: rel.slice(app.app.length + 1),
    lines: fs.readFileSync(path.join(REPO_ROOT, rel), "utf8").split("\n"),
  }));
}

function main() {
  const problems = [];
  const volume = [{ label: "web アプリ", count: WEB_APPS.length }];

  // 宣言の実在（`docs/adr/0014` 決定 7）。共有関数を使う（自前の existsSync を書かない）。
  const missing = findMissingPaths(REPO_ROOT, WEB_APPS.flatMap(declaredPathsOf));
  for (const m of missing) {
    problems.push(`[宣言の実在] 宣言したパスが見つかりません: ${m}    ← 移設したなら宣言を直す`);
  }

  for (const app of WEB_APPS) {
    const files = readAppFiles(app);
    volume.push({ label: `${app.app} の src`, count: files.length });

    for (const hit of findDisallowedImporters(files, app)) {
      problems.push(
        `[許可リスト] ${app.app}/${hit.path}:${hit.line} は同期クライアントを import しています。` +
          `許可されているのは ${app.allowedImporters.join(" / ") || "（なし）"} だけです → ${hit.text}`,
      );
    }
    for (const hit of findDisallowedWsHolders(files, app)) {
      problems.push(
        `[WS の保持先] ${app.app}/${hit.path}:${hit.line} が WebSocket を直接生成しています。` +
          `許可されているのは ${app.wsHolders.join(" / ")} だけです → ${hit.text}`,
      );
    }
  }

  // 走査量は成否によらず必ず名乗る（`docs/adr/0014` 決定 6）。
  // `scan-target-wiring.test.mjs` が `git ls-files 'scripts/audit-*.mjs'` から導出して
  // すべての検査に課しているので、この行を消すとその導出テストが赤になる。
  console.log(
    `[audit-web-sync-boundary] 走査対象: ${volume.map((v) => `${v.label} ${v.count} 件`).join(" / ")}`,
  );

  // 走査量のどの内訳も 0 件でないことを見る（`docs/adr/0014` 決定 8）。
  const empty = findEmptyScanDimensions(volume);
  if (empty.length > 0) {
    problems.push(`[走査対象] 走査対象が 0 件です（${empty.join(" / ")}）。検査が空振りしています`);
  }

  if (problems.length > 0) {
    console.error("[audit-web-sync-boundary] NG");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log("[audit-web-sync-boundary] OK（違反 0 件）");
}

// 自己テストから import されたときは main() を走らせない。
if (import.meta.url === `file://${process.argv[1]}`) main();
