/**
 * `scripts/lib/layer-direction.mjs`（web 層と同期サーバーの層の向きの許可リスト・#592）の単体テスト。
 *
 * 合成したファイルの集合で、違反の入力は赤・許される入力は緑になることを固定する。
 * 実リポジトリでの配線（監査 `audit-dependency-direction.mjs` から呼ばれていること・いまの木が緑であること）は
 * `wiring-audit-dependency-direction.test.mjs` が見る。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { findLayerViolations, findStaleIoFiles, layerOfFile, WEB_IO_FILES, LAYER_ALLOWED } from "./layer-direction.mjs";

const APP = "apps/demo-web";
const CTX = {
  webApps: new Set([APP]),
  ioFiles: new Set([`${APP}/src/storage/saved.ts`]),
  nameToDir: new Map([
    ["@tasuki/room-core", "packages/room-core"],
    ["@tasuki/protocol", "packages/protocol"],
    ["@tasuki/sync-client", "packages/sync-client"],
    ["@tasuki/ui", "packages/ui"],
    ["@tasuki/web-kit", "packages/web-kit"],
    ["@tasuki/timer-core", "packages/timer-core"],
  ]),
  // package.json の exports に宣言されたサブパス。`.` は常に入口
  exportsOf: new Map([
    ["packages/web-kit", new Set([".", "./sync", "./room", "./reader"])],
    ["packages/timer-core", new Set([".", "./aggregate"])],
  ]),
};

/** 合成したファイルの集合を検査する（追跡下の集合は files のキーそのもの） */
function check(files) {
  const map = new Map(Object.entries(files));
  return findLayerViolations(map, { ...CTX, tracked: new Set(map.keys()) });
}
const brief = (vs) => vs.map((v) => `${v.rule} ${v.file}:${v.line} -> ${v.to}`);

test("層の判定: 拡張子と置き場で web の層に分ける", () => {
  assert.equal(layerOfFile(`${APP}/src/Screen.tsx`, CTX), "web/screen");
  assert.equal(layerOfFile(`${APP}/src/view.ts`, CTX), "web/pure");
  assert.equal(layerOfFile(`${APP}/src/hooks/useX.ts`, CTX), "web/hook");
  assert.equal(layerOfFile(`${APP}/src/sync/dispatch.ts`, CTX), "web/hook");
  assert.equal(layerOfFile(`${APP}/src/use-thing.ts`, CTX), "web/hook");
  assert.equal(layerOfFile(`${APP}/src/storage/saved.ts`, CTX), "web/io");
});

test("層の判定: テスト・型宣言・src の外・web でないパッケージは見ない", () => {
  assert.equal(layerOfFile(`${APP}/src/view.test.ts`, CTX), null);
  assert.equal(layerOfFile(`${APP}/tests/view.test.tsx`, CTX), null);
  assert.equal(layerOfFile(`${APP}/src/vite-env.d.ts`, CTX), null);
  assert.equal(layerOfFile(`${APP}/vite.config.ts`, CTX), null);
  assert.equal(layerOfFile("packages/room-core/src/x.ts", CTX), null);
});

test("層の判定: 同期サーバーは ports・application・adapters に分け、組み立て（src 直下）は見ない", () => {
  assert.equal(layerOfFile("apps/tasuki-sync/src/ports/p.ts", CTX), "sync/ports");
  assert.equal(layerOfFile("apps/tasuki-sync/src/application/a.ts", CTX), "sync/application");
  assert.equal(layerOfFile("apps/tasuki-sync/src/adapters/ws/g.ts", CTX), "sync/adapters");
  assert.equal(layerOfFile("apps/tasuki-sync/src/server.ts", CTX), null);
});

