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

  it("Given 本文が空 / When 描く / Then タイトルだけが出る", () => {
    // Given
    const topic = { title: "FizzBuzz", body: "", source: "manual" as const };
    // When
    render(<TopicCard topic={topic} />);
    // Then
    expect(screen.getByRole("region", { name: "お題" }).querySelector(".md")).toBeNull();
  });
});
