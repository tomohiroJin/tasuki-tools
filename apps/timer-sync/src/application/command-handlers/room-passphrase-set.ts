/**
 * `room.passphrase.set` の専用ハンドラ（フェーズ7・パイプライン統合）。
 *
 * 在室確認・アクター解決・権限判定（`rejectIfUnauthorized`）は共通パイプライン
 * （`handlers.ts` の `handleRoomCommand`）側で完了済みであり、その結果を
 * `ctx: { room, actor }` として受け取る。このハンドラはドメイン処理
 * （合言葉の正規化・保持・反映）のみを担う。
 */

import { ok, type Result } from "neverthrow";
import {
  type Room,
  type Participant,
  type ErrorCode,
} from "@tasuki/timer-core";
import type { Broadcaster } from "../../ports/broadcaster.js";
import type { RoomStore } from "../../ports/room-store.js";
import type { TokenStore } from "../token-store.js";

/** `handleRoomCommand` が事前に解決済みの在室ルームと実行者。 */
export interface RoomPassphraseSetContext {
  room: Room;
  actor: Participant;
}

export interface RoomPassphraseSetDeps {
  store: RoomStore;
  broadcaster: Broadcaster;
  tokenStore: TokenStore;
}

export function createRoomPassphraseSetHandler(deps: RoomPassphraseSetDeps) {
  const { store, broadcaster, tokenStore } = deps;

  /** ルームパスフレーズを設定/解除する（host 限定・R4-2）。空文字で解除。
   *  平文は tokenStore（旧 roomPassphrases）に保持し、Room には passphraseProtected(boolean)のみ反映。 */
  return async function handleRoomPassphraseSet(
    _connId: string,
    ctx: RoomPassphraseSetContext,
    cmd: { command: "room.passphrase.set"; passphrase: string },
  ): Promise<Result<undefined, ErrorCode>> {
    const { room } = ctx;

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
