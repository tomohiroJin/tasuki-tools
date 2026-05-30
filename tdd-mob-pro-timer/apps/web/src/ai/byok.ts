/**
 * ByokProvider — ユーザー自身の API キーで Anthropic API を直接呼ぶ
 * T025: FR-024, FR-027, NFRセキュリティ(S6)
 * API キーはクライアントのみ・サーバー送信禁止・ログ禁止
 */

import { validateProblem, pickFallback, buildProblemPrompt } from "@tdd-mob/core/problem";
import type { ProblemWithSource } from "@tdd-mob/core/problem";
import type { ProblemProvider } from "./provider.js";

export interface ByokProviderOptions {
  apiKey: string;
  /** テスト用 fetch モック */
  fetch?: typeof globalThis.fetch;
}

export class ByokProvider implements ProblemProvider {
  private readonly apiKey: string;
  private readonly fetch: typeof globalThis.fetch;

  constructor(options: ByokProviderOptions) {
    this.apiKey = options.apiKey;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async generate(language: string, difficulty: string): Promise<ProblemWithSource> {
    try {
      const prompt = buildProblemPrompt(language, difficulty);

      const response = await this.fetch(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1024,
            messages: [{ role: "user", content: prompt }],
          }),
        },
      );

      if (!response.ok) {
        return pickFallback(language, difficulty);
      }

      const data = await response.json() as {
        content: Array<{ text: string }>;
      };

      const text = data.content[0]?.text ?? "";

      // JSON を抽出（AIが```json...```で囲む場合もある）
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return pickFallback(language, difficulty);
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return pickFallback(language, difficulty);
      }

      // Valibot で検証（AI由来のテキストを信頼しない FR-023）
      const validated = validateProblem(parsed);
      if (validated.isErr()) {
        return pickFallback(language, difficulty);
      }

      return { problem: validated.value, source: "ai" };
    } catch {
      // ネットワークエラー等は必ず定型へ縮退（FR-024）
      return pickFallback(language, difficulty);
    }
  }
}
