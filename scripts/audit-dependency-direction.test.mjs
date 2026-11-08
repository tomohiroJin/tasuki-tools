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
import {
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

test("製品コード（src）が試験用の入口を読むと、依存先が表にあるかどうかによらず違反（#554）", () => {
  const violations = findViolations({
    "apps/agenda-web": { manifest: [], imports: [], escapes: [], testSupport: ["apps/agenda-web/src/main.tsx"] },
  });
  assert.deepEqual(violations, [
    { pkg: "apps/agenda-web", dep: "apps/agenda-web/src/main.tsx", via: "試験用の入口" },
  ]);
});

test("試験用の入口を読む試験（src の外）は観測に載らないので通る（#554）", () => {
  const violations = findViolations({
    "apps/agenda-web": { manifest: ["@tasuki/ui"], imports: ["@tasuki/ui"], escapes: [], testSupport: [] },
  });
  assert.deepEqual(violations, []);
});

// `observe`（実際にファイルを読んで集める側）を、一時のディレクトリに作ったパッケージの形で通す（#554）。
// 判定の関数（findViolations）だけを見る上の試験では、集める側の条件（src だけを見る・相対パスで tests を読む）を消しても緑のままになる。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { observe } from "./audit-dependency-direction.mjs";

function withTempPackage(files, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "audit-dep-dir-"));
  try {
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    }
    return run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const ENTRY_IMPORT = `import "${["@tasuki", "ui", "test-support"].join("/")}/css-text.mjs";\n`;

test("observe: src の取り込みは試験用の入口として拾い、tests の取り込みは拾わない", () => {
  withTempPackage(
    {
      "packages/x/package.json": "{}",
      "packages/x/src/a.ts": ENTRY_IMPORT,
      "packages/x/tests/b.ts": ENTRY_IMPORT,
    },
    (root) => {
      const seen = observe("packages/x", ["packages/x/src/a.ts", "packages/x/tests/b.ts"], root);
      assert.deepEqual(seen.testSupport, ["packages/x/src/a.ts"]);
    },
  );
});

test("observe: src から同じパッケージの tests を相対パスで読むのも拾い、src どうしの相対パスは拾わない", () => {
  withTempPackage(
    {
      "packages/ui/package.json": "{}",
      "packages/ui/src/x.mjs": `import "../tests/support/css-text.mjs";\n`,
      "packages/ui/src/y.mjs": `import "./z.mjs";\n`,
      "packages/ui/src/z.mjs": "export {};\n",
    },
    (root) => {
      const seen = observe("packages/ui", ["packages/ui/src/x.mjs", "packages/ui/src/y.mjs", "packages/ui/src/z.mjs"], root);
      assert.deepEqual(seen.testSupport, ["packages/ui/src/x.mjs → ../tests/support/css-text.mjs"]);
      assert.deepEqual(seen.escapes, []);
    },
  );
});

test("observe: バッククォートの指定子と、vite.config.ts などの設定ファイル（src の外）も試験用の入口として拾う", () => {
  const entry = ["@tasuki", "ui", "test-support"].join("/");
  withTempPackage(
    {
      "apps/y/package.json": "{}",
      "apps/y/src/lazy.ts": "const m = await import(`" + entry + "/css-text.mjs`);\n",
      "apps/y/vite.config.ts": ENTRY_IMPORT,
      "apps/y/test/ok.ts": ENTRY_IMPORT,
    },
    (root) => {
      const seen = observe("apps/y", ["apps/y/src/lazy.ts", "apps/y/vite.config.ts", "apps/y/test/ok.ts"], root);
      assert.deepEqual(seen.testSupport, ["apps/y/src/lazy.ts", "apps/y/vite.config.ts"]);
    },
  );
});

test("observe: 注釈の中に試験用の入口の名前を書いただけでは止めず、テンプレート文字列の import() は止める（#554）", () => {
  const entry = ["@tasuki", "ui", "test-support"].join("/");
  withTempPackage(
    {
      "apps/z/package.json": "{}",
      "apps/z/src/doc.ts": "// import \"" + entry + "/css-text.mjs\" は試験だけが読む\n/* from \"" + entry + "/x\" */\nexport const a = 1;\n",
      "apps/z/src/lazy.ts": "const m = await import(`" + entry + "/${name}.mjs`);\n",
      "apps/z/src/req.cjs": "const m = require(\"" + entry + "/css-text.mjs\");\n",
      "apps/z/src/reexport.ts": "export * from \"" + entry + "/css-text.mjs\";\n",
    },
    (root) => {
      const files = ["apps/z/src/doc.ts", "apps/z/src/lazy.ts", "apps/z/src/req.cjs", "apps/z/src/reexport.ts"];
      const seen = observe("apps/z", files, root);
      assert.deepEqual(seen.testSupport, ["apps/z/src/lazy.ts", "apps/z/src/req.cjs", "apps/z/src/reexport.ts"]);
    },
  );
});

