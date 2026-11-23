/**
 * `scripts/lib/layer-direction.mjs`（web 層と同期サーバーの層の向きの許可リスト・#592）の単体テスト。
 *
 * 合成したファイルの集合で、違反の入力は赤・許される入力は緑になることを固定する。
 * 実リポジトリでの配線（監査 `audit-dependency-direction.mjs` から呼ばれていること・いまの木が緑であること）は
 * `wiring-audit-dependency-direction.test.mjs` が見る。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractSpecifiers,
  findLayerViolations,
  findStaleIoFiles,
  isDeclaredEntry,
  exportKeys,
  layerOfFile,
  WEB_IO_FILES,
  LAYER_ALLOWED,
} from "./layer-direction.mjs";

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
  assert.equal(layerOfFile(`${APP}/src/useThing.tsx`, CTX), "web/hook"); // use で始まる名前は拡張子によらず同期フック
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

test("層の判定: 同期サーバーは ports・application・adapters に分け、組み立て（src 直下・assembly/）は、読み元としては何を読んでもよい", () => {
  assert.equal(layerOfFile("apps/tasuki-sync/src/ports/p.ts", CTX), "sync/ports");
  assert.equal(layerOfFile("apps/tasuki-sync/src/application/a.ts", CTX), "sync/application");
  assert.equal(layerOfFile("apps/tasuki-sync/src/adapters/ws/g.ts", CTX), "sync/adapters");
  assert.equal(layerOfFile("apps/tasuki-sync/src/server.ts", CTX), "sync/assembly");
  assert.equal(layerOfFile("apps/tasuki-sync/src/assembly/timer.ts", CTX), "sync/assembly");
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

test("純粋判断が同期クライアントの値を読むと赤、型だけ（import type）は緑（A4 の読み）", () => {
  // 接続状態の型の正本は sync-client で、web アプリが書き直すのは audit-web-sync-boundary が止める。
  // 型だけの import は実行時の依存を持たないので、純粋判断にだけ許す
  const vs = check({
    [`${APP}/src/plan.ts`]: "import { delay } from '@tasuki/sync-client';",
    [`${APP}/src/view.ts`]: "import type { S } from '@tasuki/sync-client';",
    [`${APP}/src/mixed.ts`]: "import { type S, delay } from '@tasuki/sync-client';",
  });
  assert.deepEqual(brief(vs), [
    `layer ${APP}/src/mixed.ts:1 -> @tasuki/sync-client`,
    `layer ${APP}/src/plan.ts:1 -> @tasuki/sync-client`,
  ]);
});

test("型だけの許しは純粋判断の同期クライアントだけ。画面・application の型の逆流は型でも赤", () => {
  const vs = check({
    [`${APP}/src/Screen.tsx`]: "import type { S } from '@tasuki/sync-client';",
    "apps/tasuki-sync/src/application/a.ts": "import type { P } from '../adapters/g';",
    "apps/tasuki-sync/src/adapters/g.ts": "export type P = 1;",
  });
  assert.deepEqual(brief(vs), [
    `layer ${APP}/src/Screen.tsx:1 -> @tasuki/sync-client`,
    "layer apps/tasuki-sync/src/application/a.ts:1 -> apps/tasuki-sync/src/adapters/g.ts",
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
  // ADR 0015 の追記の実測の 14 本に、うちわけ（#476）の 2 本（router.ts・platform/timezone.ts）を足した
  assert.equal(WEB_IO_FILES.size, 16);
});

test("純粋判断と端末 I/O が react・react-dom（サブパス含む）・partysocket を読むと赤", () => {
  const vs = check({
    [`${APP}/src/a.ts`]: "import { useState } from 'react';",
    [`${APP}/src/b.ts`]: "import { createRoot } from 'react-dom/client';",
    [`${APP}/src/c.ts`]: "import X from 'partysocket';",
    [`${APP}/src/d.ts`]: "import { jsx } from 'react/jsx-runtime';",
    [`${APP}/src/storage/saved.ts`]: "import { useState } from 'react';",
  });
  assert.deepEqual(brief(vs), [
    `external ${APP}/src/a.ts:1 -> react`,
    `external ${APP}/src/b.ts:1 -> react-dom/client`,
    `external ${APP}/src/c.ts:1 -> partysocket`,
    `external ${APP}/src/d.ts:1 -> react/jsx-runtime`,
    `external ${APP}/src/storage/saved.ts:1 -> react`,
  ]);
});

test("react は画面・同期フックなら緑。react-dom-extra のような別名の外部パッケージは止めない", () => {
  const vs = check({
    [`${APP}/src/Screen.tsx`]: "import { useState } from 'react';",
    [`${APP}/src/hooks/useX.ts`]: "import { useState } from 'react';\nimport P from 'partysocket';",
    [`${APP}/src/view.ts`]: "import x from 'react-dom-extra';\nimport y from 'reactive';",
  });
  assert.deepEqual(brief(vs), []);
});

test("層の判定: sync/・hooks/ の下でも use で始まらない .ts は純粋判断（名前の規則だけで倒す）", () => {
  assert.equal(layerOfFile(`${APP}/src/sync/snapshot-intents.ts`, CTX), "web/pure");
  assert.equal(layerOfFile(`${APP}/src/sync/app-mode.ts`, CTX), "web/pure");
  assert.equal(layerOfFile(`${APP}/src/hooks/helper.ts`, CTX), "web/pure");
  assert.equal(layerOfFile(`${APP}/src/sync/use-thing.ts`, CTX), "web/hook");
});

test("純粋なファイルが sync/ の下にあっても、同期クライアントの値を読めば赤（同期フックの扱いにしない）", () => {
  const vs = check({
    [`${APP}/src/sync/snapshot-intents.ts`]: "import { delay } from '@tasuki/sync-client';",
    [`${APP}/src/sync/use-sync.ts`]: "import { delay } from '@tasuki/sync-client';",
    [`${APP}/src/ui/useBox.tsx`]: "import { delay } from '@tasuki/sync-client';",
  });
  assert.deepEqual(brief(vs), [`layer ${APP}/src/sync/snapshot-intents.ts:1 -> @tasuki/sync-client`]);
});

test("行コメントの中の /* や文字列の中の /* で、後ろの import が消えない", () => {
  const vs = check({
    [`${APP}/src/a.ts`]: "// 画面は components/*.tsx に置く\nimport type { X } from './Screen';\n",
    [`${APP}/src/b.ts`]: "const g = \"a/*b\";\nimport type { Y } from './Screen';\nconst h = \"*/\";\n",
    [`${APP}/src/c.ts`]: "const t = `x/*y`;\nimport type { Z } from './Screen';\n",
    [`${APP}/src/Screen.tsx`]: "export type X = 1; export type Y = 1; export type Z = 1;",
  });
  assert.deepEqual(brief(vs), [
    `layer ${APP}/src/a.ts:2 -> ${APP}/src/Screen.tsx`,
    `layer ${APP}/src/b.ts:2 -> ${APP}/src/Screen.tsx`,
    `layer ${APP}/src/c.ts:2 -> ${APP}/src/Screen.tsx`,
  ]);
});

