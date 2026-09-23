import { describe, expect, it } from "vitest";
import { DIFFICULTIES, LANGUAGES, MAX_TOPIC_BODY, MAX_TOPIC_TITLE } from "../src/index.js";

describe("お題の上限と許可リスト", () => {
  it("タイトルは 200 字、本文は 4000 字まで（現行の MAX_PROBLEM_TITLE / MAX_PROBLEM_TEXT を引き継ぐ）", () => {
    expect([MAX_TOPIC_TITLE, MAX_TOPIC_BODY]).toEqual([200, 4000]);
  });

  it("言語は timer の画面にあった 10 言語と同じ並び", () => {
    expect(LANGUAGES).toEqual([
      "TypeScript", "JavaScript", "Python", "Java", "Go",
      "Ruby", "Rust", "C#", "Kotlin", "Swift",
    ]);
  });

  it("難易度は easy / medium / hard", () => {
    expect(DIFFICULTIES).toEqual(["easy", "medium", "hard"]);
  });
});