test("許される向きは緑: 画面→同期フック・純粋判断・ドメイン・web-kit/room・ui", () => {
  const vs = check({
    [`${APP}/src/Screen.tsx`]: [
      "import { useX } from './hooks/useX';",
      "import { view } from './view';",
      "import { MAX } from '@tasuki/room-core';",
      "import { Room } from '@tasuki/web-kit/room';",
      "import { Button } from '@tasuki/ui';",
      "import { load } from './storage/saved';",
    ].join("\n"),
    [`${APP}/src/hooks/useX.ts`]: "export const useX = 1;",
    [`${APP}/src/view.ts`]: "export const view = 1;",
    [`${APP}/src/storage/saved.ts`]: "export const load = 1;",
  });
  assert.deepEqual(brief(vs), []);
});

test("許される向きは緑: 純粋判断→ドメイン・protocol、同期フック→sync-client・web-kit/sync", () => {
  const vs = check({
    [`${APP}/src/view.ts`]: "import { A } from '@tasuki/room-core';\nimport { B } from '@tasuki/protocol';",
    [`${APP}/src/hooks/useX.ts`]: "import { C } from '@tasuki/sync-client';\nimport { D } from '@tasuki/web-kit/sync';",
  });
  assert.deepEqual(brief(vs), []);
});

test("純粋判断が画面（.tsx）を読むと赤（型だけの import でも赤）", () => {
  const vs = check({
    [`${APP}/src/status.ts`]: "import type { State } from './components/Strip';",
    [`${APP}/src/components/Strip.tsx`]: "export type State = 'a';",
  });
  assert.deepEqual(brief(vs), [`layer ${APP}/src/status.ts:1 -> ${APP}/src/components/Strip.tsx`]);
  assert.equal(vs[0].fromLayer, "web/pure");
  assert.equal(vs[0].toLayer, "web/screen");
});

test("同期フックが画面を読むと赤", () => {
  const vs = check({
    [`${APP}/src/sync/use-sync.ts`]: "import type { End } from '../ui/Summary';",
    [`${APP}/src/ui/Summary.tsx`]: "export type End = 'a';",
  });
  assert.deepEqual(brief(vs), [`layer ${APP}/src/sync/use-sync.ts:1 -> ${APP}/src/ui/Summary.tsx`]);
});

test("純粋判断が同期クライアントを読むと赤（値でも型でも）", () => {
  const vs = check({
    [`${APP}/src/plan.ts`]: "import { delay } from '@tasuki/sync-client';",
    [`${APP}/src/view.ts`]: "import type { S } from '@tasuki/sync-client';",
  });
  assert.deepEqual(brief(vs), [
    `layer ${APP}/src/plan.ts:1 -> @tasuki/sync-client`,
    `layer ${APP}/src/view.ts:1 -> @tasuki/sync-client`,
  ]);
});

test("純粋判断が端末 I/O の層を読むと赤、画面と同期フックは読んでよい", () => {
  const vs = check({
    [`${APP}/src/copy.ts`]: "import { MAX } from './storage/saved';",
    [`${APP}/src/storage/saved.ts`]: "export const MAX = 1;",
    [`${APP}/src/hooks/useX.ts`]: "import { MAX } from '../storage/saved';",
  });
  assert.deepEqual(brief(vs), [`layer ${APP}/src/copy.ts:1 -> ${APP}/src/storage/saved.ts`]);
});

test("画面が同期クライアントを直接読むと赤", () => {
  const vs = check({ [`${APP}/src/Screen.tsx`]: "import { x } from '@tasuki/sync-client';" });
  assert.deepEqual(brief(vs), [`layer ${APP}/src/Screen.tsx:1 -> @tasuki/sync-client`]);
});

test("application が adapters を読むと赤（型だけでも）、adapters が application を読むのは緑", () => {
  const vs = check({
    "apps/tasuki-sync/src/application/log/vocabulary.ts": "import type { P } from '../../adapters/ws/gate';",
    "apps/tasuki-sync/src/adapters/ws/gate.ts": "import { t } from '../../application/tool-id';",
    "apps/tasuki-sync/src/application/tool-id.ts": "export const t = 1;",
  });
  assert.deepEqual(brief(vs), [
    "layer apps/tasuki-sync/src/application/log/vocabulary.ts:1 -> apps/tasuki-sync/src/adapters/ws/gate.ts",
  ]);
});

