/**
 * お題のプレーンテキスト整形の characterization test（#167 E4・FR-013）。
 *
 * `App.tsx` の private 関数を `src/ui/problem-text.ts` へ切り出した際に、
 * 整形結果が 1 文字も変わっていないことを固定する（振る舞いを「良くしない」）。
 *
 * @requirements FR-013 / docs/adr/0015 MUST 1
 */
import { describe, it, expect } from "vitest";
import { formatProblemText } from "../../src/ui/problem-text.js";

const base = {
  title: "FizzBuzz",
  description: "3 の倍数で Fizz",
  requirements: [] as string[],
  exampleTest: "",
  hints: [] as string[],
  source: "fallback" as const,
};

describe("formatProblemText", () => {
  it("タイトルと説明だけなら空行 1 つで挟んで返す", () => {
    expect(formatProblemText(base)).toBe("FizzBuzz\n\n3 の倍数で Fizz");
  });

  it("要件があれば見出しつきの箇条書きにする", () => {
    expect(formatProblemText({ ...base, requirements: ["A", "B"] })).toBe(
      "FizzBuzz\n\n3 の倍数で Fizz\n\n要件:\n- A\n- B",
    );
  });

  it("例示テストがあれば見出しつきで載せる", () => {
    expect(formatProblemText({ ...base, exampleTest: "expect(f(3)).toBe('Fizz')" })).toBe(
      "FizzBuzz\n\n3 の倍数で Fizz\n\n例示テスト:\nexpect(f(3)).toBe('Fizz')",
    );
  });

  it("ヒントがあれば見出しつきの箇条書きにする", () => {
    expect(formatProblemText({ ...base, hints: ["剰余"] })).toBe(
      "FizzBuzz\n\n3 の倍数で Fizz\n\nヒント:\n- 剰余",
    );
  });

  it("末尾の余分な空白は落とす", () => {
    expect(formatProblemText(base).endsWith("\n")).toBe(false);
  });
});
