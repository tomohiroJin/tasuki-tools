/**
 * NanoidCodeGen のルームコード生成テスト（①ルーム名＋接尾辞）
 */

import { describe, it, expect } from "bun:test";
import { NanoidCodeGen } from "../src/adapters/nanoid-code-gen.js";

describe("NanoidCodeGen.generate（ルーム名＋接尾辞）", () => {
  const gen = new NanoidCodeGen();

  it("seed 無しはランダムコード（英数）", () => {
    const code = gen.generate();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it("seed ありは slug＋接尾辞（例 morning-mob-xxxxxxxx）", () => {
    const code = gen.generate("Morning Mob");
    expect(code).toMatch(/^morning-mob-[a-z0-9]{8}$/);
  });

  it("記号・空白は1つのハイフンに畳まれ、前後ハイフンは除去", () => {
    const code = gen.generate("  Team   A!! ");
    expect(code).toMatch(/^team-a-[a-z0-9]{8}$/);
  });

  it("日本語のルーム名も保持される（Unicode）", () => {
    const code = gen.generate("朝会モブ");
    expect(code).toMatch(/^朝会モブ-[a-z0-9]{8}$/);
  });

  it("毎回異なる接尾辞で衝突しにくい", () => {
    // Given（同一のルーム名を対象にする）
    // When
    const a = gen.generate("dup");
    const b = gen.generate("dup");
    // Then
    expect(a).not.toBe(b);
  });

  it("slug が空（記号のみ）ならランダムにフォールバック", () => {
    const code = gen.generate("!!!");
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
  });

  /**
   * 接尾辞の文字集合（実装と同じもの）。**ここだけを見て桁数を決めない** —
   * 下の判定は「この集合の大きさ」と「実際に生成された接尾辞の長さ」から
   * 探索空間を組み立てる。実装側で集合が縮んでも桁数が縮んでも赤になる。
   */
  const SUFFIX_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

  /**
   * ADR-0011 決定4 の目標値と前提レート。
   * **数値の正本は ADR-0011 決定4（目標 1 年）と #103 設計正本 §3.3（探索空間）** で、
   * ここに置くのは判定を組み立てるための最小限だけ。
   */
  const ONE_YEAR_SECONDS = 31_536_000;
  const SUSTAINED_ATTEMPTS_PER_SECOND = 1;

  it("接尾辞は決められた文字集合だけを使う（集合が縮めば探索空間も縮む）", () => {
    // Given（多めに引いて、たまたま通ることを避ける）
    const allowed = new Set(SUFFIX_ALPHABET);
    // When
    const suffixes = Array.from({ length: 200 }, () => gen.generate("alphabet").split("-").pop()!);
    // Then
    for (const suffix of suffixes) {
      for (const ch of suffix) expect(allowed.has(ch), `想定外の文字: ${ch}`).toBe(true);
    }
  });

  it("接尾辞の探索空間が全探索 1 年以上になる（ADR-0011 決定4 の下限）", () => {
    // Given: 決定4 の前提レート（#103 実装後の持続レート・単一 IP）
    const suffix = gen.generate("entropy").split("-").pop()!;
    // When: 実際に生成された接尾辞から探索空間を組み立てる
    const searchSpace = Math.pow(SUFFIX_ALPHABET.length, suffix.length);
    const secondsToExhaust = searchSpace / SUSTAINED_ATTEMPTS_PER_SECOND;
    // Then: 4 文字だと 12.1 日で、目標に届かなかった（#144）
    expect(secondsToExhaust).toBeGreaterThanOrEqual(ONE_YEAR_SECONDS);
  });
});
