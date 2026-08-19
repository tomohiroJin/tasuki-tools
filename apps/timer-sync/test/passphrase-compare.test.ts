import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { constantTimeEqual } from "../src/application/secure-compare.js";

/**
 * 照合の**振る舞い**が素の比較と一致することを固定する。
 * タイミング特性そのものはテストで測れないので、「同じ判定を返すこと」だけを
 * 機械で押さえ、定数時間である根拠は constantTimeEqual の実装
 * （node:crypto の timingSafeEqual）に委ねる。
 */
describe("パスフレーズの照合", () => {
  it("一致するとき true", () => {
    expect(constantTimeEqual("himitsu", "himitsu")).toBe(true);
  });
  it("違うとき false", () => {
    expect(constantTimeEqual("himitsu", "himitsX")).toBe(false);
  });
  it("長さが違うとき false（throw しない）", () => {
    expect(constantTimeEqual("himitsu", "himitsuu")).toBe(false);
  });
  it("空文字どうしは true（解除済みルームの扱いは呼び出し側の責務）", () => {
    expect(constantTimeEqual("", "")).toBe(true);
  });
  it("マルチバイトでも判定が一致する", () => {
    expect(constantTimeEqual("あい", "あい")).toBe(true);
    expect(constantTimeEqual("あい", "あう")).toBe(false);
  });
});

/**
 * 呼び出し側が実際に定数時間比較を通ることを、ソースの形で固定する（構造テスト）。
 * タイミング特性は戻り値に現れないため、実行時のテストでは
 * `!==` と `constantTimeEqual` を区別できない。
 */
const ROOM_JOIN_SRC = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../src/application/command-handlers/room-join.ts",
  ),
  "utf8",
);

describe("パスフレーズ照合の形", () => {
  it("constantTimeEqual を通している", () => {
    // Given（ROOM_JOIN_SRC はモジュール冒頭で読み込んだソースファイルの内容を直接使う）
    // When / Then（ソースの正規表現照合をそのまま検証するため操作と検証が同じ式になる）
    expect(ROOM_JOIN_SRC).toMatch(
      /constantTimeEqual\(\s*providedPassphrase\s*,\s*requiredPassphrase\s*\)/,
    );
  });

  it("素の比較演算子でパスフレーズを比べていない", () => {
    // `requiredPassphrase !== undefined` の未設定判定は対象外（両辺の名前で限定する）。
    // Given（ROOM_JOIN_SRC はモジュール冒頭で読み込んだソースファイルの内容を直接使う）
    // When / Then（ソースの正規表現照合をそのまま検証するため操作と検証が同じ式になる）
    expect(ROOM_JOIN_SRC).not.toMatch(
      /providedPassphrase\s*(!==|===|!=|==)\s*requiredPassphrase/,
    );
    expect(ROOM_JOIN_SRC).not.toMatch(
      /requiredPassphrase\s*(!==|===|!=|==)\s*providedPassphrase/,
    );
  });
});