test("extractSpecifiers: 行番号・型だけ・再 export・動的 import を取る", () => {
  const got = extractSpecifiers(
    [
      "import a from 'a';",
      "import type { B } from 'b';",
      "import { type C, d } from 'c';",
      "export type { E } from 'e';",
      "export { F } from 'f';",
      "import 'g';",
      "const h = await import('h');",
      "// import x from 'comment';",
      "const s = \"import y from 'string'\";",
    ].join("\n"),
    "x.ts",
  );
  assert.deepEqual(got, [
    { spec: "a", line: 1, typeOnly: false },
    { spec: "b", line: 2, typeOnly: true },
    { spec: "c", line: 3, typeOnly: false },
    { spec: "e", line: 4, typeOnly: true },
    { spec: "f", line: 5, typeOnly: false },
    { spec: "g", line: 6, typeOnly: false },
    { spec: "h", line: 7, typeOnly: false },
  ]);
});

test("export type { … } from は import type と同じく型だけ。export { … } from は値", () => {
  const vs = check({
    [`${APP}/src/ok.ts`]: "export type { S } from '@tasuki/sync-client';",
    [`${APP}/src/bad.ts`]: "export { S } from '@tasuki/sync-client';",
  });
  assert.deepEqual(brief(vs), [`layer ${APP}/src/bad.ts:1 -> @tasuki/sync-client`]);
});

