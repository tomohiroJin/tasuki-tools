/**
 * SC-040（テストの `.only` と理由の無い `.skip`）の自己テスト（#523）
 *
 * 既知の入力（インライン文字列）に対する判定を固定する。実リポジトリはスキャンしない。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  findFocusedOrSkippedTests,
  sc040FocusedOrSkippedTests,
} from "./focused-skipped-tests.mjs";

const kinds = (file, src) => findFocusedOrSkippedTests(file, src).map((f) => `${f.kind}:${f.line}`);

describe(".only を止める", () => {
  test("it.only / test.only / describe.only を止める", () => {
    // Given
    const src = [
      "describe.only('a', () => {",
      "  it.only('b', () => {});",
      "  test.only('c', () => {});",
      "});",
    ].join("\n");
    // When / Then（検出結果そのものが検証）
    assert.deepEqual(kinds("a.test.ts", src), ["only:1", "only:2", "only:3"]);
  });

  test("Playwright の test.describe.only と test.describe.serial.only を止める", () => {
    // Given
    const src = "test.describe.only('a', () => {});\ntest.describe.serial.only('b', () => {});";
    // When / Then
    assert.deepEqual(kinds("a.spec.ts", src), ["only:1", "only:2"]);
  });

  test("it.concurrent.only と describe.each の後ろの only も止める", () => {
    // Given
    const src = "it.concurrent.only('a', async () => {});\ndescribe.each([1])('x', () => {}).only;";
    // When / Then
    assert.deepEqual(kinds("a.test.ts", src), ["only:1", "only:2"]);
  });

  test("理由のコメントがあっても .only は止める", () => {
    // Given
    const src = "// 理由: 調べている途中\nit.only('a', () => {});";
    // When / Then
    assert.deepEqual(kinds("a.test.ts", src), ["only:2"]);
  });

  test("括弧記法 it['only'] も止める", () => {
    // Given
    const src = "it['only']('a', () => {});";
    // When / Then
    assert.deepEqual(kinds("a.test.ts", src), ["only:1"]);
  });

  test("node:test の { only: true } を止め、{ only: false } は通す", () => {
    // Given
    const src = "it('a', { only: true }, () => {});\nit('b', { only: false }, () => {});";
    // When / Then
    assert.deepEqual(kinds("a.test.mjs", src), ["only:1"]);
  });
});

describe("理由の無い skip 系を止める", () => {
  test("理由の無い .skip / .todo / .fixme / .skipIf / .runIf を止める", () => {
    // Given
    const src = [
      "it.skip('a', () => {});",
      "it.todo('b');",
      "test.fixme('c', () => {});",
      "it.skipIf(cond)('d', () => {});",
      "it.runIf(cond)('e', () => {});",
    ].join("\n");
    // When / Then
    assert.deepEqual(kinds("a.test.ts", src), [
      "no-reason:1",
      "no-reason:2",
      "no-reason:3",
      "no-reason:4",
      "no-reason:5",
    ]);
  });

  test("describe.skip と test.describe.skip も止める", () => {
    // Given
    const src = "describe.skip('a', () => {});\ntest.describe.skip('b', () => {});";
    // When / Then
    assert.deepEqual(kinds("a.spec.ts", src), ["no-reason:1", "no-reason:2"]);
  });

  test("node:test の { skip: true } と { todo: 'あとで' } を止める", () => {
    // Given
    const src = "it('a', { skip: true }, () => {});\nit('b', { todo: 'あとで' }, () => {});";
    // When / Then
    assert.deepEqual(kinds("a.test.mjs", src), ["no-reason:1", "no-reason:2"]);
  });

  test("Playwright の本体の中の test.skip(cond, 'x') も、理由のコメントが無ければ止める", () => {
    // Given
    const src = "test('a', async () => {\n  test.skip(isCi, 'CI では動かない');\n});";
    // When / Then
    assert.deepEqual(kinds("a.spec.ts", src), ["no-reason:2"]);
  });

  test("理由の中身が空の「理由:」は理由と認めない", () => {
    // Given
    const src = "// 理由:\nit.skip('a', () => {});";
    // When / Then
    assert.deepEqual(kinds("a.test.ts", src), ["no-reason:2"]);
  });

  test("空行を挟んだ離れたコメントは理由と認めない", () => {
    // Given
    const src = "// 理由: これは別の話\n\nit.skip('a', () => {});";
    // When / Then
    assert.deepEqual(kinds("a.test.ts", src), ["no-reason:3"]);
  });

  test("理由が別のテストの直上にあるだけでは通らない", () => {
    // Given
    const src = "// 理由: 上のテストの話\nit('a', () => {});\nit.skip('b', () => {});";
    // When / Then
    assert.deepEqual(kinds("a.test.ts", src), ["no-reason:3"]);
  });
});

describe("理由のある skip 系は通す", () => {
  test("直上の // 理由: があれば .skipIf を通す", () => {
    // Given
    const src = [
      "// 理由: 外向きのアドレスが無い環境では到達できない",
      "it.skipIf(EXTERNAL_IP === undefined)('a', () => {});",
    ].join("\n");
    // When / Then
    assert.deepEqual(kinds("a.test.ts", src), []);
  });

  test("複数行のコメントの塊のどこかに「理由:」があれば通す", () => {
    // Given
    const src = [
      "// 外向きのアドレスの有無は環境で決まる。",
      "// 理由: 無い環境では到達できない",
      "// 詳細は ISSUE を見る",
      "it.skip('a', () => {});",
    ].join("\n");
    // When / Then
    assert.deepEqual(kinds("a.test.ts", src), []);
  });

  test("ブロックコメントの理由も通す", () => {
    // Given
    const src = "/** 理由: 実機が要る */\ntest.fixme('a', () => {});";
    // When / Then
    assert.deepEqual(kinds("a.spec.ts", src), []);
  });

  test("本体の中の test.skip も、直上に理由があれば通す", () => {
    // Given
    const src = "test('a', async () => {\n  // 理由: CI では動かない\n  test.skip(isCi, 'x');\n});";
    // When / Then
    assert.deepEqual(kinds("a.spec.ts", src), []);
  });

  test("{ skip: true } も直上に理由があれば通す", () => {
    // Given
    const src = "// 理由: 実機が要る\nit('a', { skip: true }, () => {});";
    // When / Then
    assert.deepEqual(kinds("a.test.mjs", src), []);
  });

  test("describe の中に入れ子にした skipIf も、その文の直上の理由で通す", () => {
    // Given
    const src = [
      "describe('x', () => {",
      "  // 理由: 環境による",
      "  it.skipIf(c)('a', () => {});",
      "});",
    ].join("\n");
    // When / Then
    assert.deepEqual(kinds("a.test.ts", src), []);
  });
});

