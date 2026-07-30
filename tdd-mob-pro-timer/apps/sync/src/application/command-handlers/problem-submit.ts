/**
 * `problem.submit` の専用ハンドラ（フェーズ5・純粋な移動。ロジック変更なし）。
 *
 * `handlers.ts` の `makeHandlers` クロージャ内にあった `handleProblemSubmit` を
 * そのまま移動した。`requireEditor` は `handlers.ts` 側に残し `deps` 経由で呼ぶ
 * （`problem-request.ts` と共有するための判断。tasks.md T015 参照）。
 */

import { ok, err, type Result } from "neverthrow";
import {
  errorMessageFor,
  type Room,
  type Participant,
  type Problem,
  type ErrorCode,
} from "@tdd-mob/core";
import type { ProblemDelegator } from "../problem-delegation.js";

export interface ProblemSubmitDeps {
  delegator?: ProblemDelegator;
  requireEditor: (
    connId: string,
    command: string,
  ) => Result<{ room: Room; actor: Participant }, ErrorCode>;
  sendError: (connId: string, code: ErrorCode, message: string) => void;
}

export function createProblemSubmitHandler(deps: ProblemSubmitDeps) {
  const { delegator, requireEditor, sendError } = deps;

  /** お題投入（委譲代表のみ・editor+）FR-025, FR-026 */
  return async function handleProblemSubmit(
    connId: string,
    cmd: {
      command: "problem.submit";
      requestId: string;
      problem: Problem;
      usedFallback: boolean;
    },
  ): Promise<Result<undefined, ErrorCode>> {
    const guard = requireEditor(connId, "problem.submit");
    if (guard.isErr()) return err(guard.error);
    const { room, actor } = guard.value;

    if (!delegator) {
      sendError(connId, "DELEGATION_UNAVAILABLE", errorMessageFor("DELEGATION_UNAVAILABLE"));
      return err("DELEGATION_UNAVAILABLE");
    }

    const accepted = delegator.submit(
      room.code,
      cmd.requestId,
      actor.participantId,
      cmd.problem,
      cmd.usedFallback,
    );
    if (!accepted) {
      sendError(connId, "STALE_SUBMISSION", "この投入は受理されませんでした（期限切れ・権限外）");
      return err("STALE_SUBMISSION");
    }

    return ok(undefined);
  };
}
