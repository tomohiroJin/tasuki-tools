/**
 * `host.transfer` の専用ハンドラ（フェーズ5・純粋な移動。ロジック変更なし）。
 *
 * `handlers.ts` の `makeHandlers` クロージャ内にあった `handleHostTransfer` を
 * そのまま移動した。在室確認・アクター解決・`rejectIfUnauthorized` は
 * `handlers.ts` 側の実装をそのまま `deps` 経由で呼ぶ（縮退はフェーズ7）。
 */

import { ok, err, type Result } from "neverthrow";
import {
  transferHost,
  errorMessageFor,
  type Room,
  type Participant,
  type ErrorCode,
} from "@tdd-mob/core";
import type { Broadcaster } from "../../ports/broadcaster.js";
import type { RoomStore } from "../../ports/room-store.js";

export interface HostTransferDeps {
  store: RoomStore;
  broadcaster: Broadcaster;
  findRoomByConnId: (connId: string) => Room | undefined;
  rejectIfUnauthorized: (
    connId: string,
    room: Room,
    actor: Participant,
    cmd: { command: string; [key: string]: unknown },
  ) => boolean;
  sendError: (connId: string, code: ErrorCode, message: string) => void;
}

export function createHostTransferHandler(deps: HostTransferDeps) {
  const { store, broadcaster, findRoomByConnId, rejectIfUnauthorized, sendError } = deps;

  /** ホストを明示的に他のオンライン参加者へ移譲する（host 限定・R2-3）。
   *  自動委譲（presence）と同じ transferHost を用い、snapshot で全員に反映する。 */
  return async function handleHostTransfer(
    connId: string,
    cmd: { command: "host.transfer"; participantId: string },
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
