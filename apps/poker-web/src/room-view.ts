/**
 * ルーム画面の判断（#370 で `pages/RoomPage.tsx` から出した。`docs/adr/0015` 決定 1）。
 * React にも I/O にも依存しない。
 */
import { findSpread, type Card, type ParticipantView, type RoomStateMessage, type SpreadEnd } from '@tasuki/poker-core';
import type { ConnectionStatus } from '@tasuki/sync-client';

type RoundStatus = RoomStateMessage['round']['status'];

/**
 * 公開を投票中から見届けたか（#348 のレビュー）。
 *
 * 席の札が CSS の transition でめくれるのは、投票中の札が描かれていて、それが公開に変わったときだけ。
 * 再読み込み・途中入室・再接続で最初から公開済みで描くと、札はめくれずに表で出る。
 * 集計を最後の札のめくりの後まで待たせるのも、この同じ条件のときだけにする。
 *
 * @param previous 前の描画のラウンドの状態（状態がまだ無ければ undefined）
 */
export function revealedLiveAfter(previous: RoundStatus | undefined, next: RoundStatus | undefined): boolean {
  return previous === 'voting' && next === 'revealed';
}

/** 公開後の票を席の札へ渡す表（投票中は null）。席の数は小さいので、描画ごとに作ってよい。 */
export function revealedVoteMap(round: RoomStateMessage['round']): ReadonlyMap<string, Card> | null {
  return round.status === 'revealed' ? new Map(round.votes.map((v) => [v.participantId, v.card])) : null;
}

/** 切断・再接続中か。操作を受け付けない（送信しても届かないため）。 */
export function isOffline(status: ConnectionStatus): boolean {
  return status !== 'open';
}

/** 割れた見積もりの片側（札と、それを出した人の表示名）。 */
export type SpreadPromptEnd = { card: SpreadEnd['card']; names: readonly string[] };
export type SpreadPrompt = { high: SpreadPromptEnd; low: SpreadPromptEnd };

/**
 * 見積もりが割れたとき、最大と最小を出した人の表示名（#405・FR-010a）。割れていなければ null。
 *
 * 名簿に居ない人（票を出した後に抜けた）の名前は出さない。片側の名前が 1 人も引けないなら、
 * 誰に聞けばよいかを示せないので促し自体を出さない。
 */
export function spreadPromptOf(
  round: RoomStateMessage['round'],
  participants: readonly ParticipantView[],
): SpreadPrompt | null {
  if (round.status !== 'revealed') return null;
  const spread = findSpread(round.votes);
  if (spread === null) return null;
  const nameOf = new Map(participants.map((p) => [p.id, p.name]));
  const toPrompt = (end: SpreadEnd): SpreadPromptEnd => ({
    card: end.card,
    names: end.participantIds.flatMap((id) => nameOf.get(id) ?? []),
  });
  const high = toPrompt(spread.high);
  const low = toPrompt(spread.low);
  if (high.names.length === 0 || low.names.length === 0) return null;
  return { high, low };
}
