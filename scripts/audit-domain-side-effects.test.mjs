import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_TOP_LEVEL_MUTABLE,
  findStaleAllowances,
  DOMAIN_PACKAGES,
  EXCLUDED_PACKAGES,
  FORBIDDEN,
  FORBIDDEN_PATTERNS,
  findForbiddenCalls,
} from "./audit-domain-side-effects.mjs";

/**
 * **規範の写しであって、腐る列挙ではない。**
 *
 * `FORBIDDEN` をループするテストだけでは、**語を落としてもループが一緒に縮むので緑のまま**に
 * なる（レビューで実測: 6 語 → 3 語に狭めたコピーで、自己テストも検査本体も両方緑だった）。
 * 射程を狭める向きの変更を機械で止めるには、テスト側が**リテラルで**語を持つしかない。
 *
 * ここに並ぶのは「現時点の実装の写し」ではなく、**この検査が守ると決めた射程そのもの**である。
 * `docs/adr/0016` 決定 2 項目 4 の逐語 2 語（時刻・乱数）に、同じ抜け道を塞ぐ 4 語
 * （`new Date(` / `performance.now(` / `crypto.` / `process.env`）を足した集合にあたる。
 *
 * **語を減らすときは、規範とこの配列の両方を直すこと。** 実装側だけを狭めれば赤くなる。
 * それがこの配列の唯一の仕事である（赤を消す最短経路を「語を 1 つ落とす」にしない）。
 */
const REQUIRED_FORBIDDEN = [
  "Date.now(",
  "Math.random(",
  "new Date(",
  "performance.now(",
  "crypto.",
  "process.env",
];

describe("FORBIDDEN: 射程を狭める変更を止める", () => {
  test("規範の射程がすべて FORBIDDEN に入っている", () => {
    // Given / When / Then（実装側の配列ではなく、上のリテラルを回す）
    for (const token of REQUIRED_FORBIDDEN) {
      assert.ok(FORBIDDEN.includes(token), `${token} が FORBIDDEN から落ちている`);
    }
  });

  test("規範の射程をそれぞれ実際に検出する", () => {
    // 宣言に入っているだけでなく、検出まで届くことを見る
    // （配列に残したまま findForbiddenCalls 側で無効化する経路を塞ぐ）
    for (const token of REQUIRED_FORBIDDEN) {
      const found = findForbiddenCalls(`const x = ${token});`, "a.ts");
      assert.equal(found.length, 1, `${token} を検出できていない`);
      assert.equal(found[0].token, token);
    }
  });
});

describe("findForbiddenCalls: 禁止語彙を拾う", () => {
  // 件数は書かない（語を足すたびに題を直す運用は腐る）。宣言そのものを回す。
  test("宣言した禁止語彙をそれぞれ拾う", () => {
    // Given / When / Then（宣言した語を 1 つずつ、その語だけの本文で確かめる）
    for (const token of FORBIDDEN) {
      const found = findForbiddenCalls(`const x = ${token});`, "a.ts");
      assert.equal(found.length, 1, `${token} を拾えていない`);
      assert.equal(found[0].token, token);
    }
  });

  test("行番号は 1 始まりで、実際の行を指す", () => {
    // Given
    const src = ["const a = 1;", "const b = 2;", "const c = Date.now();"].join("\n");
    // When
    const found = findForbiddenCalls(src, "a.ts");
    // Then
    assert.equal(found.length, 1);
    assert.equal(found[0].line, 3);
    assert.equal(found[0].path, "a.ts");
  });

  test("**コメント行も拾う**（無いことを求める検査なので読み飛ばさない）", () => {
    // Given: 行コメント・ブロックコメント・docstring の 3 形
    const src = [
      "// Date.now() を呼ばないこと",
      "/* Math.random() も同様 */",
      "/** `new Date(` も拾う */",
    ].join("\n");
    // When
    const found = findForbiddenCalls(src, "a.ts");
    // Then
    assert.equal(found.length, 3);
  });

  test("禁止語彙が無ければ 0 件", () => {
    // Given / When
    const found = findForbiddenCalls("const now = deps.clock.now();\n", "a.ts");
    // Then
    assert.deepEqual(found, []);
  });

  test("同じ行に 2 語あれば 2 件返す", () => {
    // Given
    const src = "const x = Date.now() + Math.random();";
    // When / Then
    assert.equal(findForbiddenCalls(src, "a.ts").length, 2);
  });

  test("行をまたぐ状態を持たない（前の行の内容が後の行の判定を変えない）", () => {
    // Given: 1 行目だけが違う 2 本。2 行目は同一
    const withNoise = ['const re = /a\\/b/; // "unterminated', "const x = Date.now();"].join("\n");
    const withoutNoise = ["const y = 1;", "const x = Date.now();"].join("\n");
    // When / Then: どちらも 2 行目の 1 件だけを拾う
    for (const src of [withNoise, withoutNoise]) {
      const found = findForbiddenCalls(src, "a.ts");
      assert.equal(found.length, 1);
      assert.equal(found[0].line, 2);
    }
  });
});

