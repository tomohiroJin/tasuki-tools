/**
 * お題の上限と、生成の材料の許可リスト（#91）。
 *
 * **許可リストは境界の列挙検証の正本である**（`docs/adr/0012` D10）。プロンプトへ
 * 埋め込まれる値はこの中の値だけになる。画面の選択肢もここから引く ——
 * 画面と境界で別の一覧を持つと、片方だけが増えて「選べるのに拒まれる」言語が生まれる。
 */

/** タイトルの上限（現行の `MAX_PROBLEM_TITLE` を引き継ぐ） */
export const MAX_TOPIC_TITLE = 200;
/** 本文の上限（現行の `MAX_PROBLEM_TEXT` を引き継ぐ。定型バンクを畳んだ本文もこの中に収まる） */
export const MAX_TOPIC_BODY = 4000;

/**
 * AI 解錠の合言葉の上限。timer-core の `MAX_AI_UNLOCK_KEY`
 * （`packages/timer-core/src/aggregate.ts:337` の `export const MAX_AI_UNLOCK_KEY = 64;`。
 * 2026-09-24 にソースを直接確認）と同じ値を写した。topic-core は `@tasuki/*` に
 * 依存できないため値の共有ができず、値そのものを複製する。
 */
export const MAX_AI_UNLOCK_KEY = 64;

export const LANGUAGES = [
  "TypeScript",
  "JavaScript",
  "Python",
  "Java",
  "Go",
  "Ruby",
  "Rust",
  "C#",
  "Kotlin",
  "Swift",
] as const;
export type Language = (typeof LANGUAGES)[number];

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
