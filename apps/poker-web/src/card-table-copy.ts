// 隠しモードのテーブルの文言（#403・設計 §5.2）。テーブルの部品と一緒に遅延読み込みの塊へ入る。
//
// 書体の base 層に収まる字だけで書く（`tests/card-table-copy-fits-font-base.test.ts`）。
// 「配」「札」「枚」「着」「届」「勝」は外れるので使わない。
import type { HandCategory, PlayingCard, Suit } from '@tasuki/poker-core';

export const TABLE_HEADING = 'トランプのポーカー';
export const YOUR_HAND = 'あなたの手';
export const EVERYONE_HANDS = 'みんなの手';
export const IDLE_NOTE = 'カードを引くと、テーブルの全員に 5 つずつ回ります。';
export const LATE_NOTE = '次の手から加わります。';
export const DEAL = 'カードを引く';
export const SHOW = '見せる';
export const LEAVE = '閉じる';
export const WINNER = 'いちばん強い手';

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

const SUIT_MARKS: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_NAMES: Record<Suit, string> = { S: 'スペード', H: 'ハート', D: 'ダイヤ', C: 'クラブ' };
const FACE_RANKS: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

const rankText = (rank: number) => FACE_RANKS[rank] ?? String(rank);

/** 札の見た目の文字（`A♠`） */
export function cardText(card: PlayingCard): string {
  return `${rankText(card.rank)}${SUIT_MARKS[card.suit]}`;
}

/** 札の読み上げ（`スペードのA`）。記号は読み上げ方が環境で揺れるので名前で読ませる */
export function cardSpeech(card: PlayingCard): string {
  return `${SUIT_NAMES[card.suit]}の${rankText(card.rank)}`;
}

/** 席ごとの手の行の読み上げ名 */
export function handOf(name: string): string {
  return `${name}の手`;
}
