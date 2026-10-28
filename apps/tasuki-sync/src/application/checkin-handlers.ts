/**
 * チェックイン（`?tool=checkin`）のメッセージ層（#406）。
 *
 * **札を操作できるのはここだけである。** コマンドはハブ・他のツールのスキーマに含めず、この接続の境界
 * （`CheckinCommandSchema`）にだけ置く。参加・復帰は `join-tool-room.ts` を通す（`roulette-handlers.ts` と同じ骨）。
 * ルームは作らない（`room.create` は拒む）。
 *
 * - 参加者 ID は名簿から接続 ID で引く（wire から受けない）
 * - **見学者も操作できる**（判断 4）。拒むのは見学者の `checkin.card.play` だけ（ドメインが判定する）
 * - **ログを書かない。** 表示名・札は利用者の入力で、ログへ出さない
 */
import * as v from "valibot";
import { findParticipantByConnId, HubCommandSchema, type HubCommand, type Room } from "@tasuki/room-core";
import { parseBoundaryMessage } from "@tasuki/protocol";
import {
  applyAutoReveal,
  chooseMethod,
  checkinErrorMessageFor,
  CheckinCommandSchema,
  drawMethod,
  INITIAL_CHECKIN_STATE,
  playAgain,
  playCard,
  playersOf,
  prune,
  reveal,
  setSpectator,
  setVisibility,
  type CheckinCommand,
  type CheckinDomainErrorCode,
  type CheckinErrorCode,
  type CheckinState,
} from "@tasuki/checkin-core";
import { ok, type Result } from "neverthrow";
import type { RandomSource } from "../ports/random-source.js";
import type { CheckinServerMsg } from "../ports/checkin-server-msg.js";
import type { CheckinStore } from "../ports/checkin-store.js";
import type { JoinRoomDeps } from "./join-room.js";
import type { SaveRosterDeps } from "./save-roster.js";
import type { CheckinBroadcaster } from "./checkin-broadcast.js";
import { seatsOf } from "./checkin-broadcast.js";
import { findRoomByToolConnection } from "./room-lookup.js";
import { joinToolRoom } from "./join-tool-room.js";
import { TOOL_CHECKIN } from "./tool-id.js";
import type { Logger } from "./log/logger.js";
import { boundaryErrorCode } from "./connection-errors.js";

/** 受ける言葉は**ハブの言葉（`room.join` のため）とチェックインのコマンドの和**。 */
const CheckinConnectionMessageSchema = v.union([HubCommandSchema, CheckinCommandSchema]);

export interface CheckinHandlerDeps extends JoinRoomDeps, SaveRosterDeps {
  checkins: CheckinStore;
  broadcaster: CheckinBroadcaster;
  send: (connId: string, msg: CheckinServerMsg) => void;
  random: Pick<RandomSource, "randomInt">;
  logger: Logger;
}

export interface CheckinHandlers {
  /** チェックインの接続から届いた生テキストを捌く。**境界の検証はここで行う**（原則 IV）。 */
  handleMessage(connId: string, raw: string): Promise<void>;
  /** 名簿が変わった（参加・切断・退出・ハブへの移動）。状態が無ければ何もしない */
  rosterChanged(roomCode: string): void;
}

