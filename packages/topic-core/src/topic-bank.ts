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
 * **言語の欄（`languages`）は持たない**（#365 で外した）。旧バンクから引き継いだ 33 件は、すべてが
 * `LANGUAGES` の 10 言語を同じ順で並べていて、言語による絞り込みは何も除いていなかった。
 * 言語ごとにお題を出し分ける要望も計画も無いので、欄を省略可能にして残すこともしない（原則 X）。
 * 出し分けが要るようになったら、そのとき欄を戻す。
 *
 * **種類の欄（`category`）は持つ**（#634）。こちらは利用者が種類を選んで絞り込む実需がある。
 */
import type { Category, Difficulty } from "./limits.js";
import { TDD_TOPICS } from "./topic-bank-tdd.js";
import { REFACTORING_TOPICS } from "./topic-bank-refactoring.js";
import { DESIGN_TOPICS } from "./topic-bank-design.js";
import { DEBUGGING_TOPICS } from "./topic-bank-debugging.js";

export interface TopicBankEntry {
  title: string;
  body: string;
  difficulty: Difficulty;
  category: Category;
}

export const TOPIC_BANK: readonly TopicBankEntry[] = [
  ...TDD_TOPICS,
  ...REFACTORING_TOPICS,
  ...DESIGN_TOPICS,
  ...DEBUGGING_TOPICS,
];
