import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyFailure } from "./check-outcome.mjs";

/**
 * `scripts/lib/check-outcome.mjs` の自己テスト（#508）。
 * 出力の形は 2026-11-02 に手元で起こした実物（vitest 4.1・turbo 越し・ワーカーの起動を 70 秒止めた）から取った。
 */

const start = (pkg, file) =>
  `${pkg}:test: \u001b[31mError\u001b[22m: [vitest-pool]: Failed to start forks worker for test files /repo/${file}.\u001b[39m\n` +
  `${pkg}:test: Caused by: Error: [vitest-pool-runner]: Timeout waiting for worker to respond`;
const caught = (pkg, n) => `${pkg}:test: Vitest caught ${n} unhandled error${n > 1 ? "s" : ""} during the test run.`;
const turbo = (body, failed) => `${body}\n\n Tasks:    1 successful, 2 total\nFailed:    ${failed}\n\n ERROR  run failed: command  exited (1)\n`;

test("turbo 越しで、起動の失敗だけのタスクは未実行", () => {
  const output = turbo(
    [
      "@tasuki/rate-limit:test:  ✓ tests/a.test.ts (35 tests)",
      "@tasuki/sync-client:test:  ✓ tests/b.test.ts (5 tests)",
      caught("@tasuki/sync-client", 1),
      start("@tasuki/sync-client", "packages/sync-client/tests/connection.test.ts"),
      "@tasuki/sync-client:test:  Test Files  5 passed (5)",
      "@tasuki/sync-client:test:       Tests  42 passed (42)",
      "@tasuki/sync-client:test:      Errors  1 error",
    ].join("\n"),
    "@tasuki/sync-client#test",
  );
  assert.deepEqual(classifyFailure(output), {
    kind: "not-run",
    notStarted: [{ task: "@tasuki/sync-client#test", files: ["/repo/packages/sync-client/tests/connection.test.ts"] }],
  });
});

test("起動の失敗があっても、同じタスクに本物の失敗があれば失敗", () => {
  for (const real of [" FAIL  tests/b.test.ts > b", "   × b 5ms", " Tests  1 failed | 1 passed (2)", " Test Files  1 failed (2)"]) {
    const output = turbo(
      [caught("@tasuki/a", 1), start("@tasuki/a", "x.test.ts"), `@tasuki/a:test: ${real}`].join("\n"),
      "@tasuki/a#test",
    );
    assert.equal(classifyFailure(output).kind, "failed", real);
  }
});

test("別のタスクが本物の失敗なら、全体は失敗（起動しなかったファイルは返す）", () => {
  const output = turbo(
    [caught("@tasuki/a", 1), start("@tasuki/a", "x.test.ts"), "@tasuki/b:test: (fail) b > c [1.00ms]"].join("\n"),
    "@tasuki/a#test, @tasuki/b#test",
  );
  const r = classifyFailure(output);
  assert.equal(r.kind, "failed");
  assert.deepEqual(r.notStarted, [{ task: "@tasuki/a#test", files: ["/repo/x.test.ts"] }]);
});

test("起動の失敗より多い未処理のエラーは、本物のエラーとして失敗", () => {
  const output = turbo([caught("@tasuki/a", 2), start("@tasuki/a", "x.test.ts")].join("\n"), "@tasuki/a#test");
  assert.equal(classifyFailure(output).kind, "failed");
});

test("型検査・lint などの起動の失敗を含まない赤は失敗", () => {
  assert.equal(classifyFailure("src/a.ts(1,7): error TS2322: Type 'string' is not assignable").kind, "failed");
  assert.equal(classifyFailure("").kind, "failed");
  assert.equal(classifyFailure(turbo("@tasuki/a:test: boom", "@tasuki/a#test")).kind, "failed");
});

test("turbo の要約が無い出力（vitest を直に流した）は全体を 1 つとして見る", () => {
  const direct = [
    "Vitest caught 1 unhandled error during the test run.",
    "Error: [vitest-pool]: Failed to start forks worker for test files /repo/a.test.mjs.",
    " Test Files  no tests",
  ].join("\n");
  assert.deepEqual(classifyFailure(direct), { kind: "not-run", notStarted: [{ task: null, files: ["/repo/a.test.mjs"] }] });
  assert.equal(classifyFailure(`${direct}\n FAIL  b.test.mjs > b`).kind, "failed");
});
