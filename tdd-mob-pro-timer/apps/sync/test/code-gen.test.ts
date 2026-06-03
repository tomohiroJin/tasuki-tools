/**
 * NanoidCodeGen のルームコード生成テスト（①ルーム名＋接尾辞）
 */

import { describe, it, expect } from "vitest";
import { NanoidCodeGen } from "../src/adapters/nanoid-code-gen.js";

describe("NanoidCodeGen.generate（ルーム名＋接尾辞）", () => {
  const gen = new NanoidCodeGen();

  it("seed 無しはランダムコード（英数）", () => {
    const code = gen.generate();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it("seed ありは slug＋接尾辞（例 morning-mob-xxxx）", () => {
    const code = gen.generate("Morning Mob");
    expect(code).toMatch(/^morning-mob-[a-z0-9]{4}$/);
  });

  it("記号・空白は1つのハイフンに畳まれ、前後ハイフンは除去", () => {
    const code = gen.generate("  Team   A!! ");
    expect(code).toMatch(/^team-a-[a-z0-9]{4}$/);
  });

  it("日本語のルーム名も保持される（Unicode）", () => {
    const code = gen.generate("朝会モブ");
    expect(code).toMatch(/^朝会モブ-[a-z0-9]{4}$/);
  });

  it("毎回異なる接尾辞で衝突しにくい", () => {
    const a = gen.generate("dup");
    const b = gen.generate("dup");
    expect(a).not.toBe(b);
  });

  it("slug が空（記号のみ）ならランダムにフォールバック", () => {
    const code = gen.generate("!!!");
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
  });
});
