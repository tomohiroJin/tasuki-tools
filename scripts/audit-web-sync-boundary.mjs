#!/usr/bin/env node
/**
 * web 層の同期境界を見る検査（`docs/adr/0015` MUST 2 が #72 E4 へ割り当てた機械検査）。
 *
 * ## 何を見るか
 *
 *   0. **宣言と実体の全単射照合**（`docs/adr/0014` 決定 1）: `WEB_APPS` に宣言した
 *      web アプリと、`apps/*-web/package.json` から独立に導出した実体を照合する。
 *      片方向だけだと、新設した web アプリ（例: `apps/admin-web`）が宣言に載らないまま
 *      無検査で素通りする（レビューで実測済み）
 *   1. **許可リスト**: 同期クライアント（`syncModules`）を import してよいのは
 *      `allowedImporters` に挙げたファイルだけである
 *   2. **WS の保持先**: `new WebSocket(` を書いてよいのは `wsHolders` に挙げた
 *      ファイルだけである
 *   3. **宣言の実在**: `WEB_APPS` に書いたすべてのパスが実在する（`docs/adr/0014` 決定 7）
 *
 * 宣言した web アプリ（{@link WEB_APPS}）ごとに、`src` 配下の `.ts` / `.tsx` / `.js` / `.jsx`
 * について検査 1・2 を見る。
 *
 * **timer と poker の両方を宣言する。** poker-web には `sync/client` に相当する
 * モジュールが無く、`hooks/useSync.ts` が `new WebSocket` を直接持つ。検査 1 だけだと
 * poker 側は宣言が空でも通ってしまう（片側検査）。検査 2 が両アプリに効く形なので、
 * これで poker 側も縛られる。
 *
 * ## ファイル収集は git 由来にする
 *
 * `listRepoFiles` は `git ls-files` の追跡分と未追跡分（`--exclude-standard`）を合わせる。
 * 手書きのディレクトリ走査より穴が少ない。**ただし追跡下に限る** —
 * ルート `.gitignore` の `dist/` は任意階層に効くため、未追跡の `src/dist/x.ts` は
 * `listRepoFiles` でも拾えない（#166 が `audit-domain-side-effects` について記録した
 * 穴と同じ形がここにも残る。「ここでは開かない」は言い過ぎで、正確には
 * 「追跡すれば拾える」である）。
 *
 * **pathspec に `**` を使ってはならない。** git の `ls-files` は既定で `FNM_PATHNAME` を
 * 使わないため `src/*.ts` が入れ子のファイルにも当たる。一方 `src/**\/*.ts` は
 * **ディレクトリを 1 段以上要求する**ので、`src` 直下のファイルを落とす
 * （2026-08-19 実測: `apps/timer-web` で `src/*.ts` + `src/*.tsx` が 82 件、
 * `src/**\/*.ts` + `src/**\/*.tsx` が 78 件）。
 *
 * **`*` は `/` を跨ぐ**ため、`apps/*-web/package.json` のような 1 階層限定のつもりの
 * pathspec も、理論上はより深い一致を返しうる。{@link listWebAppDirs} はこの前提で
 * 返り値を正規表現により 1 階層に絞り込んでいる。
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
 * - **re-export はすり抜ける。ただし穴の位置は「許可されたファイルが re-export した場合」
 *   である。** `allowedImporters` に載っている `use-timer-sync.ts` が
 *   `export { SyncClient } from "./client.js";` のように re-export すると、
 *   別のファイルがそこから import しても検査 1 は当たらない
 *   （2026-08-19 実測で確認）。逆に、`allowedImporters` に**載っていない**ファイル
 *   （例: 新設する `src/sync/index.ts`）が re-export した場合は、その `index.ts` 自身が
 *   `client` を import する行として検査 1 に**捕まる**。「まだ見ていないだけ」ではなく
 *   実在する穴だが、穴が開くのは許可リスト側が re-export したときに限る
 * - **動的 import**（`await import("./client.js")`）は行単位の許可リストに当たらない形にできる
 * - **`.mts` / `.cts` は収集の対象外**（`listRepoFiles` へ渡す pathspec の作りから決まる）
 * - **`test` 配下は対象外**（`docs/adr/0015` 影響節）。`client.connection` / `client.dispose` /
 *   `client.reconnect` の 3 本が `SyncClient` を直接 import しているためである
 * - **`new WebSocket(` の別名束縛・`Reflect.construct` はすり抜ける。** `const WS = WebSocket;
 *   new WS(url)` や改行を挟んだ `new\nWebSocket(` は{@link WS_CONSTRUCTION}の正規表現に
 *   当たらない。塞ぐには字句解析が要り、このプロジェクトは採らない（無状態・行単位という
 *   設計方針を優先する）
 * - **無力化の最短経路は `allowedImporters` に 1 行足すこと。** 本体の検査
 *   （`node scripts/audit-web-sync-boundary.mjs`）は素通りする。実在確認・0 件ガード・
 *   全単射照合も引っかからない（`audit-domain-side-effects` の `EXCLUDED_PACKAGES` と
 *   同型）。**ただし自己テストは素通りしない** — `audit-web-sync-boundary.test.mjs` の
 *   「timer-web の allowedImporters は同期フックと dispatch.ts の 2 本である」が
 *   `deepEqual` で要素数 2 に固定しているため、1 行足すとこのテストが落ちる
 *   （2026-08-19 実測）。無力化するには自己テストの書き換えも要る。この構えは、
 *   本体検査と自己テストを合わせても、最終的には人手のレビューに依存している
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
import {
  findMissingPaths,
  findEmptyScanDimensions,
  listRepoFiles,
  diffTargets,
} from "./lib/scan-targets.mjs";

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

/**
 * `new WebSocket(` の字面。空白の揺れと `globalThis.` / `window.` / `self.` の修飾
 * アクセスを吸収する（2026-08-19 レビュー I2。`window.WebSocket` は回避策ではなく
 * 普通の書き方であるため）。**別名束縛・`Reflect.construct` は引き続き見逃す**
 * （ファイル冒頭「何を見ていないか」参照）。
 */
