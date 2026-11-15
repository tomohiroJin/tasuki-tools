/**
 * `turbo.json` の `test` 系タスクの入力を見る自己テスト（`docs/adr/0017` の追記（2026-11-14・#599）決まり 3）。
 *
 * 試験は `packages/ui/src/tokens/fonts.css` と `packages/test-css/src/` をファイルとして読む（読む側の依存は
 * devDependency で、build を持たない）ので、どちらを変えても読む側の `test` のハッシュが変わるよう、
 * `test`・`test:unit` と、個別に定義した `<パッケージ>#test`・`<パッケージ>#test:unit` の `inputs` に入れる。
 * `package#task` は基底を継承しないので、個別の定義にも要る。足し忘れた 1 つだけが穴に戻るのを、ここで止める。
 * 比べるのは「基準の入力をすべて含む」こと。1 つのタスクだけに入力を足すのは正当なので、完全一致にはしない。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TURBO = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "turbo.json"), "utf8"));

/** `test` 系のタスクが必ず含む入力。 */
export const REQUIRED_TEST_INPUTS = [
  "$TURBO_DEFAULT$",
  "$TURBO_ROOT$/packages/ui/src/tokens/fonts.css",
  "$TURBO_ROOT$/packages/test-css/src/**",
];

/** `test` 系のタスク（`test`・`test:unit` と、`<パッケージ>#` 付きのそれ）の名前。`@tasuki/e2e#test` は除く。 */
export function testTaskNames(tasks) {
  return Object.keys(tasks).filter((name) => {
    if (name === "@tasuki/e2e#test") return false;
    const task = name.includes("#") ? name.slice(name.indexOf("#") + 1) : name;
    return task === "test" || task === "test:unit";
  });
}

/** 基準の入力で欠けているもの。 */
export function missingInputs(inputs) {
  return REQUIRED_TEST_INPUTS.filter((i) => !(inputs ?? []).includes(i));
}

test("入力に足した fonts.css と test-css/src が実在する（相対パスが空振りしない）", () => {
  assert.equal(fs.existsSync(path.join(REPO_ROOT, "packages/ui/src/tokens/fonts.css")), true);
  assert.equal(fs.existsSync(path.join(REPO_ROOT, "packages/test-css/src")), true);
});

test("test 系のタスクがすべて、基準の入力を含む", () => {
  const names = testTaskNames(TURBO.tasks);
  assert.ok(names.includes("test") && names.includes("test:unit"), "基底の test・test:unit が無い");
  assert.ok(names.length >= 8, `個別の <パッケージ>#test が見つかりません: ${names.join(", ")}`);
  for (const name of names) {
    assert.deepEqual(missingInputs(TURBO.tasks[name].inputs), [], `${name} の inputs に足りない入力`);
  }
});

test("基準に加えて入力を足したタスクは通り、基準が欠けたら赤になる", () => {
  assert.deepEqual(missingInputs([...REQUIRED_TEST_INPUTS, "$TURBO_ROOT$/extra"]), []);
  assert.deepEqual(missingInputs(REQUIRED_TEST_INPUTS.slice(1)), [REQUIRED_TEST_INPUTS[0]]);
  assert.deepEqual(missingInputs(undefined), REQUIRED_TEST_INPUTS);
});

test("testTaskNames は test・test:unit と <パッケージ># 付きのそれを拾い、e2e の test は拾わない", () => {
  assert.deepEqual(
    testTaskNames({
      test: {},
      "test:unit": {},
      "@tasuki/e2e#test": {},
      "@tasuki/a#test": {},
      "@tasuki/b#test:unit": {},
      "@tasuki/c#test:watch": {},
      lint: {},
    }),
    ["test", "test:unit", "@tasuki/a#test", "@tasuki/b#test:unit"],
  );
});
