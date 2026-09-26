import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import React from "react";
import { TopicCard } from "../../src/ui/components/TopicCard.js";

/**
 * @requirements #91 E15（timer はお題のタイトルと本文を出す）
 */
describe("お題の札", () => {
  it("Given タイトルと本文 / When 描く / Then 「お題」の領域にタイトルと本文の見出しが出る", () => {
    // Given
    const topic = { title: "FizzBuzz", body: "# 振る舞い\n- 3 のときは Fizz", source: "manual" as const };
    // When
    render(<TopicCard topic={topic} />);
    // Then
    const region = screen.getByRole("region", { name: "お題" });
    expect(within(region).getByRole("heading", { level: 3, name: "FizzBuzz" })).toBeInTheDocument();
    expect(within(region).getByRole("heading", { level: 4, name: "振る舞い" })).toBeInTheDocument();
    expect(within(region).getByRole("listitem")).toHaveTextContent("3 のときは Fizz");
  });

  it("Given 本文が空 / When 描く / Then タイトルの見出しの後ろに本文の要素が続かない", () => {
    // Given
    const topic = { title: "FizzBuzz", body: "", source: "manual" as const };
    // When
    render(<TopicCard topic={topic} />);
    // Then
    // 「お題」領域の最後の子要素がタイトルの見出し（h3）であること。
    // Markdown の外側の div が本文の有無に関わらず描かれると、それが
    // 最後の子要素になってこの比較が崩れる（`TopicCard.tsx` の
    // `topic.body !== ""` の条件を外すと赤になることを確認済み・
    // task-3-report.md「修正 1 回目」参照）。
    const region = screen.getByRole("region", { name: "お題" });
    const heading = within(region).getByRole("heading", { level: 3, name: "FizzBuzz" });
    expect(region.lastElementChild).toBe(heading);
  });
});
