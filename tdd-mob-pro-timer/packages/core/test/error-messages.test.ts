/**
 * error-messages.ts（T064）の回帰テスト。
 *
 * ここに定義した文言が「利用者に実際に表示される文言の正本」であることを保証する。
 * 文言そのものは apps/web/src/App.tsx から1文字も変えずに移したものなので、
 * ここでは値の中身までは固定しない（テストが文言の変更を検出しすぎると、
 * 文言修正のたびにテストも直すことになり本末転倒）。存在すること・型・
 * 既定値へのフォールバックだけを検証する。
 */

import { describe, it, expect } from "vitest";
import { ERROR_MESSAGES, DEFAULT_ERROR_MESSAGE, errorMessageFor } from "../src/index.js";

describe("errorMessageFor", () => {
  it("テーブルに存在するコードはその文言を返す", () => {
    expect(errorMessageFor("DuplicateName")).toBe(ERROR_MESSAGES.DuplicateName);
    expect(errorMessageFor("LAST_MANAGER")).toBe(ERROR_MESSAGES.LAST_MANAGER);
  });

  it("テーブルに無いコードは既定文言を返す", () => {
    expect(errorMessageFor("NO_SUCH_CODE")).toBe(DEFAULT_ERROR_MESSAGE);
  });
});
