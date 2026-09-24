/**
 * 読み込み時に名乗らず復帰してよいかの判断（#76 F-3）。
 *
 * ⚠ **保存そのもののテストはここに無い**（#95 S5b）。鍵の扱いは 4 つの画面で共有する
 * `packages/sync-client/tests/resume-identity.test.ts` が見る。ここに残るのは
 * **timer の画面が下す判断**だけである。
 *
 * @requirements FR-001, FR-004, FR-005, R16
 */

import { describe, it, expect } from "vitest";
import { shouldResumeOnLoad } from "../../src/sync/resume-identity.js";
import type { ResumeIdentity } from "@tasuki/sync-client";

const alice: ResumeIdentity = {
  code: "ABC123",
  participantId: "p-1",
  resumeToken: "resume-token-xyz",
  displayName: "Alice",
};

describe("shouldResumeOnLoad", () => {
  it("保存値と URL のルームコードが一致すれば復帰する", () => {
    expect(shouldResumeOnLoad(alice, "ABC123")).toBe(true);
  });

  it("URL のルームコードが違えば復帰しない（前のルームへ引き戻さない）", () => {
    expect(shouldResumeOnLoad(alice, "OTHER1")).toBe(false);
  });

  it("保存値が無い・URL にコードが無いなら復帰しない", () => {
    expect(shouldResumeOnLoad(null, "ABC123")).toBe(false);
    expect(shouldResumeOnLoad(alice, null)).toBe(false);
  });

  it("トークンか表示名が空なら復帰しない（別人として二重参加になる）", () => {
    // Given: トークンが空・表示名が空の保存値
    // When / Then: どちらも復帰させない
    expect(shouldResumeOnLoad({ ...alice, resumeToken: "" }, "ABC123")).toBe(false);
    expect(shouldResumeOnLoad({ ...alice, displayName: "" }, "ABC123")).toBe(false);
  });
});
