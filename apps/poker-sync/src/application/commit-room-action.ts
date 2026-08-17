/**
 * ルーム状態を変更する操作（`vote` / `reveal` / `next-round`）の単一コミットポイントと、
 * メッセージ種別の振り分け。
 *
 * `commitRoomAction` を 1 本にしているのは、not-joined 検査・自動公開の再評価・
 * 配信という**毎回同じ後始末**を各操作に書き写さないためである。新しい操作の追加は
 * ドメイン関数を渡すだけで済む。
 */
import { applyAutoReveal, castVote, messageForRoundError, nextRound, revealBy } from '@tasuki/poker-core';
import type { ClientMessage, ErrorCode, Room, RoundError } from '@tasuki/poker-core';
import type { Result } from 'neverthrow';
import type { Broadcaster } from '../ports/broadcaster';
import type { RoomStore } from '../ports/room-store';
import type { HandlerConnection } from './handlers';

/** ドメイン操作 1 つ。ルームと実行者から次のルームを返す（失敗は `RoundError`）。 */
export type RoomAction = (room: Room, participantId: string) => Result<Room, RoundError>;

/** `commitRoomAction` の形。`dispatch` が種別ごとに束ねる。 */
export type CommitRoomAction = (ws: HandlerConnection, action: RoomAction) => void;

export interface CommitRoomActionDeps {
  store: RoomStore;
  broadcaster: Broadcaster;
  /**
   * エラー応答。実体は `handlers.ts` が `Broadcaster` から作る 1 つだけである
   * （ここで作り直すと同じ関数が 2 つになり、片方だけが直る形になる）。
   */
  sendError: (ws: HandlerConnection, code: ErrorCode, message: string) => void;
}

/**
 * join 済み接続によるルーム状態変更の単一コミットポイント。
 * not-joined 検査 → ドメイン操作 → エラー応答/状態反映 → 自動公開の再評価（FR-008）→ 配信
 * をここで一元的に行う。新しい操作の追加はドメイン関数を渡すだけでよい
 */
export function createCommitRoomAction({
  store,
  broadcaster,
  sendError,
}: CommitRoomActionDeps): CommitRoomAction {
  return function commitRoomAction(ws, action) {
    const { participantId, roomId } = ws.data;
    if (participantId === null || roomId === null) {
      sendError(ws, 'not-joined', 'ルームに参加していません');
      return;
    }
    const room = store.get(roomId);
    if (!room) return;
    const result = action(room, participantId);
    if (result.isErr()) {
      sendError(ws, result.error.code, messageForRoundError(result.error));
      return;
    }
    const updatedRoom = applyAutoReveal(result.value);
    store.put(updatedRoom);
    broadcaster.broadcastSnapshot(roomId, updatedRoom);
  };
}

export interface DispatchDeps {
  handleCreateRoom(
    ws: HandlerConnection,
    msg: Extract<ClientMessage, { type: 'create-room' }>,
  ): void;
  handleJoinRoom(ws: HandlerConnection, msg: Extract<ClientMessage, { type: 'join-room' }>): void;
  handleCheckRoom(ws: HandlerConnection, msg: Extract<ClientMessage, { type: 'check-room' }>): void;
  commitRoomAction: CommitRoomAction;
}

/**
 * 検証済みメッセージを種別ごとのユースケースへ振り分ける。
 *
 * `switch` に `default` を置かない（`noFallthroughCasesInSwitch` ＋ 網羅性検査）。
 * `ClientMessage` に種別が増えたら型検査が落ちて気づける。
 */
export function createDispatch({
  handleCreateRoom,
  handleJoinRoom,
  handleCheckRoom,
  commitRoomAction,
}: DispatchDeps): (ws: HandlerConnection, msg: ClientMessage) => void {
  return function dispatch(ws, msg) {
    switch (msg.type) {
      case 'create-room':
        handleCreateRoom(ws, msg);
        return;
      case 'join-room':
        handleJoinRoom(ws, msg);
        return;
      case 'check-room':
        handleCheckRoom(ws, msg);
        return;
      case 'vote':
        commitRoomAction(ws, (room, participantId) => castVote(room, participantId, msg.card));
        return;
      case 'reveal':
        commitRoomAction(ws, revealBy);
        return;
      case 'next-round':
        commitRoomAction(ws, nextRound);
        return;
    }
  };
}
