/**
 * scripts/audit-log-hygiene.mjs の単体テスト。
 * 実リポジトリはスキャンしない（インライン文字列と小さな Map だけを渡す）。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  findViolations,
  findStaleAllowances,
  findMissingRequired,
  ALLOWED_FILES,
  REQUIRED_FILES,
} from "./audit-log-hygiene.mjs";

describe("禁止された構文の検出", () => {
  test("許可されていないファイルの console は違反", () => {
    const v = findViolations("apps/timer-sync/src/foo.ts", 'console.log("x");\n');
    assert.equal(v.length, 1);
    assert.equal(v[0].line, 1);
  });

  test("許可ファイルでもマーカーが無ければ違反", () => {
    const v = findViolations(ALLOWED_FILES[0], 'console.log("x");\n');
    assert.equal(v.length, 1);
  });

  test("許可ファイルでマーカーがあれば違反にしない", () => {
    const v = findViolations(ALLOWED_FILES[0], 'console.log("x"); // log-hygiene:allow 理由\n');
    assert.equal(v.length, 0);
  });

  test("process.stdout.write も検出する", () => {
    const v = findViolations("apps/timer-sync/src/foo.ts", "process.stdout.write('x');\n");
    assert.equal(v.length, 1);
  });

  test("publicText の呼び出しも検出する（抜け道の管理）", () => {
    const v = findViolations("apps/timer-sync/src/foo.ts", "const a = publicText(secret);\n");
    assert.equal(v.length, 1);
  });

  test("publicText の定義（export function）は呼び出しではないので違反にしない", () => {
    const src = "export function publicText(value) { return value; }\n";
    const v = findViolations("apps/timer-sync/src/application/log/log-safe.ts", src);
    assert.equal(v.length, 0);
  });

  test("コメント行の console は違反にしない", () => {
    const v = findViolations("apps/timer-sync/src/foo.ts", '// console.log("説明")\n');
    assert.equal(v.length, 0);
  });
});

describe("fail-closed: 陳腐化した許可の検出", () => {
  test("許可ファイルにマーカーが 1 つも無ければ陳腐化として報告する", () => {
    const scanned = new Map(ALLOWED_FILES.map((f) => [f, "const x = 1;\n"]));
    assert.deepEqual(findStaleAllowances(scanned).sort(), [...ALLOWED_FILES].sort());
  });

  test("マーカーがあれば陳腐化ではない", () => {
    const scanned = new Map(ALLOWED_FILES.map((f) => [f, "// log-hygiene:allow 理由\n"]));
    assert.deepEqual(findStaleAllowances(scanned), []);
  });
});

describe("fail-closed: 走査対象の消失の検出", () => {
  test("必須ファイルが走査結果に無ければ報告する", () => {
    assert.deepEqual(findMissingRequired(new Map()).sort(), [...REQUIRED_FILES].sort());
  });

  test("すべて揃っていれば空", () => {
    const scanned = new Map(REQUIRED_FILES.map((f) => [f, ""]));
    assert.deepEqual(findMissingRequired(scanned), []);
  });
});

describe("ブロックコメント絡みの行単位の判定（状態を持たない設計）", () => {
  test("`/* ... */` 単体で始まる行（`*` 単独始まりではない）は読み飛ばさず検出する", () => {
    const v = findViolations(
      "apps/timer-sync/src/foo.ts",
      "/* note */ console.log(secretToken);\n",
    );
    assert.equal(v.length, 1);
    assert.equal(v[0].line, 1);
  });

  test(
    "既知の見落とし: ブロックコメントの閉じ行(`*` 始まり)に実コードが続いても検出しない。" +
      "isCommentLine は行の先頭文字だけで判定するため、`*\\/ console.log(x)` の行は" +
      "`*` 始まりとして丸ごと読み飛ばす。状態を持たない設計を選んだことの既知のトレードオフ" +
      "（round 3 で状態機械そのものを撤去した理由は findViolations のコメントを参照）。",
    () => {
      const v = findViolations(
        "apps/timer-sync/src/foo.ts",
        "/*\ncomment\n*/ console.log(secretToken);\n",
      );
      assert.equal(v.length, 0);
    },
  );

  test(
    "安全側の偽陽性: ブロックコメントの継続行が `*` で始まらないと、地の文でも検出する。" +
      "状態を持たないので「コメントの中にいるかどうか」を追跡できない。安全側（余計に赤くなる）" +
      "なので許容する。",
    () => {
      const v = findViolations(
        "apps/timer-sync/src/foo.ts",
        "/*\nconsole.log(secretToken) という書き方は禁止\n*/\n",
      );
      assert.equal(v.length, 1);
      assert.equal(v[0].line, 2);
    },
  );

  test("許可ファイルでは、同じ行にマーカーがあれば違反にしない", () => {
    const v = findViolations(
      ALLOWED_FILES[0],
      '/* note */ console.log("x"); // log-hygiene:allow 理由\n',
    );
    assert.equal(v.length, 0);
  });
});

describe("回帰: 正規表現リテラル内のエスケープされたスラッシュ(状態を持たないので元々問題にならない)", () => {
  test("/http:\\/\\// のような正規表現の後に続く console を検出する", () => {
    const v = findViolations(
      "apps/timer-sync/src/foo.ts",
      "const re = /http:\\/\\//; console.log(secretToken)\n",
    );
    assert.equal(v.length, 1);
  });

  test("/a\\// のような短い正規表現の後に続く console も検出する", () => {
    const v = findViolations(
      "apps/timer-sync/src/foo.ts",
      "const re = /a\\//; console.log(secretToken)\n",
    );
    assert.equal(v.length, 1);
  });
});

describe("回帰: かつての状態機械にあった第 3 のすり抜け(テンプレートリテラルの状態が巻き添えでリセットされる)", () => {
  test("正規表現っぽい断片が別の行にあっても、テンプレートリテラルの中の行の扱いは変わらない", () => {
    const repro = findViolations(
      "apps/timer-sync/src/foo.ts",
      "const re = /a\\//; const s = `\n// console.log(secretToken)\n`;\n",
    );
    const control = findViolations(
      "apps/timer-sync/src/foo.ts",
      "const s = `\n// console.log(secretToken)\n`;\n",
    );
    assert.deepEqual(repro, control);
  });
});
