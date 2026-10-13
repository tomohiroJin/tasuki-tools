/**
 * ルーレット（`?tool=roulette`）のメッセージ層（#94・spec §5.2）。
 *
 * **ルーレットを操作できるのはここだけである**（spec R11）。ルーレットのコマンドはハブ・timer・
 * poker・お題のスキーマに含めず、この接続の境界（`RouletteCommandSchema`）にだけ置く。
 * 共通の処理（`handlers.ts`）にツール別の可否判定を戻さない。
 *
 * ## ルームへの入り方はハブ・お題と共有する
 *
 * 参加・復帰は `join-room.ts`（レート制限・合言葉の関門・復帰）を通し、表示名は
 * `display-name-rule.ts` を通す。**ここに写しを書かない**（`topic-handlers.ts` の冒頭と同じ理由）。
 * ルームは作らない（`room.create` は拒む）。
 *
 * ## 利用者の入力をログに書かない
 *
 * ゲストの名前・表示名は利用者の入力である（`docs/adr/0012`・spec R13）。このファイルはそれらをログに書かない。
 * 書くのは、乱数源の契約違反（`INVALID_RANDOM`）を知らせる固定の語彙の 1 行だけである（#364。下の `roulette.spin`）。
 * 時計は**単調時計**（`performance.now()` 系）。壁時計は NTP の調整で戻りうる。
 */
import * as v from "valibot";
import {
  conflictsWithExisting,
  findParticipantByConnId,
  HubCommandSchema,
  presenceOf,
  type HubCommand,
  type Room,
} from "@tasuki/room-core";
import { parseBoundaryMessage } from "@tasuki/protocol";
import { errorMessageFor } from "@tasuki/timer-core";
import {
  addGuest,
  INITIAL_ROULETTE_STATE,
  prune,
  removeGuest,
  resetCycle,
  RouletteCommandSchema,
  rouletteErrorMessageFor,
  setIncluded,
  startSpin,
  type Member,
  type RouletteCommand,
  type RouletteErrorCode,
  type RouletteState,
} from "@tasuki/roulette-core";
import type { MonotonicClock } from "../ports/poker-monotonic-clock.js";
import type { RandomSource } from "../ports/random-source.js";
import type { RouletteServerMsg } from "../ports/roulette-server-msg.js";
import type { RouletteStore } from "../ports/roulette-store.js";
import { applyDisplayNameRule, INVALID_DISPLAY_NAME_MESSAGE } from "./display-name-rule.js";
import { joinRoom, ROOM_NOT_FOUND_MESSAGE, type JoinRoomDeps } from "./join-room.js";
import type { RouletteBroadcaster } from "./roulette-broadcast.js";
import { saveRoster, type SaveRosterDeps } from "./save-roster.js";
import { TOOL_ROULETTE } from "./tool-id.js";
import type { Logger } from "./log/logger.js";
import { ERROR_NAMES } from "./log/vocabulary.js";
import { boundaryErrorCode } from "./connection-errors.js";

/**
 * ルーレットの接続が受け取る言葉。**ハブの言葉（`room.join` のため）とルーレットのコマンドの和**。
 * ハブの言葉のうち `room.create` / `room.check` も境界は通るが、下の振り分けで拒む。
 */
const RouletteConnectionMessageSchema = v.union([HubCommandSchema, RouletteCommandSchema]);

export interface RouletteHandlerDeps extends JoinRoomDeps, SaveRosterDeps {
  roulettes: RouletteStore;
  broadcaster: RouletteBroadcaster;
  send: (connId: string, msg: RouletteServerMsg) => void;
  /** 単調時計。**`JoinRoomDeps.clock`（壁時計）とは別物** */
  monotonicClock: MonotonicClock;
  random: RandomSource;
  logger: Logger;
}

export interface RouletteHandlers {
  /** ルーレットの接続から届いた生テキストを捌く。**境界の検証はここで行う**（原則 IV）。 */
  handleMessage(connId: string, raw: string): Promise<void>;
}

