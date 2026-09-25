/**
 * お題の上限と、生成の材料の許可リスト（#91）。
 *
 * **許可リストは境界の列挙検証の正本である**（`docs/adr/0012` D10）。プロンプトへ
 * 埋め込まれる値はこの中の値だけになる。画面の選択肢もここから引く ——
 * 画面と境界で別の一覧を持つと、片方だけが増えて「選べるのに拒まれる」言語が生まれる。
 */

/** タイトルの上限（かつて timer-core にあったお題のタイトルの上限を引き継ぐ。#91 PR 3 で timer-core から撤去） */
export const MAX_TOPIC_TITLE = 200;
/** 本文の上限（かつて timer-core にあったお題の本文の上限を引き継ぐ。定型バンクを畳んだ本文もこの中に収まる） */
export const MAX_TOPIC_BODY = 4000;

/**
 * AI 解錠の合言葉の上限。かつて timer-core に同じ値（同名の `MAX_AI_UNLOCK_KEY = 64`）が
 * あり、topic-core は `@tasuki/*` に依存できないため値そのものを写していた。
 * **timer-core の側は #91 PR 3 で撤去した**ので、いまはここが唯一の正本である。
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
