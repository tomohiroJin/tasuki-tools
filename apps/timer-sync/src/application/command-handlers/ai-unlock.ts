/**
 * `ai.unlock` の専用ハンドラ（フェーズ7・パイプライン統合）。
 *
 * 在室確認・アクター解決・権限判定（`rejectIfUnauthorized`）は共通パイプライン
 * （`handlers.ts` の `handleRoomCommand`）側で完了済みであり、その結果を
 * `ctx: { room, actor }` として受け取る。このハンドラはドメイン処理
 * （レート制限確認・合言葉照合・反映）のみを担う。
 *
 * ★`rateLimitGate` は `makeHandlers` が `room.join` と共有する単一インスタンスを
 * そのまま受け取る（`handlers.ts` の生成箇所のコメント参照。ここで新規生成しない）。
 * この共有はパイプライン統合後も変わらない（レート制限の呼び出し位置はドメイン処理側の
 * ままであり、共通パイプラインへは引き上げていない。理由: 合言葉照合の成否と
 * レート制限の記録が1つの分岐にまとまっているほうが「失敗のときだけ積算する」という
 * 意味を保ちやすいため）。
 */

import { ok, err, type Result } from "neverthrow";
import { errorMessageFor, type Room, type Participant, type ErrorCode } from "@tasuki/timer-core";
import type { Broadcaster } from "../../ports/broadcaster.js";
import type { RoomStore } from "../../ports/room-store.js";
import type { RateLimitGate } from "../rate-limit-gate.js";
import { constantTimeEqual } from "../secure-compare.js";

/** `handleRoomCommand` が事前に解決済みの在室ルームと実行者。 */
export interface AiUnlockContext {
  room: Room;
  actor: Participant;
}

export interface AiUnlockDeps {
  store: RoomStore;
  broadcaster: Broadcaster;
  /** room.join と共有する単一インスタンス（makeHandlers で1度だけ生成）。 */
  rateLimitGate: RateLimitGate;
  /** AI 解錠合言葉。undefined なら AI 機能は無効（解錠は常に失敗＝存在秘匿）。 */
  aiUnlockKey?: string | undefined;
  sendError: (connId: string, code: ErrorCode, message: string) => void;
}

export function createAiUnlockHandler(deps: AiUnlockDeps) {
  const { store, broadcaster, rateLimitGate, aiUnlockKey, sendError } = deps;

  /** AI お題生成を合言葉で解錠する（host 限定）。
   *  合言葉はサーバ env（AI_UNLOCK_KEY）のみに存在し、Room には aiUnlocked(boolean) だけ反映。
   *  未設定（機能無効）でも不一致と同じ AI_UNLOCK_FAILED を返し、機能の存在を秘匿する。
   *  失敗は join と同じレート制限バケツ（rateLimitGate・共有インスタンス）に積算する（総当たり対策）。 */
  return async function handleAiUnlock(
    connId: string,
    ctx: AiUnlockContext,
    cmd: { command: "ai.unlock"; key: string },
  ): Promise<Result<undefined, ErrorCode>> {
    const { room } = ctx;

    // 合言葉の照合より前に判定する（join と同じバケツを共有）。
    // rateNow は単調時計（設計正本 D8）。ルームの会計に使う clock.now()（壁時計）とは
    // 別系統であり、こちらへ壁時計を渡してはいけない。
    const rateNow = performance.now();
    if (rateLimitGate.shouldReject(connId, rateNow)) {
      sendError(connId, "RATE_LIMITED", errorMessageFor("RATE_LIMITED"));
      return err("RATE_LIMITED");
    }

    const provided = cmd.key.trim();
    const matched =
      aiUnlockKey !== undefined &&
      provided !== "" &&
      constantTimeEqual(provided, aiUnlockKey);
    if (!matched) {
      rateLimitGate.consume(connId, rateNow);
      sendError(connId, "AI_UNLOCK_FAILED", errorMessageFor("AI_UNLOCK_FAILED"));
      return err("AI_UNLOCK_FAILED");
    }

    const updatedRoom: Room = { ...room, aiUnlocked: true, problemMode: "ai" };
    store.put(updatedRoom);
    broadcaster.broadcastSnapshot(updatedRoom.code, updatedRoom);

    return ok(undefined);
  };
}
