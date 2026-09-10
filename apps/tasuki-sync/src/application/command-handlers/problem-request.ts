/**
 * `problem.request` の専用ハンドラ（フェーズ7・パイプライン統合）。
 *
 * 在室確認とアクター解決は共通パイプライン
 * （`handlers.ts` の `handleRoomCommand`）側で完了済みであり、その結果を
 * `ctx: { room, actor }` として受け取る。このハンドラはドメイン処理
 * （delegator 呼び出し）のみを担う。可否判定は #95 S3 で概念ごと消えた。
 */

import { ok, err, type Result } from "neverthrow";
import { errorMessageFor, type ErrorCode } from "@tasuki/timer-core";
import type { Participant as MembershipParticipant } from "@tasuki/room-core";
import type { ProblemDelegator } from "../problem-delegation.js";
import type { RoomState } from "../apply-room-level-event.js";

/** `handleRoomCommand` が事前に解決済みの在室ルームと実行者。 */
export interface ProblemRequestContext {
  state: RoomState;
  actor: MembershipParticipant;
}

export interface ProblemRequestDeps {
  delegator?: ProblemDelegator | undefined;
  sendError: (connId: string, code: ErrorCode, message: string) => void;
}

export function createProblemRequestHandler(deps: ProblemRequestDeps) {
  const { delegator, sendError } = deps;

  /** お題生成依頼（在室者なら誰でも実行できる）FR-025, FR-027 */
  return async function handleProblemRequest(
    connId: string,
    ctx: ProblemRequestContext,
    cmd: { command: "problem.request"; requestId: string },
  ): Promise<Result<undefined, ErrorCode>> {
    const { timer } = ctx.state;

    if (!delegator) {
      sendError(connId, "DELEGATION_UNAVAILABLE", errorMessageFor("DELEGATION_UNAVAILABLE"));
      return err("DELEGATION_UNAVAILABLE");
    }

    // リロール時は旧依頼をキャンセルしてから再委譲する（FR-027）
    delegator.request(timer.code, cmd.requestId);

    return ok(undefined);
  };
}
