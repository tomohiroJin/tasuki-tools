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
});
