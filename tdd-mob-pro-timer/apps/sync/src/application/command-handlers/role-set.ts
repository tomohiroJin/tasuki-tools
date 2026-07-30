/**
 * `role.set` の専用ハンドラ（フェーズ5・純粋な移動。ロジック変更なし）。
 *
 * `handlers.ts` の `makeHandlers` クロージャ内にあった `handleRoleSet` を
 * そのまま移動した。在室確認・アクター解決・`rejectIfUnauthorized` は
 * `handlers.ts` 側の実装をそのまま `deps` 経由で呼ぶ（縮退はフェーズ7で行う。
 * tasks.md T011 の指示通り、ここではまだ独自に呼ぶ形のまま）。
 */

import { ok, err, type Result } from "neverthrow";
import {
  canDemote,
  errorMessageFor,
  type Room,
  type Participant,
  type ErrorCode,
} from "@tdd-mob/core";
import type { Broadcaster } from "../../ports/broadcaster.js";
import type { RoomStore } from "../../ports/room-store.js";

export interface RoleSetDeps {
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

export function createRoleSetHandler(deps: RoleSetDeps) {
  const { store, broadcaster, findRoomByConnId, rejectIfUnauthorized, sendError } = deps;

  /** 役割変更（host 限定）FR-016, FR-017 */
  return async function handleRoleSet(
    connId: string,
    cmd: { command: "role.set"; participantId: string; role: "editor" | "viewer" },
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

    // ホスト自身の役割は変更できない（委譲は別経路）
    if (cmd.participantId === room.hostParticipantId) {
      sendError(connId, "CANNOT_CHANGE_HOST_ROLE", errorMessageFor("CANNOT_CHANGE_HOST_ROLE"));
      return err("CANNOT_CHANGE_HOST_ROLE");
    }

    const target = room.participants.find(
      (p) => p.participantId === cmd.participantId,
    );
    if (!target) {
      sendError(connId, "PARTICIPANT_NOT_FOUND", errorMessageFor("PARTICIPANT_NOT_FOUND"));
      return err("PARTICIPANT_NOT_FOUND");
    }

    // 不変条件: 実在（非代理）の編集者以上が1名以上残ること（FR-072/073）。
    // 権限（誰が実行できるか）とは独立したドメインガードなので、checkPermission が
    // 許可した後に別途検査する（plan.md D3）。昇格は人数を減らさないので対象外。
    if (cmd.role === "viewer" && !canDemote(room.participants, cmd.participantId)) {
      sendError(connId, "LAST_MANAGER_DEMOTE", errorMessageFor("LAST_MANAGER_DEMOTE"));
      return err("LAST_MANAGER_DEMOTE");
    }

    const updatedRoom: Room = {
      ...room,
      participants: room.participants.map((p) =>
        p.participantId === cmd.participantId ? { ...p, role: cmd.role } : p,
      ),
    };

    store.put(updatedRoom);
    broadcaster.broadcastSnapshot(updatedRoom.code, updatedRoom);

    return ok(undefined);
  };
}
