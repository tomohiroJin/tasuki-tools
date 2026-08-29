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
   * 接尾辞の文字集合（実装と同じもの）。
   *
   * **これを探索空間の計算に使ってはならない。** テスト側の定数から組み立てると、
   * 実装の文字集合が縮んでも気づけない（実際に「集合を 4 種へ縮める」変異が
   * 素通りした・#144）。下の判定は**生成された接尾辞から実際に使われている文字を
   * 観測して**組み立て、この定数とは突き合わせるだけにする。
   */
  const SUFFIX_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

  /**
   * ADR-0011 決定4 の目標値と前提レート。
   * **数値の正本は ADR-0011 決定4（目標 1 年）と #103 設計正本 §3.3（探索空間）** で、
   * ここに置くのは判定を組み立てるための最小限だけ。
   */
  const ONE_YEAR_SECONDS = 31_536_000;
  const SUSTAINED_ATTEMPTS_PER_SECOND = 1;

  /** 接尾辞を多数引いて、実際に使われている文字と長さを観測する。 */
  function observeSuffixes(samples: number) {
    const characters = new Set<string>();
    const lengths = new Set<number>();
    for (let i = 0; i < samples; i++) {
      const suffix = gen.generate("observe").split("-").pop()!;
      lengths.add(suffix.length);
      for (const ch of suffix) characters.add(ch);
    }
    return { characters, lengths };
  }

  it("接尾辞に使われる文字は実装と規約で過不足なく一致する", () => {
    // Given: 1 文字が 500 標本（4,000 文字）に一度も出ない確率は無視できる
    const { characters } = observeSuffixes(500);
    // When / Then: **両方向**で見る。部分集合の判定だけだと集合が縮んでも通る
    expect([...characters].sort().join("")).toBe([...SUFFIX_ALPHABET].sort().join(""));
  });

  it("接尾辞の探索空間が全探索 1 年以上になる（ADR-0011 決定4 の下限）", () => {
    // Given: 実際に生成された接尾辞から、文字の種類数と長さを観測する
    const { characters, lengths } = observeSuffixes(500);
    expect(lengths.size, "接尾辞の長さが揺れています").toBe(1);
    // When: 観測した値だけで探索空間を組み立てる（テスト側の定数は使わない）
    const searchSpace = Math.pow(characters.size, [...lengths][0]!);
    const secondsToExhaust = searchSpace / SUSTAINED_ATTEMPTS_PER_SECOND;
    // Then: 32 種 4 文字では 12.1 日で、目標に届かなかった（#144）
    expect(secondsToExhaust).toBeGreaterThanOrEqual(ONE_YEAR_SECONDS);
  });
});
