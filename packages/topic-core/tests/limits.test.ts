import { describe, expect, it } from "vitest";
import { CATEGORIES, DIFFICULTIES, LANGUAGES, MAX_TOPIC_BODY, MAX_TOPIC_TITLE } from "../src/index.js";

describe("お題の上限と許可リスト", () => {
  it("タイトルは 200 字、本文は 4000 字まで（かつて timer-core にあったお題の上限を引き継ぐ）", () => {
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

  it("種類は TDD・リファクタリング・設計・バグ探しの 4 つで、先頭（画面の既定）は今までの TDD（#634）", () => {
    expect(CATEGORIES).toEqual(["tdd", "refactoring", "design", "debugging"]);
  });
});