const WS_CONSTRUCTION = /new\s+(?:globalThis\.|window\.|self\.)?WebSocket\s*\(/;

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
 * "react-dom/client";` で実測。回帰は自己テストで固定している）。複数セグメントの
 * needle（例: `sync/client`）は `sync/client` という綴りが無関係な specifier に
 * 紛れ込む可能性が低いため、前方の区切りは問わない。
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

/**
 * `apps/*-web` の実体を、宣言（`WEB_APPS`）から独立に導出する（ADR-0014 決定 1）。
 *
 * **`apps/` を readdir して `-web` で終わるものを拾う導出にしてはならない**
 * （`docs/adr/0014` 決定 3 の MUST NOT 相当。readdir は未追跡ディレクトリも拾い、
 * ローカルと CI で見えるものが食い違いうる）。`package.json` の実在を「web アプリで
 * ある」の代理指標にし、`listRepoFiles` の git 由来の列挙に統一する。
 *
 * pathspec の `*` は `/` を跨ぐため、`apps/*-web/package.json` は理論上より深い
 * 一致（例: `apps/timer-web/vendor/foo-web/package.json`）も返しうる。返ってきた
 * 相対パスを **1 階層限定の正規表現で絞り込む**ことで、pathspec の挙動そのものには
 * 依存せず結果を確定させる。
 */
function listWebAppDirs() {
  const candidates = listRepoFiles(REPO_ROOT, ["apps/*-web/package.json"]);
  return candidates
    .filter((rel) => /^apps\/[^/]+-web\/package\.json$/.test(rel))
    .map((rel) => rel.slice(0, -"/package.json".length))
    .sort();
}

/**
 * `src` 配下の `.ts` / `.tsx` / `.js` / `.jsx` を git 由来で集め、`app` からの相対パスに直す。
 *
 * **読む前に実在を確認する。** 追跡下のファイルは、作業ツリーから消えても
 * `git ls-files` には残る（コミットしていない削除）。ここで存在確認をせず
 * `readFileSync` すると生の `ENOENT` で落ち、`findMissingPaths` が組み立てるはずの
 * 「宣言したパスが見つかりません」という名指しのメッセージが一度も出ない
 * （2026-08-19 レビュー I3）。存在しないファイルは `missing` として返し、`main()` が
 * 名指しで報告してから正常に終了コードを決める。
 */
function readAppFiles(app) {
  // `**` は使わない（docstring 参照。`src` 直下を落とす）。
  const rels = listRepoFiles(REPO_ROOT, [
    `${app.app}/src/*.ts`,
    `${app.app}/src/*.tsx`,
    `${app.app}/src/*.js`,
    `${app.app}/src/*.jsx`,
  ]);
  const files = [];
  const missing = [];
  for (const rel of rels) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) {
      missing.push(rel.slice(app.app.length + 1));
      continue;
    }
    files.push({ path: rel.slice(app.app.length + 1), lines: fs.readFileSync(abs, "utf8").split("\n") });
  }
  return { files, missing };
}