describe("宣言: 走査対象と除外", () => {
  test("ドメインパッケージの宣言は非空", () => {
    // 書いてよい下限は「非空」だけ（ADR-0014 決定 8）。件数の下限は直書きしない。
    assert.ok(DOMAIN_PACKAGES.length > 0);
  });

  test("除外にはすべて理由がある（ADR-0014 決定 2）", () => {
    for (const e of EXCLUDED_PACKAGES) {
      assert.ok(typeof e.pkg === "string" && e.pkg.length > 0);
      assert.ok(typeof e.reason === "string" && e.reason.length > 0, `${e.pkg} に理由が無い`);
    }
  });

  test("宣言と除外は重ならない", () => {
    const excluded = new Set(EXCLUDED_PACKAGES.map((e) => e.pkg));
    for (const pkg of DOMAIN_PACKAGES) {
      assert.ok(!excluded.has(pkg), `${pkg} が走査対象と除外の両方にある`);
    }
  });
});

/**
 * ドメインは投げない・モジュールの状態を持たない（#364）。
 *
 * 字面の語（`FORBIDDEN`）では書けない 2 つを、行ごとの正規表現で見る。
 * - `throw`: 単語として現れたら拾う。`neverthrow` は拾わない（単語の境界が無い）
 * - トップレベルの `let`: 行頭（字下げ無し）の `let` / `export let` を拾う。関数の内側（字下げあり）の
 *   `let` は拾わない —— クロージャに状態を持たせる形（`createRecordIdGenerator`）は呼び出し側が持つ状態である
 */
describe("FORBIDDEN_PATTERNS: 投げない・モジュールの状態を持たない（#364）", () => {
  /** 射程の写し。上の REQUIRED_FORBIDDEN と同じく、語を落とす変更を赤にする */
  const REQUIRED_PATTERN_TOKENS = ["throw", "トップレベルの let"];

  test("規範の射程がすべて FORBIDDEN_PATTERNS に入っている", () => {
    // Given / When
    const tokens = FORBIDDEN_PATTERNS.map((p) => p.token);
    // Then
    for (const token of REQUIRED_PATTERN_TOKENS) {
      assert.ok(tokens.includes(token), `${token} が FORBIDDEN_PATTERNS から落ちている`);
    }
  });

  test("throw を拾う（字下げの有無を問わない）", () => {
    // Given
    const src = ['throw new Error("x");', '    throw new RangeError("y");'].join("\n");
    // When
    const found = findForbiddenCalls(src, "a.ts");
    // Then
    assert.deepEqual(
      found.map((f) => [f.line, f.token]),
      [
        [1, "throw"],
        [2, "throw"],
      ],
    );
  });

  test("neverthrow は throw として拾わない", () => {
    // Given
    const src = ['import { ok } from "neverthrow";', "// 結果は neverthrow の Result"].join("\n");
    // When / Then
    assert.deepEqual(findForbiddenCalls(src, "a.ts"), []);
  });

  test("トップレベルの let を拾う（export let も）", () => {
    // Given
    const src = ["let counter = 0;", "export let current = 1;"].join("\n");
    // When
    const found = findForbiddenCalls(src, "a.ts");
    // Then
    assert.deepEqual(
      found.map((f) => [f.line, f.token]),
      [
        [1, "トップレベルの let"],
        [2, "トップレベルの let"],
      ],
    );
  });

  test("関数の内側（字下げあり）の let は拾わない", () => {
    // Given
    const src = ["export function make() {", "  let counter = 0;", "  return () => ++counter;", "}"].join("\n");
    // When / Then
    assert.deepEqual(findForbiddenCalls(src, "a.ts"), []);
  });
});

