import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createControlCache } from "./mutation-control-cache.mjs";

/**
 * 対照実行の使い回し（#387・設計正本 §4.3）の自己テスト。
 * 同じ鍵の 2 回目以降は実行せずに最初の結果を返し、違う鍵は必ず実行することを、
 * 実行の回数で見る。
 */
describe("createControlCache", () => {
  test("同じ鍵は 1 回だけ実行し、2 回目以降は最初の結果を reused 付きで返す", () => {
    const calls = [];
    const cache = createControlCache(
      (m) => m.key,
      (m) => {
        calls.push(m.id);
        return { passed: true, command: `cmd-${m.key}` };
      },
      () => true,
    );
    assert.deepEqual(cache.run({ id: 1, key: "a" }), { passed: true, command: "cmd-a", reused: false });
    assert.deepEqual(cache.run({ id: 2, key: "a" }), { passed: true, command: "cmd-a", reused: true });
    assert.deepEqual(calls, [1]);
    assert.equal(cache.reusedCount, 1);
  });

  test("違う鍵は使い回さない", () => {
    const calls = [];
    const cache = createControlCache(
      (m) => m.key,
      (m) => {
        calls.push(m.id);
        return { passed: true };
      },
      () => true,
    );
    cache.run({ id: 1, key: "a" });
    cache.run({ id: 2, key: "b" });
    cache.run({ id: 3, key: "a" });
    assert.deepEqual(calls, [1, 2]);
    assert.equal(cache.reusedCount, 1);
  });

  test("使い回しの前提（canReuse）が false の間は毎回実行し、true に戻れば使い回す", () => {
    const calls = [];
    let clean = true;
    const cache = createControlCache(
      (m) => m.key,
      (m) => {
        calls.push(m.id);
        return { passed: true };
      },
      () => clean,
    );
    cache.run({ id: 1, key: "a" });
    clean = false;
    assert.equal(cache.run({ id: 2, key: "a" }).reused, false);
    assert.equal(cache.run({ id: 3, key: "a" }).reused, false);
    assert.deepEqual(calls, [1, 2, 3]);
    assert.equal(cache.reusedCount, 0);
    clean = true;
    assert.equal(cache.run({ id: 4, key: "a" }).reused, true);
    assert.deepEqual(calls, [1, 2, 3]);
    assert.equal(cache.reusedCount, 1);
  });
});
