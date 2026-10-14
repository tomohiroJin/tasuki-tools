import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseSelector } from "./mutation-select.mjs";

/**
 * `scripts/lib/mutation-select.mjs` の自己テスト（#387）。
 *
 * 変異検査の「選んで流す」指定の解釈と、変異の選び方を見る。
 * **打ち間違いが黙って全件実行に化けないこと**を、選び方そのものと同じ重さで見る
 * （以前の `main()` は `--full` 以外の引数を黙って無視し、`--help` で全件が走った）。
 */

describe("parseSelector: 指定の解釈", () => {
  test("指定が無ければ全件", () => {
    assert.deepEqual(parseSelector([]), { kind: "all" });
  });

  test("--full は選び方に関わらない（読み飛ばす）", () => {
    assert.deepEqual(parseSelector(["--full"]), { kind: "all" });
    assert.deepEqual(parseSelector(["--full", "--pkg", "apps/x"]), { kind: "pkg", pkg: "apps/x" });
  });

  test("--changed の基準は既定で origin/main、--base で変えられる", () => {
    assert.deepEqual(parseSelector(["--changed"]), { kind: "changed", base: "origin/main" });
    assert.deepEqual(parseSelector(["--changed", "--base", "HEAD~1"]), { kind: "changed", base: "HEAD~1" });
    assert.deepEqual(parseSelector(["--base", "HEAD~1", "--changed"]), { kind: "changed", base: "HEAD~1" });
  });

  test("--id はカンマ区切りの正の整数", () => {
    assert.deepEqual(parseSelector(["--id", "150,151"]), { kind: "id", ids: [150, 151] });
    assert.deepEqual(parseSelector(["--id", "7"]), { kind: "id", ids: [7] });
  });

  test("--pkg は末尾のスラッシュを落とす", () => {
    assert.deepEqual(parseSelector(["--pkg", "apps/timer-web/"]), { kind: "pkg", pkg: "apps/timer-web" });
  });

  test("未知の引数はエラー（打ち間違いで全件を走らせない）", () => {
    assert.throws(() => parseSelector(["--help"]), /未知の指定/);
    assert.throws(() => parseSelector(["--chaged"]), /未知の指定/);
    assert.throws(() => parseSelector(["--id150"]), /未知の指定/);
    assert.throws(() => parseSelector(["apps/x"]), /未知の指定/);
  });

  test("選び方の指定を 2 つ以上混ぜるとエラー", () => {
    assert.throws(() => parseSelector(["--changed", "--id", "1"]), /1 回に 1 つ/);
    assert.throws(() => parseSelector(["--pkg", "a", "--pkg", "b"]), /1 回に 1 つ/);
  });

  test("値の要る指定に値が無ければエラー", () => {
    assert.throws(() => parseSelector(["--id"]), /値が要ります/);
    assert.throws(() => parseSelector(["--pkg", "--full"]), /値が要ります/);
    assert.throws(() => parseSelector(["--changed", "--base"]), /値が要ります/);
  });

  test("--id の不正な値はエラー", () => {
    for (const bad of ["150,,151", "0", "abc", "1.5", "-1", "150,"]) {
      assert.throws(() => parseSelector(["--id", bad]), /正の整数/, bad);
    }
  });

  test("--pkg が空になる値はエラー", () => {
    assert.throws(() => parseSelector(["--pkg", "/"]), /--pkg/);
  });

  test("--base は --changed の無いところでは使えない", () => {
    assert.throws(() => parseSelector(["--base", "HEAD~1"]), /--changed と一緒に/);
    assert.throws(() => parseSelector(["--pkg", "a", "--base", "HEAD~1"]), /--changed と一緒に/);
  });
});
