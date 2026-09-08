/**
 * `host.transfer` の専用ハンドラ（フェーズ7・パイプライン統合）。
 *
 * 在室確認・アクター解決・権限判定（`rejectIfUnauthorized`）は共通パイプライン
 * （`handlers.ts` の `handleRoomCommand`）側で完了済みであり、その結果を
 * `ctx: { room, actor }` として受け取る。このハンドラはドメイン処理
 * （対象解決・オフライン拒否・移譲反映）のみを担う。
 */

import { ok, err, type Result } from "neverthrow";
import {
  transferHost,
  errorMessageFor,
  type Room,
  type Participant,
  type ErrorCode,
} from "@tasuki/timer-core";
import type { Broadcaster } from "../../ports/broadcaster.js";
import type { RoomStore } from "../../ports/room-store.js";

/** `handleRoomCommand` が事前に解決済みの在室ルームと実行者。 */
export interface HostTransferContext {
  room: Room;
  actor: Participant;
}

export interface HostTransferDeps {
  store: RoomStore;
  broadcaster: Broadcaster;
  sendError: (connId: string, code: ErrorCode, message: string) => void;
}

export function createHostTransferHandler(deps: HostTransferDeps) {
  const { store, broadcaster, sendError } = deps;

  /** ホストを明示的に他のオンライン参加者へ移譲する（host 限定・R2-3）。
   *  自動委譲（presence）と同じ transferHost を用い、snapshot で全員に反映する。 */
  return async function handleHostTransfer(
    connId: string,
    ctx: HostTransferContext,
    cmd: { command: "host.transfer"; participantId: string },
  ): Promise<Result<undefined, ErrorCode>> {
    const { room } = ctx;

    // 対象がすでにホストなら移譲は無意味（実行者と対象は同一とは限らない。
    // Issue #22 以降 host.transfer は開始後 editor+ が実行できるため、
    // 「自分自身には」という表現はここでは使わない・FR-138）
    if (cmd.participantId === room.hostParticipantId) {
      sendError(connId, "ALREADY_HOST", errorMessageFor("ALREADY_HOST"));
      return err("ALREADY_HOST");
    }

    const target = room.participants.find(
      (p) => p.participantId === cmd.participantId,
    );
    if (!target) {
      sendError(connId, "PARTICIPANT_NOT_FOUND", errorMessageFor("PARTICIPANT_NOT_FOUND"));
      return err("PARTICIPANT_NOT_FOUND");
    }

    // オフラインの相手をホストにすると無人運用になり得るため拒否する
    if (target.presence === "offline") {
      sendError(connId, "HOST_TRANSFER_OFFLINE", errorMessageFor("HOST_TRANSFER_OFFLINE"));
      return err("HOST_TRANSFER_OFFLINE");
    }

    const updatedRoom = transferHost(room, cmd.participantId);
    store.put(updatedRoom);
    broadcaster.broadcastSnapshot(updatedRoom.code, updatedRoom);

    return ok(undefined);
  };
}