describe("テストの定義ではないものは見ない", () => {
  test("agenda.skip(...) や driver.skip のようにコマンド名・メソッド名として現れるものを通す", () => {
    // Given
    const src = [
      "agenda.skip('id');",
      "const c = { command: 'driver.skip' };",
      "expect(driver.skip).toBe(1);",
      "it('a', () => { agenda.skip(); driver.only(); room.todo(); });",
    ].join("\n");
    // When / Then
    assert.deepEqual(kinds("a.test.ts", src), []);
  });

  test("文字列・テンプレート・コメントの中の .only / .skip を通す", () => {
    // Given
    const src = [
      "// it.only('x') は置かない",
      "/* describe.skip */",
      "const s = \"it.only('a')\";",
      "const t = `test.skip(${x})`;",
      "it('a', () => {});",
    ].join("\n");
    // When / Then
    assert.deepEqual(kinds("a.test.ts", src), []);
  });

  test("{ skip: false } と、テストの呼び出しではない関数のオプションを通す", () => {
    // Given
    const src = "it('a', { skip: false }, () => {});\nrun({ skip: true });";
    // When / Then
    assert.deepEqual(kinds("a.test.mjs", src), []);
  });

  test(".skip を名前に持つだけのプロパティ（skipReason）を通す", () => {
    // Given
    const src = "it('a', () => { expect(r.skipReason).toBe(null); });";
    // When / Then
    assert.deepEqual(kinds("a.test.ts", src), []);
  });
});