/**
 * 最上位の `const` の可変な `Map` / `Set`（#596・#587 節 8 の 5）。
 *
 * `const` なので `let` の検査をすり抜けるが、中身は書き換えられる。**ドメインがモジュールの状態を持つ**
 * 点では `let` と同じである。`ReadonlyMap` / `ReadonlySet` の型で宣言した定数の表は対象にしない。
 * 例外は宣言（{@link ALLOWED_TOP_LEVEL_MUTABLE}・理由つき）で持つ。
 */
describe("最上位の const の可変な Map/Set（#596）", () => {
  const TOKEN = "トップレベルの可変な Map/Set";

  test("射程の写し: この語が FORBIDDEN_PATTERNS から落ちていない", () => {
    assert.ok(FORBIDDEN_PATTERNS.map((p) => p.token).includes(TOKEN));
  });

  test("最上位の const の new Map / new Set / WeakMap / WeakSet を拾う（export も・型の注釈つきも）", () => {
    // Given
    const src = [
      "const a = new Map<string, string>();",
      "export const b = new Set<number>();",
      "const c: Map<string, () => void> = new Map();",
      "const d = new WeakMap<object, number>();",
      "const e = new WeakSet<object>();",
    ].join("\n");
    // When
    const found = findForbiddenCalls(src, "a.ts", []);
    // Then
    assert.deepEqual(
      found.map((f) => [f.line, f.token]),
      [1, 2, 3, 4, 5].map((n) => [n, TOKEN]),
    );
  });

  test("ReadonlyMap / ReadonlySet の型の定数の表は拾わない", () => {
    // Given
    const src = [
      "const DECK: ReadonlyMap<string, number> = new Map([[\"a\", 1]]);",
      "const KEYS: ReadonlySet<string> = new Set([\"a\"]);",
    ].join("\n");
    // When / Then
    assert.deepEqual(findForbiddenCalls(src, "a.ts", []), []);
  });

  test("関数の内側（字下げあり）の Map は拾わない", () => {
    // Given
    const src = ["export function make() {", "  const cache = new Map<string, string>();", "  return cache;", "}"].join("\n");
    // When / Then
    assert.deepEqual(findForbiddenCalls(src, "a.ts", []), []);
  });

  test("宣言した例外（パスと名前が両方合う）だけを通す", () => {
    // Given
    const src = "const skeletonCache = new Map<string, string>();\n";
    const allowed = [{ path: "a.ts", name: "skeletonCache", reason: "純関数のメモ" }];
    // When / Then
    assert.deepEqual(findForbiddenCalls(src, "a.ts", allowed), []);
    assert.equal(findForbiddenCalls(src, "b.ts", allowed).length, 1, "別のパスは通さない");
    assert.equal(findForbiddenCalls(src.replace("skeletonCache", "other"), "a.ts", allowed).length, 1, "別の名前は通さない");
  });

  test("例外の宣言には理由があり、実物（display-name.ts の skeletonCache）が 1 件入っている", () => {
    // Given / When
    const entry = ALLOWED_TOP_LEVEL_MUTABLE.find(
      (a) => a.path === "packages/room-core/src/display-name.ts" && a.name === "skeletonCache",
    );
    // Then
    assert.ok(entry !== undefined);
    for (const a of ALLOWED_TOP_LEVEL_MUTABLE) {
      assert.ok(typeof a.reason === "string" && a.reason.length > 0, `${a.path} ${a.name} に理由が無い`);
    }
  });

  test("例外の既定値で実物の宣言は通る（既定の第 3 引数が宣言を見る）", () => {
    // Given
    const src = "const skeletonCache = new Map<string, string>();\n";
    // When / Then
    assert.deepEqual(findForbiddenCalls(src, "packages/room-core/src/display-name.ts"), []);
    assert.equal(findForbiddenCalls(src, "packages/room-core/src/other.ts").length, 1);
  });

  test("findStaleAllowances: 宣言が実物から消えた例外を拾う（腐った例外を残さない）", () => {
    // Given
    const allowed = [{ path: "a.ts", name: "cache", reason: "r" }];
    // When / Then
    assert.deepEqual(findStaleAllowances(new Map([["a.ts", "const cache = new Map();\n"]]), allowed), []);
    assert.deepEqual(findStaleAllowances(new Map([["a.ts", "const other = new Map();\n"]]), allowed), allowed);
    assert.deepEqual(findStaleAllowances(new Map([["b.ts", "const cache = new Map();\n"]]), allowed), allowed);
  });
});
