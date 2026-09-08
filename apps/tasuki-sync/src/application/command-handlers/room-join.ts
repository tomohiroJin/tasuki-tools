/**
 * `room.join` の専用ハンドラ（フェーズ5・純粋な移動。ロジック変更なし）。
 *
 * `handlers.ts` の `makeHandlers` クロージャ内にあった `handleRoomJoin` を
 * そのまま移動し、参照していたクロージャ変数を `deps` 引数として明示化した。
 * `rateLimitGate` は `makeHandlers` 側で1度だけ生成した共有インスタンスを
 * そのまま受け取る（`ai.unlock` と同じバケツを共有する契約は `handlers.ts` の
 * 生成箇所のコメント参照。ここでは共有インスタンスを受け取って使うだけで、
 * 新規生成はしない）。
 *
 * ★ #103 で数える単位が接続からクライアント（IP の HMAC）へ変わり、それに伴い
 * レート制限へ渡す時刻が**壁時計から単調時計へ変わった**（設計正本 D8）。
 * このファイルには系統の異なる 2 つの「いま」がある。取り違えないこと。
 */

import { ok, err, type Result } from "neverthrow";
import {
  errorMessageFor,
  type Room,
  type Participant,
  type ErrorCode,
} from "@tasuki/timer-core";
import type { Clock } from "../../ports/clock.js";
import type { Broadcaster } from "../../ports/broadcaster.js";
import type { RoomStore } from "../../ports/room-store.js";
import type { RoomCodeGen } from "../../ports/code-gen.js";
import type { TokenStore } from "../token-store.js";
import type { RateLimitGate } from "../rate-limit-gate.js";
import { constantTimeEqual } from "../secure-compare.js";

/** `room.join` が呼び出し元へ返す値。参加者はホストトークンを持たない。 */
export interface JoinResult {
  code: string;
  participantId: string;
  resumeToken: string;
}

export interface RoomJoinDeps {
  store: RoomStore;
  clock: Clock;
  broadcaster: Broadcaster;
  codeGen: RoomCodeGen;
  tokenStore: TokenStore;
  /** room.join と ai.unlock が共有する単一インスタンス（makeHandlers で1度だけ生成）。 */
  rateLimitGate: RateLimitGate;
  sendError: (connId: string, code: ErrorCode, message: string) => void;
}

export function createRoomJoinHandler(deps: RoomJoinDeps) {
  const { store, broadcaster, codeGen, tokenStore, rateLimitGate, sendError } = deps;
  const clock = deps.clock;

  /** ルーム参加 */
  return async function handleRoomJoin(
    connId: string,
    cmd: {
      command: "room.join";
      code: string;
      displayName: string;
      hasAiKey: boolean;
      resumeToken?: string;
      passphrase?: string;
    },
  ): Promise<Result<JoinResult, ErrorCode>> {
    // ルームの会計（joinedAt）に使う壁時計。**レート制限には渡さない**（設計正本 D8）。
    const now = clock.now();
    // レート制限に渡す単調時計。壁時計とは別系統で、NTP のステップ調整・起動時の
    // 時計補正の影響を受けない（設計正本 D8）。`now` と取り違えないこと。
    const rateNow = performance.now();

    // **ルームを照会する前に判定する。** 照会してから判定すると、残量が無いときに
    // ROOM_NOT_FOUND が返り、攻撃者はトークンを消費せずに存在確認を続けられる（設計正本 D3）。
    if (rateLimitGate.shouldReject(connId, rateNow)) {
      sendError(connId, "JOIN_RATE_LIMITED", errorMessageFor("JOIN_RATE_LIMITED"));
      return err("JOIN_RATE_LIMITED");
    }

    const room = store.get(cmd.code);

    if (!room) {
      // 失敗を記録（次回以降のレート判定に使う）。時刻は単調時計のほう（D8）。
      rateLimitGate.consume(connId, rateNow);
      sendError(connId, "ROOM_NOT_FOUND", "指定されたルームコードが見つかりません");
      return err("ROOM_NOT_FOUND");
    }

    // リジューム処理
    if (cmd.resumeToken) {
      const tokenData = tokenStore.getResume(cmd.resumeToken);
      if (tokenData && tokenData.roomCode === cmd.code) {
        const existingParticipant = room.participants.find(
          (p) => p.participantId === tokenData.participantId,
        );
        if (existingParticipant) {
          const updatedRoom: Room = {
            ...room,
            participants: room.participants.map((p) =>
              p.participantId === tokenData.participantId
                ? { ...p, connId, presence: "online" }
                : p,
            ),
          };
          store.put(updatedRoom);
          broadcaster.sendTo(connId, {
            type: "snapshot",
            room: updatedRoom,
          });
          broadcaster.broadcastSnapshot(cmd.code, updatedRoom);
          return ok({
            code: cmd.code,
            participantId: tokenData.participantId,
            resumeToken: cmd.resumeToken,
          });
        }
      }
    }

    // パスフレーズ保護ルームは新規参加時に一致を要求する（R4-2）。
    // resume（再接続）は上の resume ブロックで return 済みのためここには来ない＝再認証不要。
    const requiredPassphrase = tokenStore.getPassphrase(cmd.code);
    // 保持側と同じく前後空白を正規化して比較する。
    const providedPassphrase = (cmd.passphrase ?? "").trim();
    // 秘密の照合は定数時間で行う（ADR 0012・管理トークン／AI 解錠と同じ規律）。
    if (
      requiredPassphrase !== undefined &&
      !constantTimeEqual(providedPassphrase, requiredPassphrase)
    ) {
      // 失敗をレート制限に積算（パスフレーズ総当たりの緩和・既存 join 制限と統合）。
      // 時刻は単調時計のほう（D8）。
      rateLimitGate.consume(connId, rateNow);
      const code: ErrorCode = providedPassphrase
        ? "PASSPHRASE_MISMATCH"
        : "PASSPHRASE_REQUIRED";
      sendError(
        connId,
        code,
        code === "PASSPHRASE_REQUIRED"
          ? errorMessageFor("PASSPHRASE_REQUIRED")
          : errorMessageFor("PASSPHRASE_MISMATCH"),
      );
      return err(code);
    }

    // 新規参加者は editor として登録（UX 再設計の2層モデル: 名乗って参加した人は
    // すぐドライバーに加われる。ローテーション加入は別操作＝「ドライバーに加わる」）。
    // 純粋な見学者は host が role.set で viewer へ降格できる。
    const participantId = codeGen.generateParticipantId();
    const resumeToken = codeGen.generateResumeToken();

    const newParticipant: Participant = {
      participantId,
      connId,
      displayName: cmd.displayName,
      role: "editor",
      presence: "online",
      hasAiKey: cmd.hasAiKey,
      joinedAt: now,
    };

    const updatedRoom: Room = {
      ...room,
      participants: [...room.participants, newParticipant],
    };

    store.put(updatedRoom);
    tokenStore.issueResume(resumeToken, { participantId, roomCode: cmd.code });

    broadcaster.sendTo(connId, {
      type: "room.joined",
      resumeToken,
      participantId,
    });

    broadcaster.sendTo(connId, {
      type: "snapshot",
      room: updatedRoom,
    });

    broadcaster.broadcastSnapshot(cmd.code, updatedRoom);

    return ok({ code: cmd.code, participantId, resumeToken });
  };
}