describe("理由のコメントの形（行の頭の「理由:」）", () => {
  test("全角コロンの「理由：」も通す", () => {
    // Given
    const src = "// 理由：実機が要る\nit.skip('a', () => {});";
    // When / Then
    assert.deepEqual(kinds("a.test.ts", src), []);
  });

  test("行の途中の「理由:」は理由と認めない", () => {
    // Given
    const a = "// この理由: a は別\nit.skip('a', () => {});";
    const b = "// 外す理由: 未定\nit.skip('a', () => {});";
    // When / Then
    assert.deepEqual(kinds("a.test.ts", a), ["no-reason:2"]);
    assert.deepEqual(kinds("a.test.ts", b), ["no-reason:2"]);
  });

  test("閉じ記号が重なった中身の無い理由（/** 理由: **/・/* 理由: * */）は理由と認めない", () => {
    // Given
    const a = "/** 理由: **/\nit.skip('a', () => {});";
    const b = "/* 理由: * */\nit.skip('a', () => {});";
    // When / Then
    assert.deepEqual(kinds("a.test.ts", a), ["no-reason:2"]);
    assert.deepEqual(kinds("a.test.ts", b), ["no-reason:2"]);
  });

  test("ブロックコメントの各行頭の * を外して比べる。閉じ記号だけの「理由:」は空とみなす", () => {
    // Given
    const ok = "/**\n * 説明\n * 理由: 実機が要る\n */\nit.skip('a', () => {});";
    const empty = "/* 理由: */\nit.skip('a', () => {});";
    // When / Then
    assert.deepEqual(kinds("a.test.ts", ok), []);
    assert.deepEqual(kinds("a.test.ts", empty), ["no-reason:2"]);
  });
});

describe("別の書き方", () => {
  test("satisfies を挟んだ (it satisfies typeof it).only も止める", () => {
    // Given
    const src = "(it satisfies typeof it).only('a', () => {});";
    // When / Then
    assert.deepEqual(kinds("a.test.ts", src), ["only:1"]);
  });

  test("suite（bun・vitest の別名）も見る", () => {
    // Given
    const src = "suite.only('a', () => {});\nsuite.skip('b', () => {});";
    // When / Then
    assert.deepEqual(kinds("a.test.ts", src), ["only:1", "no-reason:2"]);
  });

  test("型表明を挟んだ (it as any).only も止める", () => {
    // Given
    const src = "(it as any).only('a', () => {});\n(<any>it).skip('b', () => {});";
    // When / Then
    assert.deepEqual(kinds("a.test.ts", src), ["only:1", "no-reason:2"]);
  });

  test("node:test のオプションの引用符つきキー・計算キーも止め、効かない値（undefined・null・false）は通す", () => {
    // Given
    const src = [
      "it('a', { 'skip': true }, () => {});",
      "it('b', { ['only']: true }, () => {});",
      "it('c', { skip: undefined }, () => {});",
      "it('d', { skip: null, todo: false }, () => {});",
    ].join("\n");
    // When / Then
    assert.deepEqual(kinds("a.test.mjs", src), ["no-reason:1", "only:2"]);
  });
});

describe("構文の種類", () => {
  test("TSX のファイルも読む", () => {
    // Given
    const src = "it.only('a', () => { render(<div />); });";
    // When / Then
    assert.deepEqual(kinds("a.test.tsx", src), ["only:1"]);
  });

  test("型注釈・非 null 表明を含む TS を読める", () => {
    // Given
    const src = "const x: number = f()!;\nit.only('a', () => { g<string>(x as number); });";
    // When / Then
    assert.deepEqual(kinds("a.test.ts", src), ["only:2"]);
  });
});

describe("sc040FocusedOrSkippedTests", () => {
  test("違反を「ファイル:行」つきの文として返し、無ければ空配列", () => {
    // Given
    const files = new Map([
      ["b/ok.test.ts", "it('a', () => {});"],
      ["a/bad.test.ts", "\nit.only('a', () => {});\nit.skip('b', () => {});"],
    ]);
    // When
    const problems = sc040FocusedOrSkippedTests(files);
    // Then
    assert.equal(problems.length, 2);
    assert.match(problems[0], /^SC-040 a\/bad\.test\.ts:2 \.only が残っています/);
    assert.match(problems[1], /^SC-040 a\/bad\.test\.ts:3 \.skip に理由がありません/);
    assert.deepEqual(sc040FocusedOrSkippedTests(new Map([["b/ok.test.ts", "it('a', () => {});"]])), []);
  });
});
