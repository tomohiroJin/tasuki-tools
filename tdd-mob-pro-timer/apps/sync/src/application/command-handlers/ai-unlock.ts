/**
 * `ai.unlock` の専用ハンドラ（フェーズ5・純粋な移動。ロジック変更なし）。
 *
 * `handlers.ts` の `makeHandlers` クロージャ内にあった `handleAiUnlock` を
 * そのまま移動した。在室確認・アクター解決・`rejectIfUnauthorized` は
 * `handlers.ts` 側の実装をそのまま `deps` 経由で呼ぶ（縮退はフェーズ7）。
 *
 * ★`joinRateLimiter` は `makeHandlers` が `room.join` と共有する単一インスタンスを
 * そのまま受け取る（`join-rate-limiter.ts` のdocstring参照。ここで新規生成しない）。
 */

import { ok, err, type Result } from "neverthrow";
import { errorMessageFor, type Room, type Participant, type ErrorCode } from "@tdd-mob/core";
import type { Clock } from "../../ports/clock.js";
import type { Broadcaster } from "../../ports/broadcaster.js";
import type { RoomStore } from "../../ports/room-store.js";
import type { JoinRateLimiter } from "../join-rate-limiter.js";
import { constantTimeEqual } from "../secure-compare.js";

export interface AiUnlockDeps {
  store: RoomStore;
  clock: Clock;
  broadcaster: Broadcaster;
  /** room.join と共有する単一インスタンス（makeHandlers で1度だけ生成）。 */
  joinRateLimiter: JoinRateLimiter;
  joinFailMax: number;
  /** AI 解錠合言葉。undefined なら AI 機能は無効（解錠は常に失敗＝存在秘匿）。 */
  aiUnlockKey?: string;
  findRoomByConnId: (connId: string) => Room | undefined;
  rejectIfUnauthorized: (
    connId: string,
    room: Room,
    actor: Participant,
    cmd: { command: string; [key: string]: unknown },
  ) => boolean;
  sendError: (connId: string, code: ErrorCode, message: string) => void;
}

export function createAiUnlockHandler(deps: AiUnlockDeps) {
  const {
    store,
    clock,
    broadcaster,
    joinRateLimiter,
    joinFailMax,
    aiUnlockKey,
    findRoomByConnId,
    rejectIfUnauthorized,
    sendError,
  } = deps;

  /** AI お題生成を合言葉で解錠する（host 限定）。
   *  合言葉はサーバ env（AI_UNLOCK_KEY）のみに存在し、Room には aiUnlocked(boolean) だけ反映。
   *  未設定（機能無効）でも不一致と同じ AI_UNLOCK_FAILED を返し、機能の存在を秘匿する。
   *  失敗は join と同じレート制限窓（joinRateLimiter・共有インスタンス）に積算する（総当たり対策）。 */
  return async function handleAiUnlock(
    connId: string,
    cmd: { command: "ai.unlock"; key: string },
  ): Promise<Result<undefined, ErrorCode>> {
    const room = findRoomByConnId(connId);
    if (!room) {
      sendError(connId, "NOT_IN_ROOM", errorMessageFor("NOT_IN_ROOM"));
      return err("NOT_IN_ROOM");
    }
    const actor = room.participants.find((p) => p.connId === connId);
    if (!actor) {
      // 在室ルームは connId で引いているため通常は到達しない防御分岐。
      // 可否ではなくアクター解決の失敗なので、権限の文言は使わない。
      sendError(connId, "UNAUTHORIZED", errorMessageFor("UNAUTHORIZED"));
      return err("UNAUTHORIZED");
    }
    // 開始後は主催者であることを条件にしない（FR-063）。このハンドラは handleCommand の
    // switch で分岐するため handleRoomCommand の判定を通らない。個別に呼ぶ必要がある。
    if (rejectIfUnauthorized(connId, room, actor, cmd)) return err("UNAUTHORIZED");

    // 連続失敗のレート制限（join と同じ窓・閾値を共用）
    const now = clock.now();
    if (joinRateLimiter.recentFailures(connId, now).length >= joinFailMax) {
      sendError(connId, "RATE_LIMITED", errorMessageFor("RATE_LIMITED"));
      return err("RATE_LIMITED");
    }

    const provided = cmd.key.trim();
    const matched =
      aiUnlockKey !== undefined &&
      provided !== "" &&
      constantTimeEqual(provided, aiUnlockKey);
    if (!matched) {
      joinRateLimiter.recordFailure(connId, now);
      sendError(connId, "AI_UNLOCK_FAILED", errorMessageFor("AI_UNLOCK_FAILED"));
      return err("AI_UNLOCK_FAILED");
    }

    const updatedRoom: Room = { ...room, aiUnlocked: true, problemMode: "ai" };
    store.put(updatedRoom);
    broadcaster.broadcastSnapshot(updatedRoom.code, updatedRoom);

    return ok(undefined);
  };
}
