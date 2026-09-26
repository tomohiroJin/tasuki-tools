import { describe, expect, it } from "vitest";
import { buildTopicPrompt } from "../src/index.js";

/**
 * @requirements #91(docs/adr/0012 D10 の許可リスト埋め込み。AI 生成プロンプトの土台)
 */
describe("buildTopicPrompt", () => {
  it("言語と難易度を埋め、title と body だけの JSON を求める", () => {
    const p = buildTopicPrompt("Rust", "medium");
    expect(p).toContain("Rust");
    expect(p).toContain("medium");
    expect(p).toContain('"title"');
    expect(p).toContain('"body"');
    expect(p).not.toContain('"exampleTest"');
  });

  it("最初のテストの例をコードの囲みに入れるよう求め、地の文で書かせない", () => {
    // Given: 許可リストの言語と難易度
    const [language, difficulty] = ["Python", "easy"] as const;
    // When
    const p = buildTopicPrompt(language, difficulty);
    // Then: 囲みの指示があり、旧い「地の文で改行して書く」指示は残っていない
    expect(p).toMatch(/first test[^\n]*\n- Put the example of the first test inside a Markdown code fence: a line of ``` before the code and a line of ``` after it\./);
    expect(p).not.toContain("plain prose");
  });
});
