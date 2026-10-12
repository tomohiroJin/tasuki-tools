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
    // シートは閉じていて a11y ツリーに出ない。本文の領域（読む面）の中だけを見る
    const body = within(region).getByRole("region", { name: "FizzBuzz" });
    expect(within(body).getByRole("heading", { level: 4, name: "振る舞い" })).toBeInTheDocument();
    expect(within(body).getByRole("listitem")).toHaveTextContent("3 のときは Fizz");
  });

  it("Given 本文がある / When 描く / Then h2「お題」→ h3 タイトル → 本文の見出しは h4 の順で、読む面とシートを持つ", () => {
    // Given
    const topic = { title: "FizzBuzz", body: "# 振る舞い\n\n本文です", source: "manual" as const };
    // When
    const { container } = render(<TopicCard topic={topic} />);
    // Then
    const levels = Array.from(container.querySelectorAll("h2, h3, h4, h5, h6")).map((h) => `${h.tagName}:${h.textContent}`);
    // 64rem 未満の写し（inert）とシートの中の h3（タイトルの写し）も数える。本文の見出しは `headingBase={4}` で h4 から
    expect(levels).toEqual(["H2:お題", "H3:FizzBuzz", "H4:振る舞い", "H4:振る舞い", "H3:FizzBuzz", "H4:振る舞い"]);
    expect(container.querySelector("section.ui-reader")).not.toBeNull();
    expect(container.querySelector(".ui-reader-body .ui-md")).not.toBeNull();
    // 3 行の写しは inert（Tab の行き先と読み上げから外す）で、本文の領域でも操作の対象でもない。実際の Tab は E2E が見る
    const preview = container.querySelector(".ui-reader-preview");
    expect(preview).not.toBeNull();
    expect(preview).toHaveAttribute("inert");
    expect(preview).not.toHaveAttribute("role");
    expect(preview).not.toHaveAttribute("tabindex");
    expect(preview?.nextElementSibling).toBe(container.querySelector(".ui-reader-body"));
    expect(container.querySelector(".markdown")).toBeNull();
    expect(screen.getByRole("button", { name: "続きを読む", hidden: true })).toBeInTheDocument();
    expect(container.querySelector("dialog.ui-drawer")).not.toBeNull();
  });

  it("Given 本文がある / When 描く / Then シートの h3 も札の h3 と同じ文字の段のクラスを持つ（reset.css が h3 を本文の字に戻すため）", () => {
    // Given
    const topic = { title: "FizzBuzz", body: "本文です", source: "manual" as const };
    // When
    const { container } = render(<TopicCard topic={topic} />);
    // Then
    const titles = Array.from(container.querySelectorAll("h3"));
    expect(titles).toHaveLength(2);
    for (const h of titles) expect(h).toHaveClass("timer-topic-title");
    expect(container.querySelector(".ui-drawer-head h3")).toHaveClass("timer-topic-title");
  });

  it("Given 本文が空 / When 描く / Then 「続きを読む」もシートも本文の領域も描かない", () => {
    // Given
    const topic = { title: "FizzBuzz", body: "", source: "manual" as const };
    // When
    const { container } = render(<TopicCard topic={topic} />);
    // Then
    // `topic.body !== ""` の条件を外すと、空の読む面・ボタン・シートが描かれて赤になる
    expect(screen.queryByRole("button", { name: "続きを読む", hidden: true })).toBeNull();
    expect(container.querySelector("dialog")).toBeNull();
    expect(container.querySelector(".ui-reader-body")).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: "FizzBuzz" })).toBeInTheDocument();
  });
});
