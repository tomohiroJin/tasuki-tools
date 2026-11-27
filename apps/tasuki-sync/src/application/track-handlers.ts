/**
 * うちわけ（`?tool=track`）のメッセージ層（#476）。
 *
 * **うちわけを操作できるのはここだけである。** コマンドはハブ・timer・poker・お題・ルーレット・進行タイマー・
 * チェックインのスキーマに含めず、この接続の境界（`TrackCommandSchema`）にだけ置く。
 *
 * ## ルームへの入り方はハブ・お題・ルーレット・進行タイマーと共有する
 *
 * 参加・復帰は `join-tool-room.ts` を通し、**ここに写しを書かない**。ルームは作らない（`room.create` は拒む）。
 *
 * ## 誰が操作したかを状態へ渡さない
 *
 * 接続 ID は「うちわけとして在席しているか」を名簿で確かめるためだけに使う。ドメインの関数へは、
 * コマンドの中身と時計だけを渡す（設計 §6）。
 *
 * ## 利用者の入力をログに書かない
 *
 * 作業名・表示名は利用者の入力である（`docs/adr/0012`）。**このファイルはログを書かない。**
 */
import * as v from "valibot";
import { ok, type Result } from "neverthrow";
import { HubCommandSchema, isHubCommand, type HubCommand } from "@tasuki/room-core";
import { parseBoundaryMessage } from "@tasuki/protocol";
import {
  adjustSegment,
  away,
  clear,
  dismissOffer,
  insertSegment,
  pin,
  removeSegment,
  setSegment,
  splitSegment,
  start,
  stop,
  trackErrorMessageFor,
  TrackCommandSchema,
  undo,
  type TrackCommand,
  type TrackError,
  type TrackErrorCode,
  type TrackState,
} from "@tasuki/track-core";
import type { MonotonicClock } from "../ports/monotonic-clock.js";
import type { TrackServerMsg } from "../ports/track-server-msg.js";
import type { TrackStore } from "../ports/track-store.js";
import type { JoinRoomDeps } from "./join-room.js";
import type { SaveRosterDeps } from "./save-roster.js";
import type { TrackBroadcaster } from "./track-broadcast.js";
import { findRoomByToolConnection } from "./room-lookup.js";
import { joinToolRoom } from "./join-tool-room.js";
import { TOOL_TRACK } from "./tool-id.js";
import type { Logger } from "./log/logger.js";
import { boundaryErrorCode } from "./connection-errors.js";

/**
 * うちわけの接続が受け取る言葉。**ハブの言葉（`room.join` のため）とうちわけのコマンドの和**。
 * ハブの言葉のうち `room.join` 以外（`isHubCommand`）も境界は通るが、下の振り分けで既定で拒む。
 */
const TrackConnectionMessageSchema = v.union([HubCommandSchema, TrackCommandSchema]);

export interface TrackHandlerDeps extends JoinRoomDeps, SaveRosterDeps {
  tracks: TrackStore;
  broadcaster: TrackBroadcaster;
  send: (connId: string, msg: TrackServerMsg) => void;
  /** 単調時計。**`JoinRoomDeps.clock`（壁時計）とは別物** */
  monotonicClock: MonotonicClock;
  /** 受け取るが書かない（利用者の入力をログに出さない）。他のハンドラと依存の形をそろえるために持つ */
  logger: Logger;
}

export interface TrackHandlers {
  /** うちわけの接続から届いた生テキストを捌く。**境界の検証はここで行う**（原則 IV）。 */
  handleMessage(connId: string, raw: string): Promise<void>;
}

/** 状態を変えるコマンド（`track.sync` は読むだけなので除く）。 */
type MutatingCommand = Exclude<TrackCommand, { command: "track.sync" }>;

/** `backMin` を、あるときだけ載せる（`exactOptionalPropertyTypes` のもとで `undefined` を渡さない）。 */
const backOf = <B>(backMin: B | undefined): { backMin?: B } => (backMin === undefined ? {} : { backMin });

