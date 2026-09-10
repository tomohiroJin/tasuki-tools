/**
 * `problem.submit` の専用ハンドラ（フェーズ7・パイプライン統合）。
 *
 * 在室確認とアクター解決は共通パイプライン
 * （`handlers.ts` の `handleRoomCommand`）側で完了済みであり、その結果を
 * `ctx: { room, actor }` として受け取る。このハンドラはドメイン処理
 * （delegator 呼び出し）のみを担う。可否判定は #95 S3 で概念ごと消えた。
 */

import { ok, err, type Result } from "neverthrow";
import {
  errorMessageFor,
  type Problem,
  type ErrorCode,
} from "@tasuki/timer-core";
import type { Participant as MembershipParticipant } from "@tasuki/room-core";
import type { ProblemDelegator } from "../problem-delegation.js";
import type { RoomState } from "../apply-room-level-event.js";

/** `handleRoomCommand` が事前に解決済みの在室ルームと実行者。 */
export interface ProblemSubmitContext {
  state: RoomState;
  actor: MembershipParticipant;
}

export interface ProblemSubmitDeps {
  delegator?: ProblemDelegator | undefined;
  sendError: (connId: string, code: ErrorCode, message: string) => void;
}

export function createProblemSubmitHandler(deps: ProblemSubmitDeps) {
  const { delegator, sendError } = deps;

  /** お題投入（委譲が指名した代表のみ受理する。役割による制限は無い）FR-025, FR-026 */
  return async function handleProblemSubmit(
    connId: string,
    ctx: ProblemSubmitContext,
    cmd: {
      command: "problem.submit";
      requestId: string;
      problem: Problem;
      usedFallback: boolean;
    },
  ): Promise<Result<undefined, ErrorCode>> {
    const { timer } = ctx.state;
    const { actor } = ctx;

    if (!delegator) {
      sendError(connId, "DELEGATION_UNAVAILABLE", errorMessageFor("DELEGATION_UNAVAILABLE"));
      return err("DELEGATION_UNAVAILABLE");
    }

    const accepted = delegator.submit(
      timer.code,
      cmd.requestId,
      actor.id,
      cmd.problem,
      cmd.usedFallback,
    );
    if (!accepted) {
      sendError(connId, "STALE_SUBMISSION", "この投入は受理されませんでした（期限切れ・代表ではない）");
      return err("STALE_SUBMISSION");
    }

    return ok(undefined);
  };
}
