/**
 * `room.join` の専用ハンドラ（timer の入口）。
 *
 * **守り（レート制限・合言葉の関門・復帰）と名簿の更新は `../join-room.ts` が持つ**
 * （#95 S5a）。ここに残るのは timer の wire で返すこと —— 復帰なら snapshot、
 * 新規なら `room.joined` ＋ snapshot —— だけである。ハブの入口（`../hub-handlers.ts`）も
 * 同じ `joinRoom` を呼び、返し方だけが違う。**写しを 2 つ持たない** ——
 * 片方だけが直ると、合言葉を知らない人が保護ルームの名簿を読める形の穴が開く。
 */

import { ok, err, type Result } from "neverthrow";
import { errorMessageFor, type ErrorCode } from "@tasuki/timer-core";
import type { Clock } from "../../ports/clock.js";
import type { Broadcaster } from "../../ports/broadcaster.js";
import type { RoomStore } from "../../ports/room-store.js";
import type { TimerStore } from "../../ports/timer-store.js";
import type { RoomCodeGen } from "../../ports/code-gen.js";
import type { TokenStore } from "../token-store.js";
import type { RateLimitGate } from "../rate-limit-gate.js";
import { buildTimerSnapshotRoom } from "../timer-snapshot-dto.js";
import type { RoomState } from "../apply-room-level-event.js";
import { TOOL_TIMER } from "../tool-id.js";
import { joinRoom, ROOM_NOT_FOUND_MESSAGE } from "../join-room.js";
import { fillLobbyProblem } from "../lobby-problem.js";
import type { ProblemDelegator } from "../problem-delegation.js";
import type { TopicBroadcaster } from "../topic-broadcast.js";

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
  /** room.join と ai.unlock が共有するバケツの上に立つゲート（`handlers.ts` が組む）。 */
  rateLimitGate: RateLimitGate;
  /** ロビーのお題を用意する委譲（#271）。未構成なら依頼を起こさない。 */
  delegator?: ProblemDelegator | undefined;
  sendError: (connId: string, code: ErrorCode, message: string) => void;
  /**
   * いまのお題を参加・復帰した本人へ 1 通送る（#91・E4）。
   *
   * **必須にしてある**（理由は {@link HandlerDeps.tokens} と同じ）。既定を持たせると、
   * 注入を忘れた瞬間に timer で入った人にだけお題が出なくなり、しかもハブと
   * お題ツールでは正しく出るので誰も気づかない。
   */
  topicBroadcaster: Pick<TopicBroadcaster, "sendCurrent">;
}

export function createRoomJoinHandler(deps: RoomJoinDeps) {
  const { broadcaster, commit, sendError, delegator } = deps;

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
    const joined = joinRoom(deps, {
      connId,
      code: cmd.code,
      displayName: cmd.displayName,
      hasAiKey: cmd.hasAiKey,
      // timer の入口から来た接続は、定義上 timer に居る（設計正本 D14 の S4b 追記）。
      tool: TOOL_TIMER,
      ...(cmd.resumeToken !== undefined ? { resumeToken: cmd.resumeToken } : {}),
      ...(cmd.passphrase !== undefined ? { passphrase: cmd.passphrase } : {}),
    });

    if (joined.isErr()) {
      const code = joined.error;
      // **ROOM_NOT_FOUND の文言は「存在しないルーム」と完全に同一にする**（ADR 0011）。
      // 合言葉の関門で拒んだことを区別できると、ルームコード列挙の手がかりになる。
      const message = code === "ROOM_NOT_FOUND" ? ROOM_NOT_FOUND_MESSAGE : errorMessageFor(code);
      sendError(connId, code, message);
      return err(code);
    }

    const { kind, participantId, resumeToken, membership, timer } = joined.value;

    // timer の入口から入った以上、timer の状態は必ずある（無ければ `joinRoom` が
    // その場で作る・#95 S5b の遅延生成）。**それでも undefined を握りつぶさない** ——
    // 遅延生成の条件が変わったときに、ここが静かに壊れた snapshot を配るのを避ける。
    if (timer === undefined) {
      sendError(connId, "ROOM_NOT_FOUND", ROOM_NOT_FOUND_MESSAGE);
      return err("ROOM_NOT_FOUND");
    }

    // 新規参加のときだけ復帰の組を返す（復帰では既に持っている）。
    if (kind === "joined") {
      broadcaster.sendTo(connId, { type: "room.joined", resumeToken, participantId });
    }

    // 保管は `commit` に一本化してある（下の 1 行）。間の `sendTo` は connId 直送で
    // ストアを引かないので、ここで先に put する必要は無い。
    broadcaster.sendTo(connId, {
      type: "snapshot",
      room: buildTimerSnapshotRoom(membership, timer),
    });

    commit({ membership, timer });
    // お題の状態を 1 通送る（#91・E4）。**名簿の保管のあとに呼ぶ**
    // （ルームの在否を名簿で見るため・ハブと同じ）。
    deps.topicBroadcaster.sendCurrent(connId, cmd.code);
    // **ロビーのお題はサーバーが用意する**（#271）。遅延生成で timer の状態が
    // 生まれた直後がここなので、未確定ならこの場で依頼を起こす。既にお題があるか、
    // 委譲が走っていれば何もしない（参加のたびに張り直さない）。
    // 時刻は依頼 ID を一意にするために渡す（#273。`fillLobbyProblem` の注記）。
    fillLobbyProblem(delegator, timer, deps.clock.now());

    return ok({ code: cmd.code, participantId, resumeToken });
  };
}
