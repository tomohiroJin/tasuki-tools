/**
 * `problem.request` の専用ハンドラ（フェーズ5・純粋な移動。ロジック変更なし）。
 *
 * `handlers.ts` の `makeHandlers` クロージャ内にあった `handleProblemRequest` を
 * そのまま移動した。`requireEditor`（在室確認・アクター解決・`rejectIfUnauthorized`
 * を束ねたヘルパ）は `handlers.ts` 側に残し、`deps` 経由で呼ぶ（`problem-submit.ts`
 * と共有するための判断。tasks.md T015 参照）。
 */

import { ok, err, type Result } from "neverthrow";
import { errorMessageFor, type Room, type Participant, type ErrorCode } from "@tdd-mob/core";
import type { ProblemDelegator } from "../problem-delegation.js";

export interface ProblemRequestDeps {
  delegator?: ProblemDelegator;
  requireEditor: (
    connId: string,
    command: string,
  ) => Result<{ room: Room; actor: Participant }, ErrorCode>;
  sendError: (connId: string, code: ErrorCode, message: string) => void;
}

export function createProblemRequestHandler(deps: ProblemRequestDeps) {
  const { delegator, requireEditor, sendError } = deps;

  /** お題生成依頼（editor+）FR-025, FR-027 */
  return async function handleProblemRequest(
    connId: string,
    cmd: { command: "problem.request"; requestId: string },
  ): Promise<Result<undefined, ErrorCode>> {
    const guard = requireEditor(connId, "problem.request");
    if (guard.isErr()) return err(guard.error);
    const { room } = guard.value;

    if (!delegator) {
      sendError(connId, "DELEGATION_UNAVAILABLE", errorMessageFor("DELEGATION_UNAVAILABLE"));
      return err("DELEGATION_UNAVAILABLE");
    }

    // リロール時は旧依頼をキャンセルしてから再委譲する（FR-027）
    delegator.request(room.code, cmd.requestId);

    return ok(undefined);
  };
}
