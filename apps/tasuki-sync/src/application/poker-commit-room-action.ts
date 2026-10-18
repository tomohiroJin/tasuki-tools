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
  setSpectator,
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
      sendError(ws, 'not-joined', POKER_ERROR_TEXT.NOT_JOINED);
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
    // **G-9: 名簿に居ない人の操作は拒む。** 見学者は「名簿に居て投票しない人」であり、
    // 名簿に居ない人（片付けで外された人の接続など）とは別物である。ここで弾かないと
    // 「名簿に居ない＝投票していない」と読まれて状態を動かしてしまう。何も変えない。
    if (!state.room.participants.some((p) => p.id === participantId)) {
      sendError(ws, 'not-joined', POKER_ERROR_TEXT.NOT_JOINED);
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
  /** エラー応答（`remove-participant` が使う） */
  sendError: CommitRoomActionDeps['sendError'];
  /** 名簿と、あればラウンドを読む（`remove-participant` の事前検査用） */
  loadState: CommitRoomActionDeps['loadState'];
  /**
   * 人をルームから外す（`handlers.ts` の `removeFromRoom`・#419 G-6）。
   * 名簿・timer の輪・票と見学の後始末をまとめて行う。poker の配信は票の後始末が行う。
   */
  removeFromRoom: (
    roomCode: string,
    actorId: string,
    targetId: string,
  ) => Result<void, 'participant-not-found' | 'not-removable'>;
  /** 開票の時刻（壁時計）。`reveal` が記録の `at` に使う */
  now: () => number;
}

/**
 * 検証済みメッセージを種別ごとのユースケースへ振り分ける。
 *
 * `switch` の後ろで `msg` を `never` へ代入して網羅性を**型で**強制する。
 * `ClientMessage` に種別が増えて枝が足りなければ、そこで型検査が落ちて気づける
 * （`void` 関数は `default` が無くても通るので、この代入が無いと黙って素通りする）。
 */
export function createDispatch({
  handleCreateRoom,
  handleJoinRoom,
  handleCheckRoom,
  commitRoomAction,
  sendError,
  loadState,
  removeFromRoom,
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
      case 'set-spectator':
        commitRoomAction(ws, (round, participantId) =>
          ok(setSpectator(round, participantId, msg.spectator)),
        );
        return;
      case 'remove-participant': {
        // 参加済みで名簿に居る人だけが外せる（G-9 と同じ検査）。
        const { participantId, roomId } = ws.data;
        if (participantId === null || roomId === null) {
          sendError(ws, 'not-joined', POKER_ERROR_TEXT.NOT_JOINED);
          return;
        }
        const state = loadState(roomId);
        // 参加済みなのにルームが保管に無い（破棄済み）。ほかの操作と同じく room-not-found（#171）。
        if (state === undefined) {
          sendError(ws, 'room-not-found', POKER_ERROR_TEXT.ROOM_NOT_FOUND);
          return;
        }
        if (!state.room.participants.some((p) => p.id === participantId)) {
          sendError(ws, 'not-joined', POKER_ERROR_TEXT.NOT_JOINED);
          return;
        }
        const target = state.room.participants.find((p) => p.id === msg.participantId);
        if (target === undefined) {
          sendError(ws, 'participant-not-found', POKER_ERROR_TEXT.PARTICIPANT_NOT_FOUND);
          return;
        }
        // 自分自身と、いずれかのツールに接続中の人は外せない（G-5）。外せるのは幽霊だけ。
        if (target.id === participantId || target.connections.size > 0) {
          sendError(ws, 'not-removable', POKER_ERROR_TEXT.NOT_REMOVABLE);
          return;
        }
        const removed = removeFromRoom(roomId, participantId, target.id);
        if (removed.isErr()) {
          const code = removed.error;
          sendError(
            ws,
            code,
            code === 'participant-not-found'
              ? POKER_ERROR_TEXT.PARTICIPANT_NOT_FOUND
              : POKER_ERROR_TEXT.NOT_REMOVABLE,
          );
        }
        return;
      }
    }
    // 網羅性の保証: ここへ来るのは全種別を処理し終えたときだけ（型は `never`）
    const unhandled: never = msg;
    return unhandled;
  };
}
