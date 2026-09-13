/**
 * audit-web-sync-boundary の自己テスト。
 *
 * 判定は純粋関数に切り出してあるので、実ファイルを置かずに検査できる。
 * CI は scripts/*.test.mjs を git から導出して走らせる（列挙をハードコードしない）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  WEB_APPS,
  findDisallowedImporters,
  findDisallowedWsHolders,
  declaredPathsOf,
  listWebAppDirs,
} from "./audit-web-sync-boundary.mjs";

const timerApp = {
  app: "apps/timer-web",
  syncModules: ["src/sync/client.ts"],
  allowedImporters: ["src/sync/use-timer-sync.ts"],
  wsHolders: ["src/sync/client.ts"],
};

test("許可されたファイルの import は違反にならない", () => {
  const files = [
    { path: "src/sync/use-timer-sync.ts", lines: ['import { SyncClient } from "./client.js";'] },
  ];
  assert.deepEqual(findDisallowedImporters(files, timerApp), []);
});

test("許可されていないファイルの import は違反になる", () => {
  const files = [{ path: "src/App.tsx", lines: ['import { SyncClient } from "./sync/client.js";'] }];
  const found = findDisallowedImporters(files, timerApp);
  assert.equal(found.length, 1);
  assert.equal(found[0].path, "src/App.tsx");
});

test("コメント行に書かれた import も違反として拾う（緑へ倒さない）", () => {
  const files = [{ path: "src/App.tsx", lines: ['// かつては ./sync/client.js を import していた'] }];
  assert.equal(findDisallowedImporters(files, timerApp).length, 1);
});

test("拡張子を省いた import 指定でも当たる", () => {
  const files = [{ path: "src/App.tsx", lines: ['import x from "./sync/client";'] }];
  assert.equal(findDisallowedImporters(files, timerApp).length, 1);
});

test("無関係な行は違反にならない", () => {
  const files = [{ path: "src/App.tsx", lines: ["const client = useTimerSync(banner);"] }];
  assert.deepEqual(findDisallowedImporters(files, timerApp), []);
});

test("許可されていないファイルの new WebSocket は違反になる", () => {
  const files = [{ path: "src/ui/Session.tsx", lines: ["const ws = new WebSocket(url);"] }];
  const found = findDisallowedWsHolders(files, timerApp);
  assert.equal(found.length, 1);
  assert.equal(found[0].path, "src/ui/Session.tsx");
});

test("宣言した保持先の new WebSocket は違反にならない", () => {
  const files = [{ path: "src/sync/client.ts", lines: ["this.ws = new WebSocket(this.options.url);"] }];
  assert.deepEqual(findDisallowedWsHolders(files, timerApp), []);
});

test("宣言から導出するパスは、アプリ本体と 3 種の宣言を repo 相対で並べる", () => {
  assert.deepEqual(declaredPathsOf(timerApp), [
    "apps/timer-web",
    "apps/timer-web/src/sync/client.ts",
    "apps/timer-web/src/sync/use-timer-sync.ts",
    "apps/timer-web/src/sync/client.ts",
  ]);
});

test("declaredPathsOf の出力に timer/poker 双方の宣言パスが含まれている（findMissingPaths への入力の形を見る）", () => {
  // ここで見ているのは「渡す入力の形」だけであり、findMissingPaths を実際に
  // 呼んでいるかどうか（main() への配線）はこのテストの範囲外である。
  // 自前で existsSync を書くと scan-target-wiring.test.mjs が見ている配線から
  // 外れる（#158 と同型）という注意はここでも成り立つが、**main() が
  // findMissingPaths を実際に呼び、その結果を報告しているかは
  // scripts/scan-target-wiring.test.mjs の「実在確認の配線」describe が見る**
  // （2026-08-19 レビュー C2。このテストの名前がかつて配線の検証を約束していたが
  // 実際には検証していなかったため改名した）。
  const paths = WEB_APPS.flatMap(declaredPathsOf);
  assert.ok(paths.includes("apps/poker-web/src/hooks/useSync.ts"));
  assert.ok(paths.includes("apps/timer-web/src/sync/use-timer-sync.ts"));
});

test("WEB_APPS は 3 つの web アプリすべてを宣言している（片側検査を避ける）", () => {
  const apps = WEB_APPS.map((a) => a.app).sort();
  assert.deepEqual(apps, ["apps/landing", "apps/poker-web", "apps/timer-web"]);
});

test("wsHolders が空の宣言は「どこにも書いてはいけない」を意味する", () => {
  // Given: 保持先を 1 つも宣言していないアプリ（#95 S5a の apps/landing がこれに当たる。
  //        接続の実体は @tasuki/sync-client にあり、そのアプリの src は WS を持たない）
  const app = { app: "apps/landing", syncModules: [], allowedImporters: [], wsHolders: [] };
  const files = [{ path: "src/App.tsx", lines: ["  const ws = new WebSocket(url);"] }];

  // When / Then: 空の宣言は弱い宣言ではなく、最も強い禁止である。
  //              「1 つ以上宣言していること」を求める形にすると、この意味を表せない
  assert.equal(findDisallowedWsHolders(files, app).length, 1);
});

test("timer-web の allowedImporters は同期フックと dispatch.ts の 2 本である", () => {
  // dispatch.ts は同期クライアント自身の実装の一部（client.ts が dispatch.ts を import
  // する側であり、消費者ではない）。import しているのも import type のみ。
  // 本体 audit-web-sync-boundary.mjs のファイル冒頭 docstring を参照。
  const timer = WEB_APPS.find((a) => a.app === "apps/timer-web");
  assert.deepEqual(
    [...timer.allowedImporters].sort(),
    ["src/sync/dispatch.ts", "src/sync/use-timer-sync.ts"].sort(),
  );
});

test("末尾だけが一致する無関係な bare specifier は違反にならない（react-dom/client の回帰）", () => {
  // apps/timer-web/src/main.tsx の import { createRoot } from "react-dom/client"; を
  // 「sync/client.ts の import」と誤検出していたバグの回帰ケース（2026-08-19 レビュー M5）。
  // 単一セグメントの needle "client" は "./" の直後だけを見るため、bare specifier の
  // 末尾セグメントには一致しない。この回帰を守っているのが main.tsx の現物の import
  // だけだと、main.tsx が変わった日に守りが消えるため、ここで直接固定する。
  const files = [
    { path: "src/main.tsx", lines: ['import { createRoot } from "react-dom/client";'] },
  ];
  assert.deepEqual(findDisallowedImporters(files, timerApp), []);
});

test("実体の導出は apps/landing を web アプリとして返す", () => {
  // Given: リポジトリの実体（宣言ではない）
  // When: 走査対象を導出する
  const dirs = listWebAppDirs();

  // Then: 名前が -web で終わらない LP も web アプリとして返る（ADR-0019・設計正本 §3.10）。
  //       名前の綴りに依存した導出は、規約から外れた名前が現れた瞬間に静かに空振りする。
  assert.ok(dirs.includes("apps/landing"), `実体: ${dirs.join(" / ")}`);
});

test("実体の導出は同期サーバーを web アプリとして返さない", () => {
  // Given / When: 実体の導出
  const dirs = listWebAppDirs();

  // Then: apps 配下でもブラウザで開く入口を持たないものは web 層の射程外である
  assert.ok(!dirs.includes("apps/tasuki-sync"), `実体: ${dirs.join(" / ")}`);
});
