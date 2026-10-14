/**
 * ルーム画面の判断（#370 で `pages/RoomPage.tsx` から出した。`docs/adr/0015` 決定 1）。
 * React にも I/O にも依存しない。
 */
import type { Card, RoomStateMessage } from '@tasuki/poker-core';
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
