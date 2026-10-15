/**
 * 合言葉の長さの上限（#377）。
 */
import { describe, it, expect } from "vitest";
import { MAX_PASSPHRASE, isPassphraseWithinLimit } from "../src/passphrase.js";

describe("合言葉の長さの上限", () => {
  it("Given 上限は 128 字 / When 値を見る / Then timer で掛けていた上限のまま変わらない", () => {
    expect(MAX_PASSPHRASE).toBe(128);
  });

  it.each([
    ["空文字（解除）", "", true],
    ["上限ちょうど", "a".repeat(128), true],
    ["上限を 1 字超える", "a".repeat(129), false],
  ])("Given %s / When 確かめる / Then %s", (_label, passphrase, expected) => {
    expect(isPassphraseWithinLimit(passphrase)).toBe(expected);
  });
});