test("解決できない相対 import は赤（黙って飛ばさない）。css などの追跡下のファイルは緑", () => {
  const vs = check({
    [`${APP}/src/a.ts`]: "import './missing';\nimport './style.css';\nimport u from './x.svg?url';",
    [`${APP}/src/style.css`]: "",
    [`${APP}/src/x.svg`]: "",
  });
  assert.deepEqual(brief(vs), [`unresolved ${APP}/src/a.ts:1 -> ./missing`]);
});

test("同期サーバーの ports・application・adapters が組み立て（assembly/・src 直下）を読むと赤。組み立てから内側は緑", () => {
  const vs = check({
    "apps/tasuki-sync/src/application/a.ts": "import { c } from '../config';",
    "apps/tasuki-sync/src/adapters/b.ts": "import { m } from '../assembly/timer';",
    "apps/tasuki-sync/src/ports/p.ts": "import { s } from '../create-sync-server';",
    "apps/tasuki-sync/src/config.ts": "export const c = 1;",
    "apps/tasuki-sync/src/assembly/timer.ts": "import { a } from '../application/a';\nexport const m = a;",
    "apps/tasuki-sync/src/create-sync-server.ts": "import { b } from './adapters/b';\nexport const s = b;",
  });
  assert.deepEqual(brief(vs), [
    "layer apps/tasuki-sync/src/adapters/b.ts:1 -> apps/tasuki-sync/src/assembly/timer.ts",
    "layer apps/tasuki-sync/src/application/a.ts:1 -> apps/tasuki-sync/src/config.ts",
    "layer apps/tasuki-sync/src/ports/p.ts:1 -> apps/tasuki-sync/src/create-sync-server.ts",
  ]);
});

test("exportKeys: 文字列・条件の map（. を持たない）は入口 . だけ、サブパスの map はそのキー", () => {
  assert.deepEqual([...exportKeys("./src/index.ts")], ["."]);
  assert.deepEqual([...exportKeys({ types: "./a.d.ts", default: "./a.js" })], ["."]);
  assert.deepEqual([...exportKeys({ ".": "./a.js", "./x": "./x.js" })].sort(), [".", "./x"]);
  assert.equal(exportKeys(undefined), undefined);
});

test("isDeclaredEntry: 完全一致と * のワイルドカード（./* は ./x も ./x/y も）", () => {
  const keys = new Set([".", "./a", "./lib/*"]);
  assert.equal(isDeclaredEntry(keys, "."), true);
  assert.equal(isDeclaredEntry(keys, "./a"), true);
  assert.equal(isDeclaredEntry(keys, "./b"), false);
  assert.equal(isDeclaredEntry(keys, "./lib/x"), true);
  assert.equal(isDeclaredEntry(keys, "./lib/x/y"), true);
  assert.equal(isDeclaredEntry(keys, "./lib"), false);
  assert.equal(isDeclaredEntry(keys, "./other/xyzxyz"), false);
  assert.equal(isDeclaredEntry(new Set(["./*"]), "./anything"), true);
});

test("型の位置の import('…')（import type 式・typeof import）は型だけの指定子として取る", () => {
  const got = extractSpecifiers(
    [
      "type A = import('./a').X;",
      "let b: typeof import('./b');",
      "function f(c: import('./c').Y) {}",
    ].join("\n"),
    "x.ts",
  );
  assert.deepEqual(got, [
    { spec: "./a", line: 1, typeOnly: true },
    { spec: "./b", line: 2, typeOnly: true },
    { spec: "./c", line: 3, typeOnly: true },
  ]);
});

test("import S = require('…') は値の指定子として取る", () => {
  assert.deepEqual(extractSpecifiers("import S = require('./s');", "x.ts"), [{ spec: "./s", line: 1, typeOnly: false }]);
});

test("型の位置の import('…') で画面の型を読む辺・require で読む辺も赤になる", () => {
  const vs = check({
    [`${APP}/src/a.ts`]: "type T = import('./Screen').X;",
    [`${APP}/src/b.ts`]: "import S = require('./Screen');",
    [`${APP}/src/Screen.tsx`]: "export type X = 1;",
  });
  assert.deepEqual(brief(vs), [
    `layer ${APP}/src/a.ts:1 -> ${APP}/src/Screen.tsx`,
    `layer ${APP}/src/b.ts:1 -> ${APP}/src/Screen.tsx`,
  ]);
});
