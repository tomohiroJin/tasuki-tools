import { LANGUAGES, type Category, type Difficulty, type Language } from "./limits.js";
import type { Topic } from "./topic.js";
import { TOPIC_BANK, type TopicBankEntry } from "./topic-bank.js";

/**
 * 言語・難易度・種類に合った定型のお題を返す（#91。かつて timer-core にあった定型のお題の選び方の
 * 規則を引き継ぐ。timer-core の側は #91 PR 3 で撤去した。種類は #634 で足した）。
 *
 * @param category お題の種類。**その種類の定型だけから選ぶ**（#634）。その種類・難易度の定型が
 *   無ければ（境界をすり抜けた値を含む）、種類を足す前の選び方（難易度だけで絞る）へ落ちる。
 * @param now 選択の種。**既定値は置かない**（既定があると呼び出し側が無変更で通り、
 *   配線されていることが検査されないまま緑になる。#166）。
 * @param previous いま載っているお題。**候補から外す** —— 同じお題が返ると
 *   作り直しを押したことが画面に出ない（#283）。同一性は `title` で見る ——
 *   参照比較は写しを作るので使えず、深い等値は中身を編集された直後だけ除外が
 *   効かなくなる。`title` は利用者が「同じお題だ」と感じる単位そのものである
 *   （この理由の元の注釈は timer-core とともに消えたので、ここへ写した）。
 *   タイトルがバンク全体で重ならないことは `tests/topic-bank.test.ts` が見る。
 */
export function pickTopicFallback(
  language: Language,
  difficulty: Difficulty,
  category: Category,
  now: number,
  previous: Topic | null,
): Topic {
  const candidates = candidatesFor(language, difficulty, category);

  const remaining =
    previous === null ? candidates : candidates.filter((e) => e.title !== previous.title);
  // 除いて空になったら元へ戻す（契約「必ず 1 件返す」を守る。旧い timer-core の規則と同じ判断）
  const pool = remaining.length > 0 ? remaining : candidates;

  // `?? TOPIC_BANK[0]!` は置かない。`now` の渡し忘れ（NaN）を黙って飲み込むため
  const entry = pool[Math.abs(now) % pool.length]!;
  return { title: entry.title, body: entry.body, source: "fallback" };
}

/**
 * 候補を決める。広い方へ順に落ちる: 種類と難易度 → 難易度 → 全件。
 *
 * 定型のお題はどれも全ての言語に当てはまる（`topic-bank.ts` の冒頭）。言語で見るのは、許可リストの
 * 言語かどうかだけである。許可リストに無い言語（境界をすり抜けた値）は、種類・難易度で絞らずに全件から
 * 選ぶ（#365 より前の「言語で絞ると 0 件 → 全件」と同じ結果。`tests/fallback.test.ts` の特性テスト）。
 */
function candidatesFor(language: Language, difficulty: Difficulty, category: Category): readonly TopicBankEntry[] {
  if (!isAllowed(LANGUAGES, language)) return TOPIC_BANK;
  const byDifficulty = TOPIC_BANK.filter((e) => e.difficulty === difficulty);
  if (byDifficulty.length === 0) return TOPIC_BANK;
  // 許可リストに無い種類（境界をすり抜けた値）は、どのお題にも一致せず空になり、難易度だけの候補へ落ちる
  const byCategory = byDifficulty.filter((e) => e.category === category);
  return byCategory.length > 0 ? byCategory : byDifficulty;
}

/** 許可リストの値か。型の上では常に真だが、境界をすり抜けた値が来ても選び方を変えないために見る。 */
function isAllowed(allowed: readonly string[], value: string): boolean {
  return allowed.includes(value);
}
