import { describe, expect, it } from "vitest";
import { formatRecordMarkdown } from "../../src/records/record-markdown.js";

describe("完成記録の Markdown の URL（#408）", () => {
  it.each([
    ["https://example.com/<b>太字</b>", "<https://example.com/>\\<b\\>太字\\</b\\>"],
    ["see https://example.com/a.", "see <https://example.com/a>."],
    ["資料はhttps://example.com/a。次へ", "資料は<https://example.com/a>。次へ"],
    ["https://example.com/a、次へ", "<https://example.com/a>、次へ"],
    ["メモ_https://example.com/a*b*c", "メモ\\_<https://example.com/a*b*c>"],
    ["~b~=http://#&amp;」~", "\\~b\\~=http://#\\&amp;」\\~"],
  ])("URL と隣の本文を区別する（%s）", (topicTitle, expected) => {
    const markdown = formatRecordMarkdown({
      id: "record",
      topicTitle,
      elapsedSeconds: 0,
      members: [],
      totalSwitches: 0,
      completedAt: 0,
    });

    expect(markdown.split("\n")[2]).toBe(`- お題：${expected}`);
  });
});
