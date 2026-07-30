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
  type Room,
  type Participant,
  type SessionConfig,
  type IntervalMinutes,
  type ErrorCode,
} from "@tdd-mob/core";
import type { Clock } from "../../ports/clock.js";
import type { Broadcaster } from "../../ports/broadcaster.js";
import type { RoomStore } from "../../ports/room-store.js";
import type { RoomCodeGen } from "../../ports/code-gen.js";
import type { TokenStore } from "../token-store.js";

/** `room.create` が呼び出し元へ返す値。ホストトークンは作成者だけが受け取る。 */
export interface CreateResult {
  code: string;
  participantId: string;
  hostToken: string;
  resumeToken: string;
}

export interface RoomCreateDeps {
  store: RoomStore;
  clock: Clock;
  broadcaster: Broadcaster;
  codeGen: RoomCodeGen;
  tokenStore: TokenStore;
  /** サーバー全体のルーム数上限（DoS 緩和）。 */
  maxRooms: number;
  sendError: (connId: string, code: ErrorCode, message: string) => void;
}

export function createRoomCreateHandler(deps: RoomCreateDeps) {
  const { store, clock, broadcaster, codeGen, tokenStore, maxRooms, sendError } = deps;

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
    const hostToken = codeGen.generateResumeToken();

    const defaultConfig: SessionConfig = cmd.config ?? {
      language: "TypeScript",
      difficulty: "easy",
      members: [cmd.displayName],
      intervalMinutes: 5 as IntervalMinutes,
    };

    // rotation は参加者IDの配列（D6b）。作成時点の在室者は作成者ただ一人なので、
    // config.members に何が入っていても輪に並べられるのは作成者だけである。
    const agg = initialAggregate(defaultConfig, [participantId]);

    const host: Participant = {
      participantId,
      connId,
      displayName: cmd.displayName,
      role: "host",
      presence: "online",
      hasAiKey: false,
      joinedAt: now,
    };

    const room: Room = {
      code,
      createdAt: now,
      hostParticipantId: participantId,
      // config.members は rotation の表示名ミラー（D6b）。作成者以外は輪に並べないので、
      // クライアントが渡した members に他人が含まれていてもここで作成者だけに揃える。
      config: { ...defaultConfig, members: [cmd.displayName] },
      problem: null,
      session: agg.session,
      clock: agg.clock,
      phase: "setup",
      participants: [host],
      sessionRecords: [],
      handoffNote: "",
      onBreak: false,
    };

    store.put(room);
    tokenStore.issueHost(code, hostToken);
    tokenStore.issueResume(resumeToken, { participantId, roomCode: code });

    broadcaster.sendTo(connId, {
      type: "room.created",
      code,
      hostToken,
      resumeToken,
      participantId,
    });

    broadcaster.broadcastSnapshot(code, room);

    return ok({ code, participantId, hostToken, resumeToken });
  };
}