/** コマンドをドメインの関数へ当てる。**接続や参加者の情報は渡さない。** */
function apply(state: TrackState, cmd: MutatingCommand, now: number): Result<TrackState, TrackError> {
  switch (cmd.command) {
    case "track.start":
      return start(state, { label: cmd.label, kind: cmd.kind, ...backOf(cmd.backMin), now });
    case "track.stop":
      return stop(state, { ...backOf(cmd.backMin), ...(cmd.atMs === undefined ? {} : { atMs: cmd.atMs }), now });
    case "track.away":
      return away(state, { fromMs: cmd.fromMs, now });
    case "track.undo":
      return ok(undo(state, { rev: cmd.rev, now }));
    case "track.segment.set":
      return setSegment(state, { id: cmd.id, label: cmd.label, kind: cmd.kind });
    case "track.segment.adjust":
      return adjustSegment(state, { id: cmd.id, edge: cmd.edge, atMs: cmd.atMs, now });
    case "track.segment.split":
      return splitSegment(state, { id: cmd.id, atMs: cmd.atMs, label: cmd.label, kind: cmd.kind, now });
    case "track.segment.insert":
      return insertSegment(state, { startMs: cmd.startMs, endMs: cmd.endMs, label: cmd.label, kind: cmd.kind, now });
    case "track.segment.remove":
      return removeSegment(state, { id: cmd.id });
    case "track.pin":
      return pin(state, { label: cmd.label, pinned: cmd.pinned });
    case "track.offer.dismiss":
      return ok(dismissOffer(state));
    case "track.clear":
      return ok(clear(state, now));
  }
}

export function makeTrackHandlers(deps: TrackHandlerDeps): TrackHandlers {
  const { tracks, broadcaster, send, monotonicClock } = deps;

  /** コマンドの失敗。**文言は track-core の文言表から引く**（ここに書かない）。 */
  function fail(connId: string, code: TrackErrorCode): void {
    send(connId, { type: "error", code, message: trackErrorMessageFor(code) });
  }

  function handleJoin(connId: string, cmd: Extract<HubCommand, { command: "room.join" }>): void {
    // 参加の後に、いまの状態を本人へ 1 通。**状態が無ければここで置く**（その時点が時刻軸の 0 になる）。
    joinToolRoom(deps, {
      connId,
      cmd,
      tool: TOOL_TRACK,
      reply: (msg) => send(connId, msg),
      afterJoin: () => broadcaster.sendCurrent(connId, cmd.code),
    });
  }

  function handleTrackCommand(connId: string, cmd: TrackCommand): void {
    // この接続が**うちわけとして**在席しているルームだけ（名簿を引いて決める）。
    const room = findRoomByToolConnection(deps.store, connId, TOOL_TRACK);
    if (room === undefined) {
      fail(connId, "NOT_IN_ROOM");
      return;
    }
    const stored = tracks.get(room.code);
    if (cmd.command === "track.sync" || stored === undefined) {
      // 状態は参加のときに置くので、無いのは破棄と入れ違った場合だけ。置き直して、いまの写しを返す。
      broadcaster.sendCurrent(connId, room.code);
      return;
    }
    const result = apply(stored, cmd, monotonicClock.now());
    if (result.isErr()) {
      fail(connId, result.error.code);
      return;
    }
    // 変わらなければ（同じ参照）配らず、送り主にだけいまの状態を返す（連打・古い画面の押下を全員へ配らない）。
    if (result.value === stored) {
      broadcaster.sendCurrent(connId, room.code);
      return;
    }
    // 保管してから配る。**保管と配信は必ず対にする。**
    tracks.put(room.code, result.value);
    broadcaster.publish(room.code);
  }

  return {
    async handleMessage(connId: string, raw: string): Promise<void> {
      const parsed = parseBoundaryMessage(TrackConnectionMessageSchema, raw);
      if (parsed.isErr()) {
        fail(connId, boundaryErrorCode(parsed.error.stage));
        return;
      }
      const cmd = parsed.value;
      if (cmd.command === "room.join") {
        handleJoin(connId, cmd);
        return;
      }
      // うちわけの接続はルームを作らず、生死も照会しない（どちらも玄関の仕事）。
      if (isHubCommand(cmd)) {
        fail(connId, "INVALID_COMMAND");
        return;
      }
      handleTrackCommand(connId, cmd);
    },
  };
}
