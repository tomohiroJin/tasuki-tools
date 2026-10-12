/**
 * ルーレットの画面の判断（`docs/adr/0015` MUST 1）。React にも I/O にも依存しない。
 */

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

/**
 * 操作できるか。**切断中と参加前は押させない。**
 *
 * `SyncConnection` は確立前の送信をキューに溜め、再接続時に**入り直しの `room.join` より先に**
 * 流す。押せたままにすると、切断中に押した操作はサーバーで `NOT_IN_ROOM` になる。
 */
export function canOperate(status: ConnectionStatus, joined: boolean): boolean {
  return status === 'open' && joined;
}