test("ports がアプリケーションを読むと赤", () => {
  const vs = check({
    "apps/tasuki-sync/src/ports/p.ts": "import { a } from '../application/a';",
    "apps/tasuki-sync/src/application/a.ts": "export const a = 1;",
  });
  assert.equal(vs.length, 1);
  assert.equal(vs[0].fromLayer, "sync/ports");
});

test("package.json の exports に無いサブパスは赤、宣言のあるサブパスと本体は緑", () => {
  const vs = check({
    [`${APP}/src/a.ts`]: "import { x } from '@tasuki/timer-core/aggregate';\nimport { y } from '@tasuki/timer-core/internal';\nimport { z } from '@tasuki/timer-core';",
  });
  assert.deepEqual(brief(vs), [`deep-import ${APP}/src/a.ts:2 -> @tasuki/timer-core/internal`]);
});

test("入口外の参照は層に属さないファイルでも見る（製品コードの全部）", () => {
  const vs = check({ "packages/ui/src/x.ts": "import { y } from '@tasuki/timer-core/internal';" });
  assert.deepEqual(brief(vs), ["deep-import packages/ui/src/x.ts:1 -> @tasuki/timer-core/internal"]);
});

test("テストは見ない（層も入口も）", () => {
  const vs = check({
    [`${APP}/src/view.test.ts`]: "import { x } from '@tasuki/sync-client';\nimport { y } from './Screen';",
    [`${APP}/src/Screen.tsx`]: "export const y = 1;",
    "apps/tasuki-sync/test/a.test.ts": "import { z } from '@tasuki/timer-core/internal';",
  });
  assert.deepEqual(brief(vs), []);
});

test("コメントの中の import は見ない", () => {
  const vs = check({
    [`${APP}/src/view.ts`]: "// import { x } from '@tasuki/sync-client';\n/* import { y } from './Screen'; */\nexport const v = 1;",
    [`${APP}/src/Screen.tsx`]: "export const y = 1;",
  });
  assert.deepEqual(brief(vs), []);
});

test("再 export（export ... from）も読む辺として数える", () => {
  const vs = check({
    [`${APP}/src/view.ts`]: "export { y } from './Screen';",
    [`${APP}/src/Screen.tsx`]: "export const y = 1;",
  });
  assert.deepEqual(brief(vs), [`layer ${APP}/src/view.ts:1 -> ${APP}/src/Screen.tsx`]);
});

test("許可表にない層を読んだ場合（未知の @tasuki パッケージ）も赤に倒す", () => {
  const ctx = { ...CTX, nameToDir: new Map([...CTX.nameToDir, ["@tasuki/new-lib", "packages/new-lib"]]) };
  const files = new Map([[`${APP}/src/view.ts`, "import { n } from '@tasuki/new-lib';"]]);
  const vs = findLayerViolations(files, { ...ctx, tracked: new Set(files.keys()) });
  assert.deepEqual(brief(vs), [`layer ${APP}/src/view.ts:1 -> @tasuki/new-lib`]);
});

test("I/O の宣言が実在しないファイルを指していたら陳腐化として返す", () => {
  const tracked = new Set([`${APP}/src/storage/saved.ts`]);
  assert.deepEqual(findStaleIoFiles(new Set([`${APP}/src/storage/saved.ts`, `${APP}/src/gone.ts`]), tracked), [`${APP}/src/gone.ts`]);
  assert.deepEqual(findStaleIoFiles(new Set([`${APP}/src/storage/saved.ts`]), tracked), []);
});

test("宣言の形: 許可表は ADR 0015 の追記の行を持ち、I/O の宣言は web アプリの src の .ts だけ", () => {
  assert.deepEqual(Object.keys(LAYER_ALLOWED).sort(), [
    "sync/adapters",
    "sync/application",
    "sync/ports",
    "web/hook",
    "web/io",
    "web/pure",
    "web/screen",
  ]);
  for (const f of WEB_IO_FILES) assert.match(f, /^apps\/[^/]+\/src\/.+\.ts$/, f);
  assert.equal(WEB_IO_FILES.size, 14);
});
