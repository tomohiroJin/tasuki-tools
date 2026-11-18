import { CATEGORIES, DIFFICULTIES, LANGUAGES, type Category, type Difficulty, type Language } from "./limits.js";

/**
 * AI へ渡すプロンプト（#91。種類ごとに分けたのは #634）。
 *
 * 本文は Markdown として描かれるので、コードはコードの囲み（```）で囲ませる
 * （定型バンクの本文と同じ形）。JSON 全体を囲みで包ませないのは応答の解析のためで、
 * 本文の中の囲みとは別の話である。
 *
 * **種類ごとにプロンプトを 1 本ずつ持つ**（#634 の決めること 3）。1 本に分岐を詰めると、
 * ある種類の指示を直したときに別の種類の出力まで変わる。共通にするのは応答の形（JSON）と
 * 本文の決まり（日本語・字数・囲み）だけである。
 *
 * **埋め込むのは許可リストの値だけである**（`docs/adr/0012` D10）。引数の型が
 * `Language` / `Difficulty` / `Category` なのはそのためで、利用者が手で書いたタイトル・本文は
 * ここへ入らない。境界をすり抜けた値が来たら、埋め込まずに例外で止める（型の外の値は
 * 境界の検証が拒むので、ここへ届くのは配線の誤りである。呼び出し側は失敗として定型へ落ちる）。
 */
export function buildTopicPrompt(language: Language, difficulty: Difficulty, category: Category): string {
  assertAllowed(LANGUAGES, language, "language");
  assertAllowed(DIFFICULTIES, difficulty, "difficulty");
  assertAllowed(CATEGORIES, category, "category");
  return PROMPTS[category](language, difficulty);
}

function assertAllowed(allowed: readonly string[], value: string, name: string): void {
  // 値そのものは例外の文言へ入れない（ログへ流れうる。`docs/adr/0012` D5・D12）
  if (!allowed.includes(value)) throw new Error(`${name} is not in the allowlist`);
}

const PROMPTS: Record<Category, (language: Language, difficulty: Difficulty) => string> = {
  tdd: (language, difficulty) => `You are a TDD coding kata generator. Generate a programming kata for ${language} at ${difficulty} difficulty.

${RESPONSE_SHAPE}

Rules for "body":
- Write in natural, clear Japanese.
- Include: what to build (1-2 sentences), 4-6 testable behaviors as a "- " list, and one example of the first test to write in ${language} syntax with English identifiers.
- Put the example of the first test inside a Markdown code fence: a line of \`\`\` before the code and a line of \`\`\` after it.
${COMMON_BODY_RULES}
- Difficulty: ${difficulty} ${DIFFICULTY_SCALE}
- The kata must be suitable for TDD practice (test-first approach). Avoid trivial one-liners.`,

  refactoring: (language, difficulty) => `You are a refactoring kata generator. Generate a refactoring exercise for ${language} at ${difficulty} difficulty.

${RESPONSE_SHAPE}

Rules for "body":
- Write in natural, clear Japanese.
- Include: what the code does today (1-2 sentences), the code to refactor, the behaviors that must not change as a "- " list (3-6 items), and what makes the code hard to read (name one or two code smells).
- The code to refactor is working but hard-to-read ${language} code with English identifiers, 20-60 lines. It must actually behave as described.
- Put the code inside a Markdown code fence: a line of \`\`\` before the code and a line of \`\`\` after it.
- Ask the participants to write characterization tests that pin the current behavior before changing the code. Do not include the refactored solution.
${COMMON_BODY_RULES}
- Difficulty: ${difficulty} ${DIFFICULTY_SCALE}`,

  design: (language, difficulty) => `You are a software design and modeling exercise generator. Generate a design exercise for a team that will later implement it in ${language}, at ${difficulty} difficulty.

${RESPONSE_SHAPE}

Rules for "body":
- Write in natural, clear Japanese.
- Include: a small business scenario (2-4 sentences) with its rules, 3-6 questions to discuss before writing code as a "- " list (types, responsibilities, boundaries, state transitions, invariants), and the expected outcome of the discussion as a "- " list.
- The exercise is about discussing the model before coding. Do not include a full implementation. If you show a code sketch (types or interfaces in ${language} with English identifiers), put it inside a Markdown code fence: a line of \`\`\` before the code and a line of \`\`\` after it.
${COMMON_BODY_RULES}
- Difficulty: ${difficulty} ${DIFFICULTY_SCALE}`,

  debugging: (language, difficulty) => `You are a debugging exercise generator. Generate a bug-hunting exercise for ${language} at ${difficulty} difficulty.

${RESPONSE_SHAPE}

Rules for "body":
- Write in natural, clear Japanese.
- Include: what the code is supposed to do (1-2 sentences), the symptom, the buggy code, and one failing test in ${language} syntax with English identifiers.
- The buggy code is 10-50 lines with one or two real bugs. The failing test must actually fail against the code and pass once the bug is fixed.
- Put the buggy code and the failing test each inside its own Markdown code fence: a line of \`\`\` before the code and a line of \`\`\` after it.
- Do not reveal the root cause or the fix in the body. Hints may point where to look, but not what is wrong.
${COMMON_BODY_RULES}
- Difficulty: ${difficulty} ${DIFFICULTY_SCALE}`,
};

const RESPONSE_SHAPE = `Return ONLY a valid JSON object with this exact structure (no code fence around the JSON, no explanation):
{
  "title": "短いお題名（日本語・3〜10語相当）",
  "body": "お題の本文（日本語）"
}`;

const COMMON_BODY_RULES = "- Keep the whole body under 3000 characters.";

const DIFFICULTY_SCALE = "(easy=beginner/30min, medium=intermediate/60min, hard=advanced/90min+)";
