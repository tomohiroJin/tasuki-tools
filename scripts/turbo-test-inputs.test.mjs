/**
 * `turbo.json` の `test` の入力の並びを見る自己テスト（`docs/adr/0017` の追記（2026-11-14・#599）決まり 3）。
 *
 * `@tasuki/ui` に依存しない読む側（agenda-core・checkin-core・roulette-core・invite-ui・web-kit）は、
 * `fonts.css` を変えても `test` のハッシュが変わらず、turbo のキャッシュが古い緑を再生する。
 * そこで `test` の `inputs` に `fonts.css` を足す。`package#task` は基底を継承しないので、
 * 個別に定義した `<パッケージ>#test` にも同じ並びが要る。足し忘れた 1 つだけが穴に戻るのを、ここで止める。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TURBO = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "turbo.json"), "utf8"));

/** 基底の `test` と個別の `<パッケージ>#test` が持つべき入力の並び。 */
export const EXPECTED_TEST_INPUTS = ["$TURBO_DEFAULT$", "$TURBO_ROOT$/packages/ui/src/tokens/fonts.css"];

/** `test` 系のタスク（基底 `test`・`test:unit` と `<パッケージ>#test`）の名前。`@tasuki/e2e#test` は除く。 */
export function testTaskNames(tasks) {
  return Object.keys(tasks).filter(
    (name) => name === "test" || name === "test:unit" || (name.endsWith("#test") && name !== "@tasuki/e2e#test"),
  );
}

test("fonts.css のファイルが実在する（入力に足した相対パスが空振りしない）", () => {
  assert.equal(fs.existsSync(path.join(REPO_ROOT, "packages/ui/src/tokens/fonts.css")), true);
});

test("基底の test と、個別に定義した <パッケージ>#test がすべて、fonts.css を含む同じ inputs を持つ", () => {
  const names = testTaskNames(TURBO.tasks);
  assert.ok(names.includes("test"), "基底の test が無い");
  assert.ok(names.length >= 7, `個別の <パッケージ>#test が見つかりません: ${names.join(", ")}`);
  for (const name of names) {
    assert.deepEqual(TURBO.tasks[name].inputs, EXPECTED_TEST_INPUTS, `${name} の inputs`);
  }
});

test("testTaskNames は e2e の test を数えず、test:unit を数える", () => {
  assert.deepEqual(
    testTaskNames({ test: {}, "test:unit": {}, "@tasuki/e2e#test": {}, "@tasuki/a#test": {}, lint: {} }),
    ["test", "test:unit", "@tasuki/a#test"],
  );
});
