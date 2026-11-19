/**
 * 定型バンク（#91）。**#91 PR 3 までは生成物だった。いまは種類ごとのファイルが正本で、直すときはそこを直す。**
 *
 * 種類（`category`）ごとにファイルを分けている（#634）。並びは TDD → リファクタリング → 設計 → バグ探し
 * （`CATEGORIES` の順）。選び方は `fallback.ts` を参照。
 *
 * - TDD: `topic-bank-tdd.ts`（先頭の 33 件は旧 timer-core のバンクを畳んだもの）
 * - リファクタリング: `topic-bank-refactoring.ts`
 * - 設計・モデリング: `topic-bank-design.ts`
 * - バグ探し・デバッグ: `topic-bank-debugging.ts`
 *
 * 本文の形は種類ごとに決まっている（`tests/topic-bank.test.ts` が確かめる）。
 *
 * **言語で絞り込む欄（`languages`）は持たない**（#365 で外した）。どのお題も 10 言語すべてで出せる。
 * そのかわり、**本文のコードは言語ごとに持つ**（#634。PR #643 のレビューで、言語を選んでも定型が
 * JavaScript で出るのでは選ぶ意味が無い、とされた）。地の文は 1 つで、言語ごとに違う部分だけを差し込み口
 * （`slots`）にする。組み方は `topic-render.ts`。
 *
 * **種類の欄（`category`）は持つ**（#634）。こちらは利用者が種類を選んで絞り込む実需がある。
 */
import type { Category, Difficulty, Language } from "./limits.js";
import { TDD_TOPICS } from "./topic-bank-tdd.js";
import { REFACTORING_TOPICS } from "./topic-bank-refactoring.js";
import { DESIGN_TOPICS } from "./topic-bank-design.js";
import { DEBUGGING_TOPICS } from "./topic-bank-debugging.js";

export interface TopicBankEntry {
  title: string;
  /**
   * 本文のテンプレート。言語に依らない地の文で、言語ごとに違う部分は `{{slot:<名前>}}` の差し込み口にする
   * （組み方は `topic-render.ts`）。
   */
  body: string;
  difficulty: Difficulty;
  category: Category;
  /** 差し込み口の名前 → 言語 → 値。どの差し込み口も 10 言語すべての値を持つ（`tests/topic-bank.test.ts`） */
  slots: Readonly<Record<string, Readonly<Record<Language, string>>>>;
}

export const TOPIC_BANK: readonly TopicBankEntry[] = [
  ...TDD_TOPICS,
  ...REFACTORING_TOPICS,
  ...DESIGN_TOPICS,
  ...DEBUGGING_TOPICS,
];
