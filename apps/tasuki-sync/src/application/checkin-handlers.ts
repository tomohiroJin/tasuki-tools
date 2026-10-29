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
import { findParticipantByConnId, HubCommandSchema, isPresentIn, type HubCommand, type Room } from "@tasuki/room-core";
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
  recordRevealedNames,
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
import { boundaryErrorCode } from "./connection-errors.js";
import type { TimerPort } from "./agenda-deadlines.js";

/** 受ける言葉は**ハブの言葉（`room.join` のため）とチェックインのコマンドの和**。 */
const CheckinConnectionMessageSchema = v.union([HubCommandSchema, CheckinCommandSchema]);

/**
 * 切断による自動公開の猶予（ADR 0028）。まだの人が切断しただけで開けるようになったときは、この時間だけ待って
 * 測り直す。再読み込み・瞬断で匿名の回が開くと、戻った人には山 1 枚で残った人の札が分かるため。
 */
export const CHECKIN_DISCONNECT_REVEAL_GRACE_MS = 10 * 1000;

export interface CheckinHandlerDeps extends JoinRoomDeps, SaveRosterDeps {
  checkins: CheckinStore;
  broadcaster: CheckinBroadcaster;
  send: (connId: string, msg: CheckinServerMsg) => void;
  random: Pick<RandomSource, "randomInt">;
  /** 猶予のタイマー。既定は setTimeout。試験は偽物を渡して時間を手で進める */
  graceTimer?: TimerPort | undefined;
  /** 猶予の長さ。既定は {@link CHECKIN_DISCONNECT_REVEAL_GRACE_MS}。実 WS の試験が設定で縮める */
  disconnectRevealGraceMs?: number | undefined;
}

const DEFAULT_GRACE_TIMER: TimerPort = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** 回の中で一度でもチェックインに在席した人（回の番号ごと）。切断と退出を見分けるのに使う */
interface SeenInRound {
  seq: number;
  ids: Set<string>;
}


export interface CheckinHandlers {
  /** チェックインの接続から届いた生テキストを捌く。**境界の検証はここで行う**（原則 IV）。 */
  handleMessage(connId: string, raw: string): Promise<void>;
  /** 名簿が変わった（参加・切断・退出・ハブへの移動）。状態が無ければ何もしない */
  rosterChanged(roomCode: string): void;
  /** ルームの破棄で、そのルームの猶予のタイマーと記録を解放する（`destroy-room.ts`） */
  clearRoom(roomCode: string): void;
  /** シャットダウンで全ルームの猶予のタイマーを解放する */
  clearAll(): void;
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

  const graceTimer = deps.graceTimer ?? DEFAULT_GRACE_TIMER;
  const graceMs = deps.disconnectRevealGraceMs ?? CHECKIN_DISCONNECT_REVEAL_GRACE_MS;
  /** 猶予のタイマー。ルームごとに 1 本 */
  const graceHandles = new Map<string, unknown>();
  const seenInRound = new Map<string, SeenInRound>();

  function clearGrace(roomCode: string): void {
    if (!graceHandles.has(roomCode)) return;
    graceTimer.clear(graceHandles.get(roomCode));
    graceHandles.delete(roomCode);
  }

  /** 猶予を張る。`restart` なら張り直す（名簿がまた変わった＝別の人が切れたかもしれない） */
  function armGrace(roomCode: string, restart: boolean): void {
    if (graceHandles.has(roomCode) && !restart) return;
    clearGrace(roomCode);
    graceHandles.set(
      roomCode,
      graceTimer.set(() => {
        graceHandles.delete(roomCode);
        graceExpired(roomCode);
      }, graceMs),
    );
  }

  /** 猶予が切れた: その時点の在席で測り直す（戻っていなければ、残った人で開く） */
  function graceExpired(roomCode: string): void {
    const room = deps.store.get(roomCode);
    const state = checkins.get(roomCode);
    if (room === undefined || state === undefined) return;
    const seats = seatsOf(room);
    const pruned = prune(state, idsOf(room));
    const next = recordRevealedNames(applyAutoReveal(pruned, playersOf(pruned, seats)), seats);
    if (next === state) return;
    checkins.put(roomCode, next);
    broadcaster.publish(roomCode);
  }

  /**
   * この回でチェックインに在席したことがあり、名簿に居るのに、いま在席していない人（切断・ハブへの移動）。
   * 回が替わったら数え直す（前の回で去った人で、次の回を毎回待たせない）。名簿から外れた人（退出）は入らない。
   */
  function absentPlayers(room: Room, state: CheckinState, present: readonly string[]): string[] {
    const seq = state.round?.seq ?? 0;
    const prev = seenInRound.get(room.code);
    const ids = prev !== undefined && prev.seq === seq ? prev.ids : new Set<string>();
    const roster = idsOf(room);
    for (const id of ids) if (!roster.has(id)) ids.delete(id);
    for (const p of room.participants) if (isPresentIn(p, TOOL_CHECKIN)) ids.add(p.id);
    seenInRound.set(room.code, { seq, ids });
    const presentSet = new Set(present);
    return [...ids].filter((id) => !presentSet.has(id));
  }

  /**
   * 全員が出していれば開き、開いた回には札を持つ人の名前を写す（後で名簿から外れても山の names が変わらない）。
   * 開く遷移はすべてここを通す（コマンドの後と名簿の変化の後）。
   *
   * **切断しただけの人が居なければ開けない場合は、すぐには開かず猶予を置く**（ADR 0028）。在席の札を出す人では
   * 開けるが、切断・ハブへ移っただけの人を数えると開けないとき。猶予の間に戻れば開かない。退出は待たない。
   * `restartGrace` は名簿の変化のとき true（新しく切れた人の分も待つ）。
   */
  function finish(room: Room, state: CheckinState, restartGrace: boolean): CheckinState {
    const seats = seatsOf(room);
    const present = playersOf(state, seats);
    const absent = absentPlayers(room, state, present);
    const opened = applyAutoReveal(state, present);
    const opensOnlyByAbsence =
      opened !== state && absent.length > 0 && applyAutoReveal(state, [...present, ...absent]) === state;
    if (opensOnlyByAbsence) {
      armGrace(room.code, restartGrace);
      return state;
    }
    clearGrace(room.code);
    return recordRevealedNames(opened, seats);
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
        result = ok(chooseMethod(state, { seq: cmd.seq, method: cmd.method }));
        break;
      case "checkin.method.draw":
        result = drawMethod(state, { seq: cmd.seq, side: cmd.side }, deps.random.randomInt);
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
    const next = finish(room, result.value, false);
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

    clearRoom(roomCode: string): void {
      clearGrace(roomCode);
      seenInRound.delete(roomCode);
    },

    clearAll(): void {
      for (const roomCode of [...graceHandles.keys()]) clearGrace(roomCode);
      seenInRound.clear();
    },

    rosterChanged(roomCode: string): void {
      const room = deps.store.get(roomCode);
      const state = checkins.get(roomCode);
      if (room === undefined || state === undefined) return;
      // 名簿から消えた人の記録を落とし（開いた回の札は残る）、全員が出していれば開く
      const next = finish(room, prune(state, idsOf(room)), true);
      if (next !== state) checkins.put(roomCode, next);
      // 席は名簿から導くので、状態が同じでも画面は変わる
      broadcaster.publish(roomCode);
    },
  };
}
