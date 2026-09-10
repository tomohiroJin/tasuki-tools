/**
 * `room.passphrase.set` の専用ハンドラ（フェーズ7・パイプライン統合）。
 *
 * 在室確認とアクター解決は共通パイプライン
 * （`handlers.ts` の `handleRoomCommand`）側で完了済みであり、その結果を
 * `ctx: { room, actor }` として受け取る。このハンドラはドメイン処理
 * （合言葉の正規化・保持・反映）のみを担う。
 */

import { ok, type Result } from "neverthrow";
import { type ErrorCode } from "@tasuki/timer-core";
import type { Participant as MembershipParticipant } from "@tasuki/room-core";
import type { TokenStore } from "../token-store.js";
import type { RoomState } from "../apply-room-level-event.js";

/** `handleRoomCommand` が事前に解決済みの在室ルームと実行者。 */
export interface RoomPassphraseSetContext {
  state: RoomState;
  actor: MembershipParticipant;
}

export interface RoomPassphraseSetDeps {
  /** 名簿と timer の状態を保管し、合成した snapshot を配信する（`handlers.ts`）。 */
  commit: (state: RoomState) => void;
  tokenStore: TokenStore;
}

export function createRoomPassphraseSetHandler(deps: RoomPassphraseSetDeps) {
  const { commit, tokenStore } = deps;

  /** ルームパスフレーズを設定/解除する（R4-2）。**在室者なら誰でも実行できる**
   *  （#95 S3 以前は host 限定だった）。空文字で解除。
   *  平文は tokenStore（旧 roomPassphrases）に保持し、timer の状態には passphraseProtected(boolean)のみ反映。 */
  return async function handleRoomPassphraseSet(
    _connId: string,
    ctx: RoomPassphraseSetContext,
    cmd: { command: "room.passphrase.set"; passphrase: string },
  ): Promise<Result<undefined, ErrorCode>> {
    const { membership, timer } = ctx.state;

    // 前後空白を正規化して保持（設定側/参加側の trim 差異による「正しいのに不一致」を防ぐ）。
    // 空白のみ・空文字は解除扱い。
    const passphrase = cmd.passphrase.trim();
    if (passphrase === "") {
      tokenStore.deletePassphrase(timer.code);
    } else {
      tokenStore.setPassphrase(timer.code, passphrase);
    }
    commit({ membership, timer: { ...timer, passphraseProtected: passphrase !== "" } });

    return ok(undefined);
  };
}
