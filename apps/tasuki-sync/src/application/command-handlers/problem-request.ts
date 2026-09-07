/**
 * `problem.request` の専用ハンドラ（フェーズ7・パイプライン統合）。
 *
 * 在室確認・アクター解決・権限判定（旧 `requireEditor`）は共通パイプライン
 * （`handlers.ts` の `handleRoomCommand`）側で完了済みであり、その結果を
 * `ctx: { room, actor }` として受け取る。このハンドラはドメイン処理
 * （delegator 呼び出し）のみを担う（FR-156: 権限判定の呼び出し箇所を1箇所に集約）。
 */

import { ok, err, type Result } from "neverthrow";
import { errorMessageFor, type Room, type Participant, type ErrorCode } from "@tasuki/timer-core";
import type { ProblemDelegator } from "../problem-delegation.js";

/** `handleRoomCommand` が事前に解決済みの在室ルームと実行者。 */
export interface ProblemRequestContext {
  room: Room;
  actor: Participant;
}

export interface ProblemRequestDeps {
  delegator?: ProblemDelegator | undefined;
  sendError: (connId: string, code: ErrorCode, message: string) => void;
}

export function createProblemRequestHandler(deps: ProblemRequestDeps) {
  const { delegator, sendError } = deps;

  /** お題生成依頼（editor+）FR-025, FR-027 */
  return async function handleProblemRequest(
    connId: string,
    ctx: ProblemRequestContext,
    cmd: { command: "problem.request"; requestId: string },
  ): Promise<Result<undefined, ErrorCode>> {
    const { room } = ctx;

    if (!delegator) {
      sendError(connId, "DELEGATION_UNAVAILABLE", errorMessageFor("DELEGATION_UNAVAILABLE"));
      return err("DELEGATION_UNAVAILABLE");
    }

    // リロール時は旧依頼をキャンセルしてから再委譲する（FR-027）
    delegator.request(room.code, cmd.requestId);

    return ok(undefined);
  };
}
