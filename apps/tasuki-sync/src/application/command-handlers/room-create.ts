/**
 * `room.create` の専用ハンドラ（timer の入口）。
 *
 * **名簿の組み立ては `../create-room.ts` が持つ**（#95 S5a）。ここに残るのは
 * timer の wire で返すこと（`room.created` と snapshot の配信）と、
 * **timer の状態を作ること**（#95 S5b）である。ハブの入口（`../hub-handlers.ts`）も
 * 同じ `createRoom` を呼ぶが、ツールの状態は作らない（D8）。
 */

import { ok, err, type Result } from "neverthrow";
import type { SessionConfig, ErrorCode } from "@tasuki/timer-core";
import type { Clock } from "../../ports/clock.js";
import type { Broadcaster } from "../../ports/broadcaster.js";
import type { RoomStore } from "../../ports/room-store.js";
import type { TimerStore } from "../../ports/timer-store.js";
import type { RoomCodeGen } from "../../ports/code-gen.js";
import type { TokenStore } from "../token-store.js";
import type { RoomState } from "../apply-room-level-event.js";
import { TOOL_TIMER } from "../tool-id.js";
import { createRoom } from "../create-room.js";
import { createInitialTimerState } from "../initial-timer-state.js";
import { fillLobbyProblem } from "../lobby-problem.js";
import type { ProblemDelegator } from "../problem-delegation.js";

/** `room.create` が呼び出し元へ返す値。 */
export interface CreateResult {
  code: string;
  participantId: string;
  resumeToken: string;
}

export interface RoomCreateDeps {
  store: RoomStore;
  timers: TimerStore;
  clock: Clock;
  broadcaster: Broadcaster;
  /** 名簿と timer の状態を保管し、合成した snapshot を配信する（`handlers.ts`）。 */
  commit: (state: RoomState) => void;
  codeGen: RoomCodeGen;
  tokenStore: TokenStore;
  /** サーバー全体のルーム数上限（DoS 緩和）。 */
  maxRooms: number;
  /** ロビーのお題を用意する委譲（#271）。未構成なら依頼を起こさない。 */
  delegator?: ProblemDelegator | undefined;
  sendError: (connId: string, code: ErrorCode, message: string) => void;
}

export function createRoomCreateHandler(deps: RoomCreateDeps) {
  const { broadcaster, commit, delegator } = deps;

  /** ルーム作成 */
  return async function handleRoomCreate(
    connId: string,
    cmd: { command: "room.create"; displayName: string; config?: SessionConfig; roomName?: string },
  ): Promise<Result<CreateResult, ErrorCode>> {
    const created = createRoom(deps, {
      connId,
      displayName: cmd.displayName,
      ...(cmd.roomName !== undefined ? { roomName: cmd.roomName } : {}),
      // timer の入口から来た接続は、定義上 timer に居る（設計正本 D14 の S4b 追記）。
      tool: TOOL_TIMER,
    });

    if (created.isErr()) {
      deps.sendError(
        connId,
        created.error,
        "サーバーのルーム数が上限に達しています。時間をおいて再試行してください。",
      );
      return err(created.error);
    }

    const { code, participantId, resumeToken, membership, createdAt } = created.value;

    // **timer の状態はここで作る**（#95 S5b・D8）。遅延生成（`../join-room.ts`）と
    // 同じ 1 箇所を通す —— 初期状態は「輪に 1 席ある」という不変条件を含んでおり、
    // 写しを持つと片方だけが席を置かない形になりうる。
    const timer = createInitialTimerState({
      code,
      createdAt,
      participantId,
      ...(cmd.config !== undefined ? { config: cmd.config } : {}),
    });

    broadcaster.sendTo(connId, { type: "room.created", code, resumeToken, participantId });
    commit({ membership, timer });
    // **ロビーのお題はサーバーが用意する**（#271）。保管した後に呼ぶ ——
    // 委譲は保管を引いてお題を確定し、その場で snapshot を配信する。
    // 時刻は依頼 ID を一意にするために渡す（#273。`fillLobbyProblem` の注記）。
    fillLobbyProblem(delegator, timer, deps.clock.now());

    return ok({ code, participantId, resumeToken });
  };
}
