/**
 * `room.passphrase.set` の専用ハンドラ（フェーズ5・純粋な移動。ロジック変更なし）。
 *
 * `handlers.ts` の `makeHandlers` クロージャ内にあった `handleRoomPassphraseSet` を
 * そのまま移動した。在室確認・アクター解決・`rejectIfUnauthorized` は
 * `handlers.ts` 側の実装をそのまま `deps` 経由で呼ぶ（縮退はフェーズ7）。
 */

import { ok, err, type Result } from "neverthrow";
import {
  errorMessageFor,
  type Room,
  type Participant,
  type ErrorCode,
} from "@tdd-mob/core";
import type { Broadcaster } from "../../ports/broadcaster.js";
import type { RoomStore } from "../../ports/room-store.js";
import type { TokenStore } from "../token-store.js";

export interface RoomPassphraseSetDeps {
  store: RoomStore;
  broadcaster: Broadcaster;
  tokenStore: TokenStore;
  findRoomByConnId: (connId: string) => Room | undefined;
  rejectIfUnauthorized: (
    connId: string,
    room: Room,
    actor: Participant,
    cmd: { command: string; [key: string]: unknown },
  ) => boolean;
  sendError: (connId: string, code: ErrorCode, message: string) => void;
}

export function createRoomPassphraseSetHandler(deps: RoomPassphraseSetDeps) {
  const { store, broadcaster, tokenStore, findRoomByConnId, rejectIfUnauthorized, sendError } = deps;

  /** ルームパスフレーズを設定/解除する（host 限定・R4-2）。空文字で解除。
   *  平文は tokenStore（旧 roomPassphrases）に保持し、Room には passphraseProtected(boolean)のみ反映。 */
  return async function handleRoomPassphraseSet(
    connId: string,
    cmd: { command: "room.passphrase.set"; passphrase: string },
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

    // 前後空白を正規化して保持（設定側/参加側の trim 差異による「正しいのに不一致」を防ぐ）。
    // 空白のみ・空文字は解除扱い。
    const passphrase = cmd.passphrase.trim();
    if (passphrase === "") {
      tokenStore.deletePassphrase(room.code);
    } else {
      tokenStore.setPassphrase(room.code, passphrase);
    }
    const updatedRoom: Room = {
      ...room,
      passphraseProtected: passphrase !== "",
    };
    store.put(updatedRoom);
    broadcaster.broadcastSnapshot(updatedRoom.code, updatedRoom);

    return ok(undefined);
  };
}
