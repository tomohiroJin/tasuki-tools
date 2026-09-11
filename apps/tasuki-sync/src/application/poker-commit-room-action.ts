/**
 * ルーム状態を変更する操作（`vote` / `reveal` / `next-round`）の単一コミットポイントと、
 * メッセージ種別の振り分け。
 *
 * `commitRoomAction` を 1 本にしているのは、not-joined 検査・自動公開の再評価・
 * 配信という**毎回同じ後始末**を各操作に書き写さないためである。新しい操作の追加は
 * ドメイン関数を渡すだけで済む。
 *
 * **#95 S4a で操作の対象が `Room` から `Round` になった。** 名簿は
 * `@tasuki/room-core` が持ち、自動公開の判定に要る断片だけを `fragmentsOf` で渡す。
 */
import { applyAutoReveal, castVote, messageForRoundError, nextRound, revealBy } from '@tasuki/poker-core';
import type {
  ClientMessage,
  ErrorCode,
  ParticipantFragment,
  Round,
  RoundError,
} from '@tasuki/poker-core';
import type { Result } from 'neverthrow';
import type { HandlerConnection, RoomState } from './poker-handlers.js';

/** ドメイン操作 1 つ。ラウンドと実行者から次のラウンドを返す（失敗は `RoundError`）。 */
export type RoomAction = (round: Round, participantId: string) => Result<Round, RoundError>;

/** `commitRoomAction` の形。`dispatch` が種別ごとに束ねる。 */
export type CommitRoomAction = (ws: HandlerConnection, action: RoomAction) => void;

export interface CommitRoomActionDeps {
  /** 名簿とラウンドを 1 組で読む（`handlers.ts` の `loadState`）。 */
  loadState: (roomId: string) => RoomState | undefined;
  /**
   * 両方の保管へ put してから配信する唯一の経路（`handlers.ts` の `commit`）。
   * **ここで直接 store を触らない** —— 片方だけ put して配信する形を作らないため。
   */
  commit: (state: RoomState) => void;
  /**
   * 名簿を poker-core が読める断片へ写す（`handlers.ts` の `fragmentsOf`）。
   *
   * 引数の型は `RoomState['room']` から引く。**`@tasuki/room-core` を直接 import しない** ——
   * このファイルが名簿の語彙を知る必要は無く、知ると `handlers.ts` と 2 箇所で
   * 名簿の形に依存することになる。
   */
  fragmentsOf: (room: RoomState['room']) => ParticipantFragment[];
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
  loadState,
  commit,
  fragmentsOf,
  sendError,
}: CommitRoomActionDeps): CommitRoomAction {
  return function commitRoomAction(ws, action) {
    const { participantId, roomId } = ws.data;
    if (participantId === null || roomId === null) {
      sendError(ws, 'not-joined', 'ルームに参加していません');
      return;
    }
    const state = loadState(roomId);
    if (!state) {
      // **黙って落とさない（#171）。** 参加中のつもりの接続が、保管には無いルームを
      // 指していることがありうる。ここで何も返さないと、利用者の画面には
      // 「押しても反応しない」としか見えず、原因に辿り着けない。
      // 破棄済みのルームを指しているという意味では join-room の空振りと同じなので、
      // 同じ `room-not-found` を返す（画面はこのコードでページ全体をエラー表示に
      // 切り替え、保存した identity を捨てる。apps/poker-web の RoomPage）。
      //
      // #171 の根治側（`handleJoinRoom` の冪等化）を入れたあと、この分岐へ至る
      // 経路は分かっている限り無い。無応答という最悪の症状を残さないための備えである。
      sendError(ws, 'room-not-found', 'ルームが見つかりません');
      return;
    }
    const result = action(state.round, participantId);
    if (result.isErr()) {
      sendError(ws, result.error.code, messageForRoundError(result.error));
      return;
    }
    commit({ room: state.room, round: applyAutoReveal(result.value, fragmentsOf(state.room)) });
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
        commitRoomAction(ws, (round, participantId) => castVote(round, participantId, msg.card));
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
