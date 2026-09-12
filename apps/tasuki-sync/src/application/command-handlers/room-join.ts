/**
 * `room.join` の専用ハンドラ（フェーズ5・純粋な移動。ロジック変更なし）。
 *
 * `handlers.ts` の `makeHandlers` クロージャ内にあった `handleRoomJoin` を
 * そのまま移動し、参照していたクロージャ変数を `deps` 引数として明示化した。
 * `rateLimitGate` は受け取るだけで、ここでは新規生成しない。**バケツとゲートで
 * 出どころが違う**（#95 S4a）: **バケツ（`RateLimiter`）は配線
 * （`create-sync-server.ts`）が 1 個作って timer と poker へ渡し**、**ゲートは
 * `makeHandlers` がそのバケツを 1 度だけ包む**。したがって `ai.unlock` と
 * 同じバケツを見ることは構造の帰結である（`handlers.ts` の生成箇所のコメント参照）。
 *
 * ★ #103 で数える単位が接続からクライアント（IP の HMAC）へ変わり、それに伴い
 * レート制限へ渡す時刻が**壁時計から単調時計へ変わった**（設計正本 D8）。
 * このファイルには系統の異なる 2 つの「いま」がある。取り違えないこと。
 */

import { ok, err, type Result } from "neverthrow";
import { errorMessageFor, type ErrorCode } from "@tasuki/timer-core";
import {
  addParticipant,
  attachConnection,
  findParticipant,
  type Participant as MembershipParticipant,
} from "@tasuki/room-core";
import type { Clock } from "../../ports/clock.js";
import type { Broadcaster } from "../../ports/broadcaster.js";
import type { RoomStore } from "../../ports/room-store.js";
import type { TimerStore } from "../../ports/timer-store.js";
import type { RoomCodeGen } from "../../ports/code-gen.js";
import type { TokenStore } from "../token-store.js";
import type { RateLimitGate } from "../rate-limit-gate.js";
import type { ToolGate } from "../tool-gate.js";
import { constantTimeEqual } from "../secure-compare.js";
import { buildTimerSnapshotRoom } from "../timer-snapshot-dto.js";
import type { RoomState } from "../apply-room-level-event.js";
import { TOOL_TIMER } from "../tool-id.js";

/** `room.join` が呼び出し元へ返す値。 */
export interface JoinResult {
  code: string;
  participantId: string;
  resumeToken: string;
}

export interface RoomJoinDeps {
  store: RoomStore;
  timers: TimerStore;
  clock: Clock;
  broadcaster: Broadcaster;
  /** 名簿と timer の状態を保管し、合成した snapshot を配信する（`handlers.ts`）。 */
  commit: (state: RoomState) => void;
  codeGen: RoomCodeGen;
  tokenStore: TokenStore;
  /** 入口ごとの門（`../tool-gate.ts`）。timer と poker で 1 個を共有する（#95 S4a）。 */
  toolGate: ToolGate;
  /** room.join と ai.unlock が共有するバケツの上に立つゲート（`handlers.ts` が組む）。 */
  rateLimitGate: RateLimitGate;
  sendError: (connId: string, code: ErrorCode, message: string) => void;
}

export function createRoomJoinHandler(deps: RoomJoinDeps) {
  const {
    store,
    timers,
    broadcaster,
    commit,
    codeGen,
    tokenStore,
    toolGate,
    rateLimitGate,
    sendError,
  } = deps;
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
    const timer = timers.get(cmd.code);

    // **入口の門**（`../tool-gate.ts`・#95 S4a）。名簿は poker と 1 つの保管なので、
    // 「名簿にある」ことは「timer のルームである」ことを意味しない。timer の状態が
    // 無いルーム（poker の入口で作られたルーム）は、**存在しないルームと完全に同じ応答**
    // で拒む —— 区別できるとルームコード列挙の手がかりになる（ADR 0011）。
    //
    // **`timer === undefined` と同値の判定である。** それでも門を通すのは、
    // 「そのツールの状態があるルームにだけ入れる」という規則を 2 つの入口で 1 箇所
    // （`tool-gate.ts`）に集めるためで、S5 の D8（ツール状態の遅延生成）が来たときに
    // 直す先もそこ 1 つになる。末尾の `!timer` は `timer` を絞り込むために残してある。
    if (!room || !toolGate.canEnterVia("timer", cmd.code) || !timer) {
      // 失敗を記録（次回以降のレート判定に使う）。時刻は単調時計のほう（D8）。
      rateLimitGate.consume(connId, rateNow);
      sendError(connId, "ROOM_NOT_FOUND", "指定されたルームコードが見つかりません");
      return err("ROOM_NOT_FOUND");
    }

    // リジューム処理
    if (cmd.resumeToken) {
      const tokenData = tokenStore.getResume(cmd.resumeToken);
      if (tokenData && tokenData.roomCode === cmd.code) {
        const existingParticipant = findParticipant(room, tokenData.participantId);
        if (existingParticipant) {
          // **接続を足す。前の接続を奪わない**（#95 S4b・D14）。選択画面とツールを
          // 別タブで開く同一人物が現実的な経路になったため、1 本しか持てない模型だと
          // 後から繋いだタブが前のタブを黙らせる。
          const updatedRoom = attachConnection(
            room,
            tokenData.participantId,
            connId,
            TOOL_TIMER,
          );
          // 保管は `commit` に一本化してある（下の 1 行）。間の `sendTo` は connId 直送で
          // ストアを引かないので、ここで先に put する必要は無い。
          broadcaster.sendTo(connId, {
            type: "snapshot",
            room: buildTimerSnapshotRoom(updatedRoom, timer),
          });
          commit({ membership: updatedRoom, timer });
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

    // 名乗って参加した人は、その場で在室者の 1 人になる（#95 S3 で全員同格）。
    // ローテーション加入は別操作＝「ドライバーに加わる」であり、参加とは独立している。
    const participantId = codeGen.generateParticipantId();
    const resumeToken = codeGen.generateResumeToken();

    const newParticipant: MembershipParticipant = {
      id: participantId,
      displayName: cmd.displayName,
      connections: new Map([[connId, TOOL_TIMER]]),
      joinedAt: now,
    };

    const updatedRoom = addParticipant(room, newParticipant);
    // AI 鍵の有無は**名簿ではなく timer の状態**が持つ（#95 S4a）。
    // 「その人が誰か」ではなく「その人が timer で何をできるか」だからである。
    const updatedTimer = cmd.hasAiKey
      ? { ...timer, aiKeyHolders: [...timer.aiKeyHolders, participantId] }
      : timer;

    tokenStore.issueResume(resumeToken, { participantId, roomCode: cmd.code });

    broadcaster.sendTo(connId, {
      type: "room.joined",
      resumeToken,
      participantId,
    });

    broadcaster.sendTo(connId, {
      type: "snapshot",
      room: buildTimerSnapshotRoom(updatedRoom, updatedTimer),
    });

    commit({ membership: updatedRoom, timer: updatedTimer });

    return ok({ code: cmd.code, participantId, resumeToken });
  };
}
