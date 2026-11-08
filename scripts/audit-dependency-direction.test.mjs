/**
 * `scripts/audit-dependency-direction.mjs` の単体テスト。
 *
 * 判定は純粋関数（{@link findViolations}）に寄せてあるので、ファイルシステムを
 * 触らずに合成した観測結果で見る。**実リポジトリでの配線**（宣言と 0 件ガード）は
 * `wiring-audit-dependency-direction.test.mjs` が、走査量の出力と CI への配線は `scan-target-wiring.test.mjs` と
 * `entry-point-wiring.test.mjs` が導出で拾う。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  observe,
  TEST_ONLY,
  findViolations,
  findInvalidExclusions,
  ALLOWED,
  EXCLUDED_PACKAGES,
} from "./audit-dependency-direction.mjs";

test("表に無い依存を package.json から見つける", () => {
  const violations = findViolations({
    "packages/timer-core": { manifest: ["@tasuki/poker-core"], imports: [] },
  });
  assert.deepEqual(violations, [
    { pkg: "packages/timer-core", dep: "@tasuki/poker-core", via: "package.json" },
  ]);
});

test("表に無い依存を import 文から見つける", () => {
  const violations = findViolations({
    "packages/poker-core": { manifest: [], imports: ["@tasuki/room-core"] },
  });
  assert.deepEqual(violations, [
    { pkg: "packages/poker-core", dep: "@tasuki/room-core", via: "import" },
  ]);
});

test("表にある依存は通す", () => {
  const violations = findViolations({
    "apps/timer-web": { manifest: ["@tasuki/room-core"], imports: ["@tasuki/timer-core"] },
  });
  assert.deepEqual(violations, []);
});

test("表に無いパッケージそのものを違反として報告する", () => {
  const violations = findViolations({ "packages/unknown": { manifest: [], imports: [] } });
  assert.deepEqual(violations, [{ pkg: "packages/unknown", dep: null, via: "declaration" }]);
});

test("同じ違反を import 文の重複ぶんだけ報告しない", () => {
  // 1 パッケージの複数ファイルが同じ禁止依存を取り込んでいても、報告は 1 件にする。
  // 件数が読み手の判断材料になるので、同じ 1 つの決定を何度も数えない。
  const violations = findViolations({
    "packages/poker-core": { manifest: [], imports: ["@tasuki/room-core", "@tasuki/room-core"] },
  });
  assert.equal(violations.length, 1);
});

test("package.json と import の両方に出れば両方を報告する（片方だけ直す取りこぼしを防ぐ）", () => {
  const violations = findViolations({
    "packages/poker-core": { manifest: ["@tasuki/room-core"], imports: ["@tasuki/room-core"] },
  });
  assert.deepEqual(violations, [
    { pkg: "packages/poker-core", dep: "@tasuki/room-core", via: "package.json" },
    { pkg: "packages/poker-core", dep: "@tasuki/room-core", via: "import" },
  ]);
});

test("パッケージの外へ出る相対パスを違反として報告する", () => {
  // `@tasuki/room-core` と書けば赤くなるのに、相対パスで書くと緑だった経路
  // （2026-09-07 のレビュー指摘。規範を迂回する側だけが通っていた）。
  const violations = findViolations({
    "packages/poker-core": {
      manifest: [],
      imports: [],
      escapes: ["packages/poker-core/src/deck.ts → ../../room-core/src/display-name.js"],
    },
  });
  assert.deepEqual(violations, [
    {
      pkg: "packages/poker-core",
      dep: "packages/poker-core/src/deck.ts → ../../room-core/src/display-name.js",
      via: "相対パス",
    },
  ]);
});

test("表にある依存先でも、相対パスで取り込めば違反になる", () => {
  // 表を見て「許されている」と判断してはならない。パッケージ名で参照しない限り、
  // package.json と import 指定子を見る 2 つの経路がどちらも空振りする。
  //
  // ⚠ **前提は「表に現にある組」でなければならない。** ここは長らく
  // `packages/timer-core → @tasuki/room-core` を使っていたが、#95 S4b でその
  // 一時依存を外したため `manifest` の側も違反になり、件数が 2 になって落ちた。
  // **表を変えたらこの前提も数え直すこと**（現に許されている組へ替える）。
  const violations = findViolations({
    "packages/poker-core": {
      manifest: ["@tasuki/protocol"],
      imports: [],
      escapes: ["packages/poker-core/src/protocol.ts → ../../protocol/src/boundary.js"],
    },
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].via, "相対パス");
});

test("パッケージの内側で閉じる相対パスは通す", () => {
  // 越境だけを見る。パッケージ内の相対 import は普通の書き方であり、
  // ここで拾うと検査が全パッケージで常に赤くなる（空振りの逆の壊れ方）。
  const violations = findViolations({
    "packages/room-core": { manifest: [], imports: [], escapes: [] },
  });
  assert.deepEqual(violations, []);
});

test("許可表は空でない（このガード自身の空振り検出）", () => {
  // 下限は「非空」だけにする。固定値は ADR-0014 決定 8 の MUST NOT
  // （パッケージが 1 つ増えるたびに無関係な赤が出る）。
  assert.ok(Object.keys(ALLOWED).length > 0);
});

test("理由の無い除外を名指しする（決定 2・書き忘れ）", () => {
  // Given: 理由の欄が無い・空・空白だけ。**どれも「なぜ 0 件でよいのか」を答えていない**
  const invalid = findInvalidExclusions([
    { pkg: "packages/a" },
    { pkg: "packages/b", reason: "" },
    { pkg: "packages/c", reason: "   " },
    { pkg: "packages/d", reason: "TS を 1 つも持たない" },
  ]);
  // Then: 理由を持つ d だけが通る
  assert.deepEqual(invalid, ["packages/a", "packages/b", "packages/c"]);
});

test("pkg の指定も無い行は、名前の代わりに何が足りないかを返す", () => {
  // Given: 表の書き損じ。ここで throw すると、原因の分からない失敗になる
  assert.deepEqual(findInvalidExclusions([{}]), ["(pkg の指定がありません)"]);
});

test("実際の除外表は理由の要件を満たす（表そのものの健全性）", () => {
  // 表が空のあいだは自明に通るが、行が足された瞬間から効く
  assert.deepEqual(findInvalidExclusions(EXCLUDED_PACKAGES), []);
});

/** 一時のディレクトリに 1 パッケージ分のファイルを置き、観測した結果を返す。 */
function observeTemp(pkg, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dd-"));
  try {
    fs.mkdirSync(path.join(root, pkg), { recursive: true });
    fs.writeFileSync(path.join(root, pkg, "package.json"), "{}");
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    }
    return observe(pkg, Object.keys(files), root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("試験専用のパッケージは、試験の側（tests・test・e2e）から読むと通る（#554）", () => {
  assert.deepEqual(TEST_ONLY, ["@tasuki/test-css"]);
  const line = `import { rules } from "@tasuki/test-css";\n`;
  for (const [pkg, rel] of [
    ["apps/timer-web", "apps/timer-web/test/a.test.ts"],
    ["apps/agenda-web", "apps/agenda-web/tests/a.test.ts"],
    ["e2e", "e2e/specs/a.spec.ts"],
  ]) {
    const seen = observeTemp(pkg, { [rel]: line });
    assert.deepEqual(seen.testOnlyInProduct, [], rel);
  }
  assert.deepEqual(findViolations({ "apps/timer-web": observeTemp("apps/timer-web", { "apps/timer-web/test/a.test.ts": line }) }), []);
});

test("試験専用のパッケージを製品コード（src・設定ファイル）から読むと、表にあっても違反（#554）", () => {
  const line = `import { rules } from "@tasuki/test-css";\n`;
  const seen = observeTemp("apps/timer-web", {
    "apps/timer-web/src/a.ts": line,
    "apps/timer-web/vite.config.ts": line,
    "apps/timer-web/test/ok.test.ts": line,
  });
  assert.deepEqual(seen.testOnlyInProduct, [
    "apps/timer-web/src/a.ts → @tasuki/test-css",
    "apps/timer-web/vite.config.ts → @tasuki/test-css",
  ]);
  assert.equal(ALLOWED["apps/timer-web"].includes("@tasuki/test-css"), true);
  const violations = findViolations({ "apps/timer-web": seen });
  assert.deepEqual(
    violations.map((v) => v.via),
    ["試験専用", "試験専用"],
  );
});

test("試験専用のパッケージを許可表に載せていないパッケージは、試験から読んでも違反（#554）", () => {
  const seen = observeTemp("apps/topic-web", { "apps/topic-web/test/a.test.ts": `import "@tasuki/test-css";\n` });
  assert.deepEqual(findViolations({ "apps/topic-web": seen }), [
    { pkg: "apps/topic-web", dep: "@tasuki/test-css", via: "import" },
  ]);
});

test("製品コードが同じパッケージの tests・test を相対パスで読むと違反（再輸出で試験専用のパッケージを素通りさせない・#554）", () => {
  const seen = observeTemp("apps/agenda-web", {
    "apps/agenda-web/src/leak.ts": `export * from "../tests/support/css";\n`,
    "apps/agenda-web/src/leak2.ts": `import { x } from "../test/support/css";\n`,
    "apps/agenda-web/src/leak3.ts": `import x from "../tests";\n`,
    "apps/agenda-web/src/leak4.ts": `import y from "../test";\n`,
    "apps/agenda-web/tests/support/css.ts": `export * from "@tasuki/test-css";\n`,
    "apps/agenda-web/tests/a.test.ts": `import { x } from "./support/css";\n`,
  });
  assert.deepEqual(seen.testOnlyInProduct, [
    "apps/agenda-web/src/leak.ts → ../tests/support/css",
    "apps/agenda-web/src/leak2.ts → ../test/support/css",
    "apps/agenda-web/src/leak3.ts → ../tests",
    "apps/agenda-web/src/leak4.ts → ../test",
  ]);
  assert.deepEqual(findViolations({ "apps/agenda-web": seen }).map((v) => v.via), ["試験専用", "試験専用", "試験専用", "試験専用"]);
});
