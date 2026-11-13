import { describe, expect, it } from "bun:test";
import { late, LateReferenceError } from "../src/assembly/context.js";

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
