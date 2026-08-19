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

test("実在確認は共有関数 findMissingPaths に渡す形になっている", () => {
  // 実在確認そのものは scripts/lib/scan-targets.mjs の責務なので、ここでは
  // 「渡す入力が正しいか」だけを見る。自前で existsSync を書くと、
  // scan-target-wiring.test.mjs が見ている配線から外れる（#158 と同型）。
  const paths = WEB_APPS.flatMap(declaredPathsOf);
  assert.ok(paths.includes("apps/poker-web/src/hooks/useSync.ts"));
  assert.ok(paths.includes("apps/timer-web/src/sync/use-timer-sync.ts"));
});

test("WEB_APPS は timer と poker の両方を宣言している（片側検査を避ける）", () => {
  const apps = WEB_APPS.map((a) => a.app).sort();
  assert.deepEqual(apps, ["apps/poker-web", "apps/timer-web"]);
});

test("すべてのアプリが WebSocket の保持先を 1 つ以上宣言している", () => {
  for (const app of WEB_APPS) {
    assert.ok(app.wsHolders.length > 0, `${app.app} が wsHolders を宣言していない`);
  }
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
