/**
 * `room.create` の専用ハンドラ（フェーズ5・純粋な移動。ロジック変更なし）。
 *
 * `handlers.ts` の `makeHandlers` クロージャ内にあった `handleRoomCreate` を
 * そのまま移動し、参照していたクロージャ変数（`store`/`clock`/`broadcaster`/
 * `codeGen`/`tokenStore`/`maxRooms`/`sendError`）を `deps` 引数として明示化した。
 * `makeHandlers` はこのファイルの `createRoomCreateHandler(deps)` を1度呼び出し、
 * 返ってきた関数をそのまま `handleCommand` の switch から呼ぶ。
 */

import { ok, err, type Result } from "neverthrow";
import {
  initialAggregate,
  type RotationEntry,
  type SessionConfig,
  type TimerConfig,
  type TimerState,
  type IntervalMinutes,
  type ErrorCode,
} from "@tasuki/timer-core";
import type { Participant as MembershipParticipant, Room as MembershipRoom } from "@tasuki/room-core";
import type { Clock } from "../../ports/clock.js";
import type { Broadcaster } from "../../ports/broadcaster.js";
import type { RoomStore } from "../../ports/room-store.js";
import type { TimerStore } from "../../ports/timer-store.js";
import type { RoomCodeGen } from "../../ports/code-gen.js";
import type { TokenStore } from "../token-store.js";
import type { RoomState } from "../apply-room-level-event.js";

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
  sendError: (connId: string, code: ErrorCode, message: string) => void;
}

export function createRoomCreateHandler(deps: RoomCreateDeps) {
  const { store, clock, broadcaster, commit, codeGen, tokenStore, maxRooms, sendError } = deps;

  /** ルーム作成 */
  return async function handleRoomCreate(
    connId: string,
    cmd: { command: "room.create"; displayName: string; config?: SessionConfig; roomName?: string },
  ): Promise<Result<CreateResult, ErrorCode>> {
    const now = clock.now();
    // ルーム数上限（DoS 緩和）。上限到達時は作成を拒否する。
    if (store.list().length >= maxRooms) {
      sendError(connId, "ROOM_LIMIT_EXCEEDED", "サーバーのルーム数が上限に達しています。時間をおいて再試行してください。");
      return err("ROOM_LIMIT_EXCEEDED");
    }
    // ルーム名があれば「slug-接尾辞」、無ければランダム。衝突時は接尾辞を引き直す。
    let code = codeGen.generate(cmd.roomName);
    for (let i = 0; i < 5 && store.get(code) !== undefined; i++) {
      code = codeGen.generate(cmd.roomName);
    }
    const participantId = codeGen.generateParticipantId();
    const resumeToken = codeGen.generateResumeToken();

    // クライアントが渡すのは wire の設定（`members` を含む）。**名簿はここから作らない**
    // （#95 S4a・D15）。輪に並べられるのは作成時点の在室者＝作成者ただ一人なので、
    // `members` に他人が含まれていても無視して落とす。
    const wireConfig: SessionConfig = cmd.config ?? {
      language: "TypeScript",
      difficulty: "easy",
      members: [cmd.displayName],
      intervalMinutes: 5 as IntervalMinutes,
    };
    const { members: _ignoredMembers, ...timerConfig } = wireConfig;
    const config: TimerConfig = timerConfig;

    const seat: RotationEntry = { kind: "member", participantId, eligible: true };
    const agg = initialAggregate(config, [seat]);

    const creator: MembershipParticipant = {
      id: participantId,
      connId,
      displayName: cmd.displayName,
      presence: "online",
      joinedAt: now,
    };

    const membership: MembershipRoom = {
      code,
      createdAt: now,
      participants: [creator],
    };

    const timer: TimerState = {
      code,
      createdAt: now,
      config,
      problem: null,
      session: agg.session,
      clock: agg.clock,
      phase: "setup",
      sessionRecords: [],
      handoffNote: "",
      onBreak: false,
      aiKeyHolders: [],
    };

    tokenStore.issueResume(resumeToken, { participantId, roomCode: code });

    broadcaster.sendTo(connId, {
      type: "room.created",
      code,
      resumeToken,
      participantId,
    });

    commit({ membership, timer });

    return ok({ code, participantId, resumeToken });
  };
}
