// 隠しモードのテーブルの文言（#403・設計 §5.2）。テーブルの部品と一緒に遅延読み込みの塊へ入る。
//
// 書体の base 層に収まる字だけで書く（`tests/card-table-copy-fits-font-base.test.ts`）。
// 「配」「札」「枚」「着」「届」「勝」は外れるので使わない。札は SVG なので、書体に頼るのは角の数字（ASCII）だけである。
import type { HandCategory, PlayingCard, Rank, Suit } from '@tasuki/poker-core';

export const TABLE_HEADING = 'トランプのポーカー';
export const PROMPT_CHOOSE = 'チェンジするカードを選んでください（1 回だけ）';
export const PROMPT_WAIT = 'ほかの人のチェンジを待っています';
export const PROMPT_SHOWN = '全員の手が開きました';
export const WATCHING = 'この手には加わっていません';
export const YOUR_HAND = 'あなたの手';
export const YOU = 'あなた';
export const EXCHANGED = 'チェンジ済み';
export const EXCHANGING = 'チェンジ中';
export const KEEP = 'このまま';
export const AGAIN = 'もう一度';
export const BACK_TO_ESTIMATE = '見積もりに戻る';
export const CARD_BACK = 'ふせたカード';

/** チェンジのボタン（選んだ数を添える）。0 のときは {@link KEEP} を出す */
export function exchangeLabel(count: number): string {
  return `チェンジする（${count}）`;
}

export const CATEGORY_LABELS: Record<HandCategory, string> = {
  'high-card': 'ハイカード',
  'one-pair': 'ワンペア',
  'two-pair': 'ツーペア',
  'three-of-a-kind': 'スリーカード',
  straight: 'ストレート',
  flush: 'フラッシュ',
  'full-house': 'フルハウス',
  'four-of-a-kind': 'フォーカード',
  'straight-flush': 'ストレートフラッシュ',
  'royal-flush': 'ロイヤルストレートフラッシュ',
};

const SUIT_NAMES: Record<Suit, string> = { S: 'スペード', H: 'ハート', D: 'ダイヤ', C: 'クラブ' };
const FACE_RANKS: Partial<Record<Rank, string>> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

/** 角の文字（`A` `K` `10` …） */
export function rankText(rank: Rank): string {
  return FACE_RANKS[rank] ?? String(rank);
}

/** 札の読み上げ（`スペードのA`）。マークは SVG なので読み上げは名前で行う */
export function cardSpeech(card: PlayingCard): string {
  return `${SUIT_NAMES[card.suit]}の${rankText(card.rank)}`;
}

/** 席ごとの手の読み上げ名 */
export function handOf(name: string): string {
  return `${name}の手`;
}
