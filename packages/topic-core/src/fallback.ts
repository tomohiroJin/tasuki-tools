import type { Difficulty, Language } from "./limits.js";
import type { Topic } from "./topic.js";
import { TOPIC_BANK, type TopicBankEntry } from "./topic-bank.js";

/**
 * 言語・難易度に合った定型のお題を返す（#91。timer-core の `pickFallback` の規則を引き継ぐ）。
 *
 * @param now 選択の種。**既定値は置かない**（既定があると呼び出し側が無変更で通り、
 *   配線されていることが検査されないまま緑になる。#166）。
 * @param previous いま載っているお題。**候補から外す** —— 同じお題が返ると
 *   作り直しを押したことが画面に出ない（#283）。同一性は `title` で見る
 *   （利用者が「同じお題だ」と感じる単位。理由は `pickFallback` の注釈）。
 */
export function pickTopicFallback(
  language: Language,
  difficulty: Difficulty,
  now: number,
  previous: Topic | null,
): Topic {
  let candidates: readonly TopicBankEntry[] = TOPIC_BANK.filter(
    (e) => e.languages.includes(language) && e.difficulty === difficulty,
  );
  if (candidates.length === 0) candidates = TOPIC_BANK.filter((e) => e.languages.includes(language));
  if (candidates.length === 0) candidates = TOPIC_BANK;

  const remaining =
    previous === null ? candidates : candidates.filter((e) => e.title !== previous.title);
  // 除いて空になったら元へ戻す（契約「必ず 1 件返す」を守る。`pickFallback` と同じ判断）
  const pool = remaining.length > 0 ? remaining : candidates;

  // `?? TOPIC_BANK[0]!` は置かない。`now` の渡し忘れ（NaN）を黙って飲み込むため
  const entry = pool[Math.abs(now) % pool.length]!;
  return { title: entry.title, body: entry.body, source: "fallback" };
}
