/**
 * FakeCodeGen（test/support 共有ヘルパ）のテスト
 *
 * 既存 27 ファイルの `FakeCodeGen` ローカル定義に共通する挙動
 * （1 から始まる決定的な連番・単調増加）を検証する。
 *
 * @requirements FR-097, US2
 */

import { describe, it, expect } from "vitest";
import { FakeCodeGen } from "./fake-code-gen.js";

describe("FakeCodeGen", () => {
  it("generate() は 1 から始まる決定的な連番を返す", () => {
    // Given
    const codeGen = new FakeCodeGen();

    // When / Then（連続呼び出しごとに値を確認する）
    expect(codeGen.generate()).toBe("ROOM01");
    expect(codeGen.generate()).toBe("ROOM02");
  });

  it("generateParticipantId() / generateResumeToken() も単調増加する", () => {
    // Given
    const codeGen = new FakeCodeGen();

    // When / Then（種別をまたいで単調増加することを確認する）
    expect(codeGen.generateParticipantId()).toBe("pid-1");
    expect(codeGen.generateResumeToken()).toBe("rt-2");
    expect(codeGen.generateParticipantId()).toBe("pid-3");
  });

  it("インスタンスが異なればカウンタは独立している", () => {
    // Given
    const a = new FakeCodeGen();
    const b = new FakeCodeGen();

    // When（a だけを2回進める）
    a.generate();
    a.generate();

    // Then（b は独立して 1 から始まる）
    expect(b.generate()).toBe("ROOM01");
  });
});
