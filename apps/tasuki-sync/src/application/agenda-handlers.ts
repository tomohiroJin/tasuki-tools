/**
 * 進行タイマー（`?tool=agenda`）のメッセージ層（#429）。
 *
 * **進行タイマーを操作できるのはここだけである。** コマンドはハブ・timer・poker・お題・ルーレットの
 * スキーマに含めず、この接続の境界（`AgendaCommandSchema`）にだけ置く。
 *
 * ## ルームへの入り方はハブ・お題・ルーレットと共有する
 *
 * 参加・復帰は `join-tool-room.ts` を通し、**ここに写しを書かない**。ルームは作らない（`room.create` は拒む）。
 *
 * ## 自動で次へ進む期限
 *
 * 状態が変わるたびに `rearm` で期限の予約を張り直す（`advance` のステップが動いている間だけ張り、それ以外は消す）。
 * 期限が来たら `onDue` が `advanceIfDue` を呼び、変わっていれば保管・配信・張り直しをする。
 * **操作を当てる前にも `advanceIfDue` を通す**（期限を過ぎてから予約が発火するまでの隙に届いた操作を、進めた後の状態に当てる）。
 * 時計は**単調時計**（`MonotonicClock`）だけを使う。
 *
 * ## 利用者の入力をログに書かない
 *
 * ステップの名前・会の名前・表示名は利用者の入力である（`docs/adr/0012`）。**このファイルはログを書かない。**
 */
import * as v from "valibot";
import { HubCommandSchema, type HubCommand } from "@tasuki/room-core";
import { parseBoundaryMessage } from "@tasuki/protocol";
import {
  advanceIfDue,
  agendaErrorMessageFor,
  AgendaCommandSchema,
  deadlineOf,
  extend,
  INITIAL_AGENDA_STATE,
  next,
  pause,
  replaceScenario,
  reset,
  resume,
  setSkipped,
  start,
  type AgendaCommand,
  type AgendaErrorCode,
  type AgendaState,
} from "@tasuki/agenda-core";
import type { AgendaServerMsg } from "../ports/agenda-server-msg.js";
import type { AgendaStore } from "../ports/agenda-store.js";
import type { MonotonicClock } from "../ports/monotonic-clock.js";
import type { AgendaDeadlines } from "./agenda-deadlines.js";
import type { AgendaBroadcaster } from "./agenda-broadcast.js";
import type { JoinRoomDeps } from "./join-room.js";
import type { SaveRosterDeps } from "./save-roster.js";
import { findRoomByToolConnection } from "./room-lookup.js";
import { joinToolRoom } from "./join-tool-room.js";
import { TOOL_AGENDA } from "./tool-id.js";
import type { Logger } from "./log/logger.js";
import { boundaryErrorCode } from "./connection-errors.js";

/**
 * 進行タイマーの接続が受け取る言葉。**ハブの言葉（`room.join` のため）と進行タイマーのコマンドの和**。
 * ハブの言葉のうち `room.create` / `room.check` も境界は通るが、下の振り分けで拒む。
 */
const AgendaConnectionMessageSchema = v.union([HubCommandSchema, AgendaCommandSchema]);

export interface AgendaHandlerDeps extends JoinRoomDeps, SaveRosterDeps {
  agendas: AgendaStore;
  broadcaster: AgendaBroadcaster;
  send: (connId: string, msg: AgendaServerMsg) => void;
  /** 単調時計。**`JoinRoomDeps.clock`（壁時計）とは別物** */
  monotonicClock: MonotonicClock;
  deadlines: AgendaDeadlines;
  /** 受け取るが書かない（利用者の入力をログに出さない）。他のハンドラと依存の形をそろえるために持つ */
  logger: Logger;
}

export interface AgendaHandlers {
  /** 進行タイマーの接続から届いた生テキストを捌く。**境界の検証はここで行う**（原則 IV）。 */
  handleMessage(connId: string, raw: string): Promise<void>;
  /** 自動で次へ進む期限が来たとき、予約から呼ばれる。 */
  onDue(roomCode: string): void;
}

