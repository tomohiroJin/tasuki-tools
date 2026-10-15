/**
 * timer の入口で当てる合言葉の長さの規約（#377）。
 */
import { describe, it, expect } from "bun:test";
import { MAX_PASSPHRASE } from "@tasuki/room-core";
import type { Command } from "@tasuki/timer-core";
import { passphraseWithinLimit } from "../src/application/passphrase-rule.js";

const tooLong = "a".repeat(MAX_PASSPHRASE + 1);
const atLimit = "a".repeat(MAX_PASSPHRASE);

describe("passphraseWithinLimit", () => {
  it.each<[string, Command, boolean]>([
    ["合言葉なしの参加", { command: "room.join", code: "R", displayName: "あ" }, true],
    ["上限ちょうどの参加", { command: "room.join", code: "R", displayName: "あ", passphrase: atLimit }, true],
    ["上限を超える参加", { command: "room.join", code: "R", displayName: "あ", passphrase: tooLong }, false],
    ["上限ちょうどを掛ける", { command: "room.passphrase.set", passphrase: atLimit }, true],
    ["上限を超えて掛ける", { command: "room.passphrase.set", passphrase: tooLong }, false],
    ["合言葉を運ばないコマンド", { command: "time.ping", clientTime: 0 }, true],
  ])("Given %s / When 確かめる / Then %p", (_label, cmd, expected) => {
    expect(passphraseWithinLimit(cmd)).toBe(expected);
  });
});
