import { describe, expect, it } from "vitest";
import { validateTopicDraft } from "../src/index.js";

/**
 * @requirements #91 E8(AI が生成し検証を通ったお題を掲げる。AI 由来の値を信頼しない入力として検証する)
 */
describe("validateTopicDraft（AI 由来の値を信頼しない入力として検証する）", () => {
  it("title と body だけを取り出す（余計なキーは落とす）", () => {
    const r = validateTopicDraft({ title: "t", body: "b", exampleTest: "x" });
    expect(r.isOk() && r.value).toEqual({ title: "t", body: "b" });
  });

  it("200 字のタイトル・4000 字の本文は境界として通す", () => {
    const r = validateTopicDraft({ title: "a".repeat(200), body: "b".repeat(4000) });
    expect(r.isOk() && r.value).toEqual({ title: "a".repeat(200), body: "b".repeat(4000) });
  });

  it("201 字のタイトル・4001 字の本文・空白のタイトル・文字列でない値を拒む", () => {
    expect(validateTopicDraft({ title: "a".repeat(201), body: "" }).isErr()).toBe(true);
    expect(validateTopicDraft({ title: "t", body: "b".repeat(4001) }).isErr()).toBe(true);
    expect(validateTopicDraft({ title: "  ", body: "" }).isErr()).toBe(true);
    expect(validateTopicDraft({ title: 1, body: "" }).isErr()).toBe(true);
    expect(validateTopicDraft(null).isErr()).toBe(true);
  });

  it("拒んだときの失敗値は理由の配列を 1 件以上持つ", () => {
    const r = validateTopicDraft({ title: "  ", body: "" });
    expect(r.isErr() && Array.isArray(r.error) && r.error.length > 0).toBe(true);
  });
});
