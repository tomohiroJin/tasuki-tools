/**
 * `role.set` の専用ハンドラ（フェーズ7・パイプライン統合）。
 *
 * 在室確認・アクター解決・権限判定（`rejectIfUnauthorized`）は共通パイプライン
 * （`handlers.ts` の `handleRoomCommand`）側で完了済みであり、その結果を
 * `ctx: { room, actor }` として受け取る。このハンドラはドメイン処理
 * （ホスト自身の役割変更禁止・対象解決・LAST_MANAGER_DEMOTE 検査・反映）のみを担う。
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

/** `handleRoomCommand` が事前に解決済みの在室ルームと実行者。 */
export interface RoleSetContext {
  room: Room;
  actor: Participant;
}

export interface RoleSetDeps {
  store: RoomStore;
  broadcaster: Broadcaster;
  sendError: (connId: string, code: ErrorCode, message: string) => void;
}

export function createRoleSetHandler(deps: RoleSetDeps) {
  const { store, broadcaster, sendError } = deps;

  /** 役割変更（host 限定）FR-016, FR-017 */
  return async function handleRoleSet(
    connId: string,
    ctx: RoleSetContext,
    cmd: { command: "role.set"; participantId: string; role: "editor" | "viewer" },
  ): Promise<Result<undefined, ErrorCode>> {
    const { room } = ctx;

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
