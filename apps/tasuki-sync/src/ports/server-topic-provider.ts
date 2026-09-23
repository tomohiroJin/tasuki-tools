import type { Difficulty, Language } from "@tasuki/topic-core";

/**
 * サーバー側の AI お題生成（#91）。戻り値は**未検証の値**であり、呼び出し側が
 * `validateTopicDraft` で検証する（AI 由来の値を信頼しない）。
 *
 * 失敗は `ProviderFailure`（`server-problem-provider.ts`）で投げる。PR 3 でこちらへ移す。
 */
export interface ServerTopicProvider {
  generate(language: Language, difficulty: Difficulty, signal: AbortSignal): Promise<unknown>;
}
