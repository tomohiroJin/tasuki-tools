import { describe, expect, it } from "bun:test";
import { DuplicateKeyError, late, LateReferenceError, mergeDisjoint } from "../src/assembly/context.js";

describe("late（組み立ての前方参照）", () => {
  it("値を入れたあとは入れた値を返す", () => {
    const ref = late<number>("answer");
    ref.set(42);
    expect(ref.get()).toBe(42);
  });

  it("値が入る前に引くと、名前つきの LateReferenceError で落ちる", () => {
    const ref = late<number>("wsAdapter");
    expect(() => ref.get()).toThrow(LateReferenceError);
    expect(() => ref.get()).toThrow("wsAdapter");
  });

  it("2 度目の set は組み立ての誤りとして落ちる", () => {
    const ref = late<number>("destroyRoom");
    ref.set(1);
    expect(() => ref.set(2)).toThrow(LateReferenceError);
    expect(ref.get()).toBe(1);
  });

  it("undefined を入れても「入った」と扱う（未設定と区別する）", () => {
    const ref = late<undefined>("nothing");
    ref.set(undefined);
    expect(ref.get()).toBeUndefined();
  });
});

describe("mergeDisjoint（破棄の束）", () => {
  it("鍵が重ならない部品を 1 つの束に合わせる", () => {
    expect(mergeDisjoint({ a: 1 }, { b: 2 }, { c: 3 })).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("同じ鍵を 2 つの部品が返したら、後勝ちにせず DuplicateKeyError で落ちる（鍵の名前を含む）", () => {
    expect(() => mergeDisjoint({ topics: 1 }, { topics: 2 })).toThrow(DuplicateKeyError);
    expect(() => mergeDisjoint({ topics: 1 }, { topics: 2 })).toThrow("topics");
  });
});