test("observe: require() と new URL(…, import.meta.url) の相対パスで tests・パッケージの外へ出る取り込みも拾い、src の中の相対パスは拾わない（#554）", () => {
  withTempPackage(
    {
      "packages/q/package.json": "{}",
      "packages/q/src/a.cjs": "const m = require(\"../tests/support/x.cjs\");\n",
      "packages/q/src/b.mjs": "const u = new URL(\"../tests/support/x.mjs\", import.meta.url);\n",
      "packages/q/src/c.cjs": "const m = require(\"../../other/src/y.cjs\");\n",
      "packages/q/src/d.mjs": "const u = new URL(\"./e.json\", import.meta.url);\n",
      "packages/q/src/e.json": "{}",
    },
    (root) => {
      const files = ["packages/q/src/a.cjs", "packages/q/src/b.mjs", "packages/q/src/c.cjs", "packages/q/src/d.mjs"];
      const seen = observe("packages/q", files, root);
      assert.deepEqual(seen.testSupport, ["packages/q/src/a.cjs → ../tests/support/x.cjs", "packages/q/src/b.mjs → ../tests/support/x.mjs"]);
      assert.deepEqual(seen.escapes, ["packages/q/src/c.cjs → ../../other/src/y.cjs"]);
    },
  );
});

test("observe: glob の文字列の中の /* で注釈を始めず、その後ろの試験用の入口の取り込みを止める（#554）", () => {
  const entry = ["@tasuki", "ui", "test-support"].join("/");
  withTempPackage(
    {
      "apps/g/package.json": "{}",
      "apps/g/src/glob.ts": "const g = 'tests/**/*.ts';\nconst h = 'x/*.ts';\nconst m = await import(\"" + entry + "/css-text.mjs\"); /* 閉じ */\n",
    },
    (root) => {
      const seen = observe("apps/g", ["apps/g/src/glob.ts"], root);
      assert.deepEqual(seen.testSupport, ["apps/g/src/glob.ts"]);
    },
  );
});

test("observe: src の中の test/ フォルダを相対パスで読んでも通り、パッケージ直下の tests/ は止める（#554）", () => {
  withTempPackage(
    {
      "apps/h/package.json": "{}",
      "apps/h/src/routes/test/x.ts": "export {};\n",
      "apps/h/src/routes/a.ts": "import \"./test/x\";\n",
      "apps/h/src/b.ts": "import \"../tests/y\";\n",
    },
    (root) => {
      const seen = observe("apps/h", ["apps/h/src/routes/a.ts", "apps/h/src/b.ts"], root);
      assert.deepEqual(seen.testSupport, ["apps/h/src/b.ts → ../tests/y"]);
    },
  );
});

test("observe: 正規表現リテラル（/[/*]/・/'/）の後ろにある試験用の入口の取り込みも止める（#554）", () => {
  const entry = ["@tasuki", "ui", "test-support"].join("/");
  withTempPackage(
    {
      "apps/r/package.json": "{}",
      "apps/r/src/a.ts": "const re = /[/*]/;\nconst m = await import(\"" + entry + "/css-text.mjs\");\n",
      "apps/r/src/b.ts": "const q = /'/.test(s);\nconst m = await import(\"" + entry + "/css-text.mjs\");\n",
      "apps/r/src/c.ts": "const d = a / b; // " + entry + "/x を読む\n",
    },
    (root) => {
      const seen = observe("apps/r", ["apps/r/src/a.ts", "apps/r/src/b.ts", "apps/r/src/c.ts"], root);
      assert.deepEqual(seen.testSupport, ["apps/r/src/a.ts", "apps/r/src/b.ts"]);
    },
  );
});

test("observe: e2e パッケージ（e2e/specs・e2e/support）は全体が試験の側なので、共有の解析器を読んでも止めない（#554）", () => {
  const entry = ["@tasuki", "ui", "test-support"].join("/");
  withTempPackage(
    {
      "e2e/package.json": "{}",
      "e2e/specs/a.spec.ts": ENTRY_IMPORT,
      "e2e/support/b.ts": "import \"" + entry + "/css-text.mjs\";\n",
    },
    (root) => {
      const seen = observe("e2e", ["e2e/specs/a.spec.ts", "e2e/support/b.ts"], root);
      assert.deepEqual(seen.testSupport, []);
    },
  );
});
