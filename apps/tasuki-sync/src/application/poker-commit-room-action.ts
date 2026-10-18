/**
 * ルーム状態を変更する操作（`vote` / `reveal` / `set-item` / `revote` / `next-item` / `set-points` と古い `next-round`）の単一コミットポイントと、
 * メッセージ種別の振り分け。
 *
 * `commitRoomAction` を 1 本にしているのは、not-joined 検査・自動公開の再評価・
 * 配信という**毎回同じ後始末**を各操作に書き写さないためである。新しい操作の追加は
 * ドメイン関数を渡すだけで済む。
 *
 * **#95 S4a で操作の対象が `Room` から `Round` になった。** 名簿は
 * `@tasuki/room-core` が持ち、自動公開の判定に要る断片だけを `fragmentsOf` で渡す。
 */
import {
  applyAutoReveal,
  castVote,
  messageForRoundError,
  nextItem,
  revealBy,
  revote,
  setItem,
  setPoints,
} from '@tasuki/poker-core';
import type {
  ClientMessage,
  ErrorCode,
  ParticipantFragment,
  Round,
  RoundError,
} from '@tasuki/poker-core';
import { ok, type Result } from 'neverthrow';
import type { HandlerConnection, PokerRoomState } from './poker-handlers.js';
import { POKER_ERROR_TEXT } from './poker-error-text.js';

/** ドメイン操作 1 つ。ラウンドと実行者から次のラウンドを返す（失敗は `RoundError`）。 */
export type RoomAction = (round: Round, participantId: string) => Result<Round, RoundError>;

/** `commitRoomAction` の形。`dispatch` が種別ごとに束ねる。 */
export type CommitRoomAction = (ws: HandlerConnection, action: RoomAction) => void;

export interface CommitRoomActionDeps {
  /** 名簿とラウンドを 1 組で読む（`handlers.ts` の `loadState`）。 */
  loadState: (roomId: string) => PokerRoomState | undefined;
  /**
   * 両方の保管へ put してから配信する唯一の経路（`handlers.ts` の `commit`）。
   * **ここで直接 store を触らない** —— 片方だけ put して配信する形を作らないため。
   */
  commit: (state: PokerRoomState) => void;
  /**
   * 名簿を poker-core が読める断片へ写す（`handlers.ts` の `fragmentsOf`）。
   *
   * 引数の型は `PokerRoomState['room']` から引く。**`@tasuki/room-core` を直接 import しない** ——
   * このファイルが名簿の語彙を知る必要は無く、知ると `handlers.ts` と 2 箇所で
   * 名簿の形に依存することになる。
   */
  fragmentsOf: (room: PokerRoomState['room']) => ParticipantFragment[];
  /**
   * エラー応答。実体は `handlers.ts` が `PokerBroadcaster` から作る 1 つだけである
   * （ここで作り直すと同じ関数が 2 つになり、片方だけが直る形になる）。
   */
  sendError: (ws: HandlerConnection, code: ErrorCode, message: string) => void;
  /**
   * 開票の時刻に載せる壁時計（`handlers.ts` の `wallClock.now`）。見積もりの記録（#93）の
   * `at` になる。ドメインに時計を持ち込まないため、呼び出し側から値で渡す。
   */
  now: () => number;
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
  now,
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
      // 切り替え、保存した identity を捨てる。apps/poker-web の `useRoomEntry`）。
      //
      // #171 の根治側（`handleJoinRoom` の冪等化）を入れたあと、この分岐へ至る
      // 経路は分かっている限り無い。無応答という最悪の症状を残さないための備えである。
      sendError(ws, 'room-not-found', POKER_ERROR_TEXT.ROOM_NOT_FOUND);
      return;
    }
    const result = action(state.round, participantId);
    if (result.isErr()) {
      sendError(ws, result.error.code, messageForRoundError(result.error));
      return;
    }
    commit({
      room: state.room,
      round: applyAutoReveal(result.value, fragmentsOf(state.room), now()),
    });
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
  /** 開票の時刻（壁時計）。`reveal` が記録の `at` に使う */
  now: () => number;
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
  now,
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
        commitRoomAction(ws, (round, participantId) => revealBy(round, participantId, now()));
        return;
      case 'set-item':
        // 投票中でも開票後でも受ける。not-joined の検査と配信は commitRoomAction と共有する
        commitRoomAction(ws, (round) => ok(setItem(round, msg.item)));
        return;
      case 'revote':
        commitRoomAction(ws, revote);
        return;
      case 'next-round':
        // 古いクライアント向けの互換。再投票と同じ（item も束も残る）
        commitRoomAction(ws, revote);
        return;
      case 'next-item':
        commitRoomAction(ws, (round, participantId) => nextItem(round, participantId, msg.points));
        return;
      case 'set-points':
        commitRoomAction(ws, (round) => setPoints(round, msg.groupId, msg.points));
        return;
    }
  };
}
