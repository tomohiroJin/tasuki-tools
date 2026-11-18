import type { Language } from "./limits.js";
import type { TopicBankEntry } from "./topic-bank.js";

/**
 * 定型の本文を、選ばれた言語で組む（#634。PR #643 のレビューで、定型を選んだ言語で出すことにした）。
 *
 * 本文（`body`）は言語に依らない地の文で、言語ごとに違う部分（コード・関数名など）だけを
 * `{{slot:<名前>}}` の差し込み口にしてある。値は `slots[<名前>][<言語>]`。
 *
 * - 置き換えは本文に対して 1 回だけ行う。差し込んだ値の中の `{{…}}`（Rust の `format!` など）は触らない
 * - 値の無い差し込み口は残す。空にすると、欠けたお題が黙って配られる（欠けはバンクの検査が見つける）
 */
export function renderTopicBody(entry: TopicBankEntry, language: Language): string {
  return entry.body.replace(SLOT, (marker, name: string) => entry.slots[name]?.[language] ?? marker);
}

const SLOT = /\{\{slot:([A-Za-z][A-Za-z0-9_]*)\}\}/g;
