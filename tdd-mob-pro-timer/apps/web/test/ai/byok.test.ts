/**
 * ByokProvider のテスト
 * T024: FR-024, NFRセキュリティ(S6)
 */

import { describe, it, expect, vi } from "vitest";
import { ByokProvider } from "../../src/ai/byok.js";
import type { Problem } from "@tdd-mob/core";

describe("ByokProvider", () => {
  it("正常な AI レスポンスを解析して problem を返す", async () => {
    const validProblem: Problem = {
      title: "Test Kata",
      description: "描写",
      requirements: ["req1"],
      exampleTest: "test()",
      hints: [],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: JSON.stringify(validProblem) }],
      }),
    });

    const provider = new ByokProvider({ apiKey: "test-key", fetch: mockFetch as unknown as typeof fetch });
    const result = await provider.generate("TypeScript", "easy");

    expect(result.source).toBe("ai");
    expect(result.problem.title).toBe("Test Kata");
  });

  it("AI レスポンスが不正な JSON の場合は fallback を返す（FR-024）", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: "invalid json {broken" }],
      }),
    });

    const provider = new ByokProvider({ apiKey: "test-key", fetch: mockFetch as unknown as typeof fetch });
    const result = await provider.generate("TypeScript", "easy");

    expect(result.source).toBe("fallback");
  });

  it("ネットワークエラーの場合は fallback を返す（FR-024）", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const provider = new ByokProvider({ apiKey: "test-key", fetch: mockFetch as unknown as typeof fetch });
    const result = await provider.generate("TypeScript", "easy");

    expect(result.source).toBe("fallback");
  });

  it("API キーはリクエスト時のみ使用し、ログに出力されない", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            text: JSON.stringify({
              title: "t",
              description: "d",
              requirements: ["r"],
              exampleTest: "e",
              hints: [],
            }),
          },
        ],
      }),
    });

    const provider = new ByokProvider({
      apiKey: "super-secret-key-xyz",
      fetch: mockFetch as unknown as typeof fetch,
    });
    await provider.generate("TypeScript", "easy");

    // キーがログに出力されていないことを確認
    const allLogs = [
      ...consoleSpy.mock.calls.flat(),
      ...errorSpy.mock.calls.flat(),
    ].join("");
    expect(allLogs).not.toContain("super-secret-key-xyz");

    consoleSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("HTTP エラーレスポンスの場合は fallback を返す", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });

    const provider = new ByokProvider({ apiKey: "test-key", fetch: mockFetch as unknown as typeof fetch });
    const result = await provider.generate("TypeScript", "easy");

    expect(result.source).toBe("fallback");
  });
});