export function makeRouletteHandlers(deps: RouletteHandlerDeps): RouletteHandlers {
  const { roulettes, broadcaster, send, monotonicClock, random, logger } = deps;

  /** コマンドの失敗。**文言は roulette-core の文言表から引く**（ここに書かない）。 */
  function fail(connId: string, code: RouletteErrorCode): void {
    send(connId, { type: "error", code, message: rouletteErrorMessageFor(code) });
  }

  /** 参加の失敗。**コードも文言もハブと同じ形で返す**（`topic-handlers.ts` の `failJoin`）。 */
  function failJoin(connId: string, code: string, message: string): void {
    send(connId, { type: "error", code, message });
  }

  function handleJoin(connId: string, cmd: Extract<HubCommand, { command: "room.join" }>): void {
    // 既にどこかのルームに居る接続からの 2 度目の参加は拒み、何も変えない（理由は topic-handlers.ts）。
    if (isInAnyRoom(connId)) {
      failJoin(connId, "INVALID_COMMAND", rouletteErrorMessageFor("INVALID_COMMAND"));
      return;
    }

    const applied = applyDisplayNameRule(cmd.displayName);
    if (applied.isErr()) {
      failJoin(connId, "INVALID_COMMAND", INVALID_DISPLAY_NAME_MESSAGE);
      return;
    }

    const joined = joinRoom(deps, {
      connId,
      code: cmd.code,
      displayName: applied.value,
      tool: TOOL_ROULETTE,
      ...(cmd.resumeToken !== undefined ? { resumeToken: cmd.resumeToken } : {}),
      ...(cmd.passphrase !== undefined ? { passphrase: cmd.passphrase } : {}),
    });
    if (joined.isErr()) {
      const code = joined.error;
      failJoin(connId, code, code === "ROOM_NOT_FOUND" ? ROOM_NOT_FOUND_MESSAGE : errorMessageFor(code));
      return;
    }

    const { participantId, resumeToken, membership } = joined.value;
    send(connId, { type: "room.joined", code: cmd.code, participantId, resumeToken });
    // 保管と配信は対にする（`save-roster.ts`）。ルーレットの接続が在席に載ったことは玄関にも届く。
    saveRoster(deps, membership);
    // いまの状態を本人へ 1 通。**状態が無ければここで既定の状態を置く**（spec §5.4）。
    broadcaster.sendCurrent(connId, cmd.code);
  }

  /**
   * この接続が**ルーレットとして**在席しているルームのコード。名簿を引いて決める。
   * 接続 ID だけで引くと、timer やハブの接続として在席している接続がルーレットを操作できてしまう
   * （spec R11 の 2 段目。1 段目は ws-adapter の振り分け）。
   */
  function roomOf(connId: string): Room | undefined {
    return deps.store
      .list()
      .find((r) => findParticipantByConnId(r, connId)?.connections.get(connId) === TOOL_ROULETTE);
  }

  /** この接続がどれかのルームに（ツールを問わず）在席しているか。2 度目の参加を拒むために引く。 */
  function isInAnyRoom(connId: string): boolean {
    return deps.store.list().some((r) => findParticipantByConnId(r, connId) !== undefined);
  }

  /** 名簿の断片（在室は接続の有無から導く）。 */
  function membersOf(room: Room): Member[] {
    return room.participants.map((p) => ({ id: p.id, name: p.displayName, present: presenceOf(p) === "online" }));
  }

  /** 名簿の全参加者 ∪ ゲストの ID。`prune` と「知らない ID は無視する」に使う。 */
  function knownIdsOf(room: Room, state: RouletteState): Set<string> {
    return new Set([...room.participants.map((p) => p.id), ...state.guests.map((g) => g.id)]);
  }

  /**
   * 保管してから配る（宛先は呼び出し時点の名簿から決まる）。**保管と配信は必ず対にする。**
   *
   * - 変わらなければ（保管している状態と同じ参照なら）保管も配信もしない。遷移関数は変わらないとき
   *   同じ参照を返す（`setIncluded`・`removeGuest`・`resetCycle`・`prune`）。知らない ID の押下や連打の
   *   たびに全接続へ同じフレームを配らない
   * - 失敗したコマンドはここを通らない（保管も配信もしない）。`prune` で落とした記録は、次に成功した
   *   コマンドが一緒に保管して配る —— 保管だけして配らないと、画面が見ている状態と保管が食い違う
   */
  function commit(roomCode: string, stored: RouletteState | undefined, next: RouletteState): void {
    if (next === (stored ?? INITIAL_ROULETTE_STATE)) return;
    roulettes.put(roomCode, next);
    broadcaster.publish(roomCode);
  }

  function handleRouletteCommand(connId: string, cmd: RouletteCommand): void {
    const room = roomOf(connId);
    if (room === undefined) {
      fail(connId, "NOT_IN_ROOM");
      return;
    }
    // コマンドを受けるたびに、名簿から消えた参加者の記録を落としてから遷移する（配列を膨らませない）。
    const stored = roulettes.get(room.code);
    const base = stored ?? INITIAL_ROULETTE_STATE;
    const state = prune(base, knownIdsOf(room, base));

    switch (cmd.command) {
      case "roulette.spin": {
        const spunBy = findParticipantByConnId(room, connId)?.displayName ?? "";
        const next = startSpin(state, {
          members: membersOf(room),
          spunBy,
          now: monotonicClock.now(),
          randomInt: random.randomInt,
          randomSettle: random.randomSettle,
          conflicts: conflictsWithExisting,
        });
        if (next.isErr()) {
          const code = next.error.code;
          // INVALID_SETTLE・INVALID_RANDOM は乱数源の誤りで、利用者の操作では起きない。内部の誤りとして返す。
          if (code === "INVALID_RANDOM") {
            // #364 より前は、ドメインが RangeError を投げ、接続層（ws-adapter.ts）が「ログ → エラーフレーム」を
            // 返していた。その行を変えないため、ここで同じ行を残す（INVALID_SETTLE は元からログが無い。#382）。
            logger.error("on-message-error", { name: ERROR_NAMES.rangeError });
          }
          fail(connId, code === "INVALID_SETTLE" || code === "INVALID_RANDOM" ? "INTERNAL_ERROR" : code);
          return;
        }
        commit(room.code, stored, next.value);
        return;
      }
      case "roulette.include":
        // 知らない ID は黙って無視する（退出と同時に押されることがある）。
        commit(
          room.code,
          stored,
          knownIdsOf(room, state).has(cmd.id) ? setIncluded(state, cmd.id, cmd.included) : state,
        );
        return;
      case "roulette.guest.add": {
        const applied = applyDisplayNameRule(cmd.name);
        if (applied.isErr()) {
          fail(connId, "INVALID_GUEST_NAME");
          return;
        }
        // 同名の判定は参加の重複拒否と同じ関数・同じキー（`conflictsWithExisting`・spec R13）。
        // 比べる相手は名簿の全参加者（在室を問わない）とゲスト（ゲスト同士は addGuest が見る）。
        const added = addGuest(state, applied.value, membersOf(room), conflictsWithExisting);
        if (added.isErr()) {
          fail(connId, added.error.code);
          return;
        }
        commit(room.code, stored, added.value);
        return;
      }
      case "roulette.guest.remove":
        commit(room.code, stored, removeGuest(state, cmd.id));
        return;
      case "roulette.cycle.reset":
        commit(room.code, stored, resetCycle(state));
        return;
    }
  }

  return {
    async handleMessage(connId: string, raw: string): Promise<void> {
      // 境界のパースは `@tasuki/protocol` に一本化してある（timer / poker / ハブ / お題と同じ入口）。
      const parsed = parseBoundaryMessage(RouletteConnectionMessageSchema, raw);
      if (parsed.isErr()) {
        fail(connId, boundaryErrorCode(parsed.error.stage));
        return;
      }

      const cmd = parsed.value;
      if (cmd.command === "room.join") {
        handleJoin(connId, cmd);
        return;
      }
      // ルーレットの接続はルームを作らず、生死も照会しない（どちらも玄関の仕事）。
      if (cmd.command === "room.create" || cmd.command === "room.check") {
        fail(connId, "INVALID_COMMAND");
        return;
      }
      handleRouletteCommand(connId, cmd);
    },
  };
}
