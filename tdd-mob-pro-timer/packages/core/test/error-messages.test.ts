/**
 * エラー文言の表と、その引き方の規約を固定するテスト（T064-T066）。
 *
 * ⚠ **このファイルは退行を受けて書き足された。**
 * T066 でサーバー側の文言リテラルを 1 箇所へ集約した際、サーバー専用のコード
 * （`NOT_IN_ROOM` / `DELEGATION_UNAVAILABLE`）を画面表示用の `ERROR_MESSAGES` へ
 * **追記してしまい**、これらの画面表示が既定文言から変わる退行を作った（FR-114 違反）。
 *
 * **型検査もテストも通ってしまった。** 原因は 2 つあり、どちらもテスト側の不足である。
 * 1. 表示の規則が `apps/web/src/App.tsx` の private 関数（`friendlyError`）にあり、
 *    テストから触れなかった → `displayMessageFor()` として core へ出した
 * 2. 「どのコードが画面に出るか」の集合を誰も固定していなかった → 本ファイルで固定する
 *
 * @requirements FR-105, FR-107, FR-114
 */

import { describe, it, expect } from "vitest";
import {
  ERROR_MESSAGES,
  DEFAULT_ERROR_MESSAGE,
  displayMessageFor,
  errorMessageFor,
} from "../src/index.js";

/**
 * **画面に文言が出るコードの集合。ここを増やすと利用者に見える文言が変わる。**
 *
 * 一覧を固定するのは、表への追記が「気づかれない変更」になるのを防ぐためである。
 * コードを 1 行足すだけで、それまで既定文言（「操作を完了できませんでした。」）が
 * 出ていた場面の表示が変わる。**意図した変更ならこの一覧も一緒に直すこと。**
 */
const CODES_SHOWN_TO_USER = [
  "BelowMinMembers",
  "DuplicateName",
  "EmptyName",
  "MemberLimitExceeded",
  "InvalidInterval",
  "UNAUTHORIZED",
  "RATE_LIMITED",
  "PARTICIPANT_OFFLINE",
  "CANNOT_CHANGE_HOST",
  "PARTICIPANT_NOT_FOUND",
  "PASSPHRASE_REQUIRED",
  "PASSPHRASE_MISMATCH",
  "AI_UNLOCK_FAILED",
  "LAST_MANAGER",
] as const;

/** サーバーが wire の `message` に載せるだけで、画面には出さないコード。 */
const SERVER_ONLY_CODES = ["NOT_IN_ROOM", "DELEGATION_UNAVAILABLE"] as const;

describe("画面に表示される文言の表", () => {
  it("表示対象のコードの集合は固定されている", () => {
    // Given（画面に出すと決めたコードの一覧）
    const expected = [...CODES_SHOWN_TO_USER].sort();
    // When
    const actual = Object.keys(ERROR_MESSAGES).sort();
    // Then
    expect(actual).toEqual(expected);
  });

  it("表示対象のコードはすべて空でない文言を持つ", () => {
    // Given
    const codes = CODES_SHOWN_TO_USER;
    // When
    const messages = codes.map((code) => ERROR_MESSAGES[code]);
    // Then
    expect(messages.every((m) => Boolean(m))).toBe(true);
  });

  it("サーバーの wire 専用コードは表に含まない（含めると画面の文言が変わる）", () => {
    // Given
    const codes = SERVER_ONLY_CODES;
    // When
    const found = codes.filter((code) => ERROR_MESSAGES[code] !== undefined);
    // Then
    expect(found).toEqual([]);
  });
});

describe("displayMessageFor（画面に出す文言）", () => {
  it("表示対象のコードはその文言をそのまま返す", () => {
    // Given
    const codes = CODES_SHOWN_TO_USER;
    // When
    const shown = codes.map((code) => displayMessageFor(code));
    // Then
    expect(shown).toEqual(codes.map((code) => ERROR_MESSAGES[code]));
  });

  it("サーバー専用コードには既定文言を返す（サーバーの文言を画面に出さない）", () => {
    // Given
    const codes = SERVER_ONLY_CODES;
    // When
    const shown = codes.map((code) => displayMessageFor(code));
    // Then
    expect(shown).toEqual(codes.map(() => DEFAULT_ERROR_MESSAGE));
  });

  it("知らないコードには既定文言を返す", () => {
    // Given
    const code = "NO_SUCH_CODE";
    // When
    const shown = displayMessageFor(code);
    // Then
    expect(shown).toBe(DEFAULT_ERROR_MESSAGE);
  });
});

describe("errorMessageFor（wire に載せる文言）", () => {
  it("表示対象のコードはその文言を返す", () => {
    // Given
    const codes = ["DuplicateName", "LAST_MANAGER"] as const;
    // When
    const messages = codes.map((code) => errorMessageFor(code));
    // Then
    expect(messages).toEqual(codes.map((code) => ERROR_MESSAGES[code]));
  });

  it("サーバー専用コードはサーバー用の文言を返す（既定文言ではない）", () => {
    // Given
    const code = "NOT_IN_ROOM";
    // When
    const message = errorMessageFor(code);
    // Then
    expect(message).not.toBe(DEFAULT_ERROR_MESSAGE);
    expect(message).toBe("ルームに参加していません");
  });

  it("知らないコードには既定文言を返す", () => {
    // Given
    const code = "NO_SUCH_CODE";
    // When
    const message = errorMessageFor(code);
    // Then
    expect(message).toBe(DEFAULT_ERROR_MESSAGE);
  });
});
