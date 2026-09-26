import type { Difficulty, Language } from "./limits.js";

/**
 * AI へ渡すプロンプト（#91）。
 *
 * 本文は Markdown として描かれるので、最初のテストの例はコードの囲み（```）で囲ませる
 * （定型バンクの本文と同じ形）。JSON 全体を囲みで包ませないのは応答の解析のためで、
 * 本文の中の囲みとは別の話である。
 *
 * **埋め込むのは許可リストの値だけである**（`docs/adr/0012` D10）。引数の型が
 * `Language` / `Difficulty` なのはそのためで、利用者が手で書いたタイトル・本文は
 * ここへ入らない。
 */
export function buildTopicPrompt(language: Language, difficulty: Difficulty): string {
  return `You are a TDD coding kata generator. Generate a programming kata for ${language} at ${difficulty} difficulty.

Return ONLY a valid JSON object with this exact structure (no code fence around the JSON, no explanation):
{
  "title": "短いお題名（日本語・3〜10語相当）",
  "body": "お題の本文（日本語）"
}

Rules for "body":
- Write in NATURAL, CLEAR JAPANESE.
- Include: what to build (1-2 sentences), 4-6 testable behaviors as a "- " list, and one example of the first test to write in ${language} syntax with ENGLISH identifiers.
- Put the example of the first test inside a Markdown code fence: a line of \`\`\` before the code and a line of \`\`\` after it.
- Keep the whole body under 3000 characters.
- Difficulty: ${difficulty} (easy=beginner/30min, medium=intermediate/60min, hard=advanced/90min+)
- The kata must be suitable for TDD practice (test-first approach). Avoid trivial one-liners.`;
}