export function makeAgendaHandlers(deps: AgendaHandlerDeps): AgendaHandlers {
  const { agendas, broadcaster, send, monotonicClock, deadlines } = deps;

  /** コマンドの失敗。**文言は agenda-core の文言表から引く**（ここに書かない）。 */
  function fail(connId: string, code: AgendaErrorCode): void {
    send(connId, { type: "error", code, message: agendaErrorMessageFor(code) });
  }

  /**
   * 期限の予約を状態に合わせる。動いている `advance` のステップなら期限に張り、それ以外は消す。
   * **状態が変わったら必ず通す**（延長・一時停止・再開で期限が動く）。
   */
  function rearm(roomCode: string, state: AgendaState): void {
    const at = deadlineOf(state);
    const step = state.steps.find((s) => s.id === state.currentId);
    if (at !== null && step?.onTimeout === "advance") {
      deadlines.arm(roomCode, at, onDue);
    } else {
      deadlines.clear(roomCode);
    }
  }

  /** 保管してから配り、期限を張り直す。**保管と配信は必ず対にする。** */
  function commit(roomCode: string, next: AgendaState): void {
    agendas.put(roomCode, next);
    broadcaster.publish(roomCode);
    rearm(roomCode, next);
  }

  function onDue(roomCode: string): void {
    const state = agendas.get(roomCode);
    if (deps.store.get(roomCode) === undefined || state === undefined) {
      deadlines.clear(roomCode);
      return;
    }
    const advanced = advanceIfDue(state, monotonicClock.now());
    if (advanced === state) {
      // まだ期限前（延長・再開で動いた直後に古い予約が来た等）。予約を状態に合わせ直す。
      rearm(roomCode, state);
      return;
    }
    commit(roomCode, advanced);
  }

  function handleJoin(connId: string, cmd: Extract<HubCommand, { command: "room.join" }>): void {
    // 参加の後に、いまの状態を本人へ 1 通。**状態が無ければここで既定の状態を置く**。
    joinToolRoom(deps, {
      connId,
      cmd,
      tool: TOOL_AGENDA,
      reply: (msg) => send(connId, msg),
      afterJoin: () => broadcaster.sendCurrent(connId, cmd.code),
    });
  }

  function handleAgendaCommand(connId: string, cmd: AgendaCommand): void {
    // この接続が**進行タイマーとして**在席しているルームだけ（名簿を引いて決める）。
    const room = findRoomByToolConnection(deps.store, connId, TOOL_AGENDA);
    if (room === undefined) {
      fail(connId, "NOT_IN_ROOM");
      return;
    }
    if (cmd.command === "agenda.sync") {
      broadcaster.sendCurrent(connId, room.code);
      return;
    }
    const stored = agendas.get(room.code) ?? INITIAL_AGENDA_STATE;
    const now = monotonicClock.now();
    // 期限を過ぎたのに予約がまだ発火していない（発火は遅れうる）なら、**先に自動で次へ進めてから**操作を当てる。
    // 古い区切りに当てると、所要が持ち時間を超えて確定し、終わったはずの区切りで止まる。
    const state = advanceIfDue(stored, now);
    const result = (() => {
      switch (cmd.command) {
        case "agenda.scenario.set":
          return replaceScenario(state, cmd.scenario);
        case "agenda.start":
          return start(state, now);
        case "agenda.next":
          return next(state, { stepId: cmd.stepId, now });
        case "agenda.pause":
          return pause(state, now);
        case "agenda.resume":
          return resume(state, now);
        case "agenda.extend":
          return extend(state, { stepId: cmd.stepId, minutes: cmd.minutes, now });
        case "agenda.skip":
          return setSkipped(state, { stepId: cmd.stepId, skipped: cmd.skipped });
        case "agenda.reset":
          return reset(state);
      }
    })();
    if (result.isErr()) {
      // 操作は拒んでも、自動で次へ進めた分は失わない（保管・配信・張り直し）。
      if (state !== stored) commit(room.code, state);
      fail(connId, result.error.code);
      return;
    }
    // 変わらなければ（同じ参照）配らず、送り主にだけいまの状態を返す（連打・古い画面の押下を全員へ配らない）。
    // 自動で次へ進めた後の状態に対して何もしなかった場合は、進めた分を配る（下の commit）。
    if (result.value === stored) {
      broadcaster.sendCurrent(connId, room.code);
      return;
    }
    commit(room.code, result.value);
  }

  return {
    async handleMessage(connId: string, raw: string): Promise<void> {
      const parsed = parseBoundaryMessage(AgendaConnectionMessageSchema, raw);
      if (parsed.isErr()) {
        fail(connId, boundaryErrorCode(parsed.error.stage));
        return;
      }
      const cmd = parsed.value;
      if (cmd.command === "room.join") {
        handleJoin(connId, cmd);
        return;
      }
      // 進行タイマーの接続はルームを作らず、生死も照会しない（どちらも玄関の仕事）。
      if (cmd.command === "room.create" || cmd.command === "room.check") {
        fail(connId, "INVALID_COMMAND");
        return;
      }
      handleAgendaCommand(connId, cmd);
    },
    onDue,
  };
}