export function makeCheckinHandlers(deps: CheckinHandlerDeps): CheckinHandlers {
  const { checkins, broadcaster, send } = deps;

  /** コマンドの失敗。文言は checkin-core の文言表から引く。 */
  function fail(connId: string, code: CheckinErrorCode): void {
    send(connId, { type: "error", code, message: checkinErrorMessageFor(code) });
  }

  function failDomain(connId: string, code: CheckinDomainErrorCode): void {
    // 乱数源の契約違反は利用者の操作では起きない。内部の誤りとして返す。
    fail(connId, code === "CHECKIN_INVALID_RANDOM" ? "INTERNAL_ERROR" : code);
  }

  function handleJoin(connId: string, cmd: Extract<HubCommand, { command: "room.join" }>): void {
    joinToolRoom(deps, {
      connId,
      cmd,
      tool: TOOL_CHECKIN,
      reply: (msg) => send(connId, msg),
      afterJoin: () => broadcaster.sendCurrent(connId, cmd.code),
    });
  }

  /** この接続が**チェックインとして**在席しているルーム（他のツールの接続は操作できない）。 */
  function roomOf(connId: string): Room | undefined {
    return findRoomByToolConnection(deps.store, connId, TOOL_CHECKIN);
  }

  const idsOf = (room: Room): Set<string> => new Set(room.participants.map((p) => p.id));

  /** 名簿から消えた人の記録を落とし、全員が出していれば開く。 */
  function settle(room: Room, state: CheckinState): CheckinState {
    const pruned = prune(state, idsOf(room));
    return applyAutoReveal(pruned, playersOf(pruned, seatsOf(room)));
  }

  function handleCheckinCommand(connId: string, cmd: CheckinCommand): void {
    const room = roomOf(connId);
    const me = room === undefined ? undefined : findParticipantByConnId(room, connId);
    if (room === undefined || me === undefined) {
      fail(connId, "NOT_IN_ROOM");
      return;
    }
    const base = checkins.get(room.code) ?? INITIAL_CHECKIN_STATE;
    const state = prune(base, idsOf(room));

    let result: Result<CheckinState, { code: CheckinDomainErrorCode }>;
    switch (cmd.command) {
      case "checkin.method.choose":
        result = ok(chooseMethod(state, cmd.method));
        break;
      case "checkin.method.draw":
        result = drawMethod(state, cmd.side, deps.random.randomInt);
        break;
      case "checkin.card.play":
        result = playCard(state, { participantId: me.id, seq: cmd.seq, card: cmd.card });
        break;
      case "checkin.visibility.set":
        result = setVisibility(state, { seq: cmd.seq, visibility: cmd.visibility });
        break;
      case "checkin.reveal":
        result = reveal(state, { seq: cmd.seq });
        break;
      case "checkin.again":
        result = playAgain(state, { seq: cmd.seq });
        break;
      case "checkin.spectator.set":
        result = ok(setSpectator(state, me.id, cmd.spectator));
        break;
    }
    if (result.isErr()) {
      failDomain(connId, result.error.code);
      return;
    }
    const next = applyAutoReveal(result.value, playersOf(result.value, seatsOf(room)));
    // 変わらなければ（保管している状態と同じ参照なら）全員へは配らず、送り主にだけ今の状態を返す。
    if (next === base) {
      broadcaster.sendCurrent(connId, room.code);
      return;
    }
    checkins.put(room.code, next);
    broadcaster.publish(room.code);
  }

  return {
    async handleMessage(connId: string, raw: string): Promise<void> {
      const parsed = parseBoundaryMessage(CheckinConnectionMessageSchema, raw);
      if (parsed.isErr()) {
        fail(connId, boundaryErrorCode(parsed.error.stage));
        return;
      }
      const cmd = parsed.value;
      if (cmd.command === "room.join") {
        handleJoin(connId, cmd);
        return;
      }
      // ルームは作らず、生死も照会しない（どちらも玄関の仕事）。
      if (cmd.command === "room.create" || cmd.command === "room.check") {
        fail(connId, "INVALID_COMMAND");
        return;
      }
      handleCheckinCommand(connId, cmd);
    },

    rosterChanged(roomCode: string): void {
      const room = deps.store.get(roomCode);
      const state = checkins.get(roomCode);
      if (room === undefined || state === undefined) return;
      const next = settle(room, state);
      if (next !== state) checkins.put(roomCode, next);
      // 席は名簿から導くので、状態が同じでも画面は変わる
      broadcaster.publish(roomCode);
    },
  };
}
