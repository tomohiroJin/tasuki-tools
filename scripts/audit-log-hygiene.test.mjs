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
