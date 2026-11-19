import { describe, expect, it } from "vitest";
import { renderTopicBody } from "../src/topic-render.js";
import type { TopicBankEntry } from "../src/topic-bank.js";
import { LANGUAGES, type Language } from "../src/index.js";

const allLanguages = (f: (l: Language) => string): Record<Language, string> =>
  Object.fromEntries(LANGUAGES.map((l) => [l, f(l)])) as Record<Language, string>;

const ENTRY: TopicBankEntry = {
  title: "例",
  body: "## 背景\n\n{{slot:fn}} を作る。\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n",
  difficulty: "easy",
  category: "tdd",
  slots: {
    fn: allLanguages((l) => (l === "Python" ? "`fizz_buzz(n)`" : "`fizzBuzz(n)`")),
    firstTest: allLanguages((l) => `test in ${l}`),
  },
};

/**
 * @requirements #634（PR #643 のレビュー: 定型を選んだ言語で出す）
 */
describe("renderTopicBody", () => {
  it("Given 言語 / When 本文を組む / Then 差し込み口がその言語の値に置き換わる", () => {
    expect(renderTopicBody(ENTRY, "Python")).toBe(
      "## 背景\n\n`fizz_buzz(n)` を作る。\n\n最初のテストの例:\n```\ntest in Python\n```\n",
    );
    expect(renderTopicBody(ENTRY, "Go")).toContain("`fizzBuzz(n)` を作る。");
    expect(renderTopicBody(ENTRY, "Go")).toContain("```\ntest in Go\n```");
  });

  it("差し込んだ値の中の {{slot:…}} は、もう一度は置き換えない（コードの中の字をそのまま出す）", () => {
    const entry: TopicBankEntry = {
      ...ENTRY,
      slots: { ...ENTRY.slots, firstTest: allLanguages(() => 'println!("{{slot:fn}}")') },
    };
    expect(renderTopicBody(entry, "Rust")).toContain('println!("{{slot:fn}}")');
  });

  it("差し込み口の無い本文は、そのまま返す", () => {
    const entry: TopicBankEntry = { ...ENTRY, body: "## 背景\n\n本文", slots: {} };
    expect(renderTopicBody(entry, "Ruby")).toBe("## 背景\n\n本文");
  });

  it("値の無い差し込み口は、置き換えずに残す（黙って空にしない。バンクの検査が見つける）", () => {
    const entry: TopicBankEntry = { ...ENTRY, body: "{{slot:missing}}", slots: {} };
    expect(renderTopicBody(entry, "Ruby")).toBe("{{slot:missing}}");
  });
});