function main() {
  const problems = [];
  const volume = [];

  // 検査 0: 宣言と実体の全単射照合（ADR-0014 決定 1）。片方向だけだと、
  // 新設した web アプリが宣言に載らないまま無検査で素通りする。
  const appDrift = diffTargets(WEB_APPS.map((a) => a.app), listWebAppDirs());
  volume.push({ label: "web アプリ", count: WEB_APPS.length });
  for (const m of appDrift.missing) {
    problems.push(
      `[宣言と実体のずれ] 宣言した web アプリが見つかりません: ${m}    ← 移設したなら宣言を直す`,
    );
  }
  for (const u of appDrift.unexpected) {
    problems.push(
      `[宣言と実体のずれ] 実在する web アプリが WEB_APPS に宣言されていません: ${u}    ← 対象に入れるか、理由つきで除外する`,
    );
  }

  // 検査 3: 宣言の実在（`docs/adr/0014` 決定 7）。共有関数を使う（自前の existsSync を書かない）。
  const missingDeclared = findMissingPaths(REPO_ROOT, WEB_APPS.flatMap(declaredPathsOf));
  for (const m of missingDeclared) {
    problems.push(`[宣言の実在] 宣言したパスが見つかりません: ${m}    ← 移設したなら宣言を直す`);
  }

  // 各アプリの走査対象ファイルを 1 回だけ読む。存在しない追跡ファイルは名指しで報告する（I3）。
  const filesByApp = new Map();
  for (const app of WEB_APPS) {
    const { files, missing } = readAppFiles(app);
    filesByApp.set(app.app, files);
    volume.push({ label: `${app.app} の src`, count: files.length });
    for (const m of missing) {
      problems.push(
        `[走査対象の実体] ${app.app}/${m} が見つかりません（git の追跡下だが作業ツリーに無い）` +
          `    ← 復元するか git rm で追跡から外す`,
      );
    }
  }

  // 検査 1: 許可リスト。main が判定の呼び出しを持つことは scan-target-wiring.test.mjs の
  // 配線テストで見る（#167 レビュー C1）。
  const importerProblems = WEB_APPS.flatMap((app) =>
    findDisallowedImporters(filesByApp.get(app.app), app).map(
      (hit) =>
        `[許可リスト] ${app.app}/${hit.path}:${hit.line} は同期クライアントを import しています。` +
        `許可されているのは ${app.allowedImporters.join(" / ") || "（なし）"} だけです → ${hit.text}`,
    ),
  );
  problems.push(...importerProblems);

  // 検査 2: WS の保持先。同上。
  const wsHolderProblems = WEB_APPS.flatMap((app) =>
    findDisallowedWsHolders(filesByApp.get(app.app), app).map(
      (hit) =>
        `[WS の保持先] ${app.app}/${hit.path}:${hit.line} が WebSocket を直接生成しています。` +
        `許可されているのは ${app.wsHolders.join(" / ")} だけです → ${hit.text}`,
    ),
  );
  problems.push(...wsHolderProblems);

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
