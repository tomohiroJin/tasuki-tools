/**
 * ルームを作る（#95 S5a）。**wire を知らない。**
 *
 * timer の入口（`command-handlers/room-create.ts`）とハブの入口（`hub-handlers.ts`）は、
 * **同じ出来事を別の言葉で返すだけ**である。判定と状態の組み立てをここに置き、
 * 返し方（timer の `room.created` か、ハブの `room.created` ＋ `roster` か）は
 * 各メッセージ層に残す。**写しを 2 つ持たない**（`docs/adr/0002` の二重正本の禁止）。
 *
 * ## ハブで作ったルームにも timer の状態を作る（2026-09-13 の裁定）
 *
 * 入口の門（`tool-gate.ts`）は「そのツールの状態があるルームにだけ入れる」ので、
 * timer の状態を作らないと選択画面から timer へ入れない。**poker のラウンドは作らない** ——
 * ハブから作ったルームで poker を選べるようにするのは S5b（#248）の仕事で、
 * そこで D8 のツール状態の遅延生成に置き換わる。
 */
import { ok, err, type Result } from "neverthrow";
import {
  initialAggregate,
  type ErrorCode,
  type IntervalMinutes,
  type RotationEntry,
  type SessionConfig,
  type TimerConfig,
  type TimerState,
} from "@tasuki/timer-core";
import type {
  Participant as MembershipParticipant,
  Room as MembershipRoom,
  ToolId,
} from "@tasuki/room-core";
import type { Clock } from "../ports/clock.js";
import type { RoomStore } from "../ports/room-store.js";
import type { RoomCodeGen } from "../ports/code-gen.js";
import type { TokenStore } from "./token-store.js";

export interface CreateRoomDeps {
  store: RoomStore;
  clock: Clock;
  codeGen: RoomCodeGen;
  tokenStore: TokenStore;
  /** サーバー全体のルーム数上限（DoS 緩和）。 */
  maxRooms: number;
}

export interface CreateRoomInput {
  connId: string;
  displayName: string;
  roomName?: string;
  /** timer の入口から来た設定（wire の形）。ハブは持たない。 */
  config?: SessionConfig;
  /** その接続が宣言するツール。**ハブは null**（#95 S5a・D14）。 */
  tool: ToolId | null;
}

export interface CreatedRoom {
  code: string;
  participantId: string;
  resumeToken: string;
  membership: MembershipRoom;
  timer: TimerState;
}

/**
 * ルームを作り、名簿と timer の状態を組み立てて返す。**保管も配信もしない。**
 *
 * 呼び出し側が保管（`commit` / `saveRoster`）まで行うのは、配信すべき相手が
 * 入口ごとに違うためである（timer は snapshot、ハブは roster）。
 */
export function createRoom(
  deps: CreateRoomDeps,
  input: CreateRoomInput,
): Result<CreatedRoom, ErrorCode> {
  const { store, clock, codeGen, tokenStore, maxRooms } = deps;
  const now = clock.now();

  // ルーム数上限（DoS 緩和）。上限到達時は作成を拒否する。
  if (store.list().length >= maxRooms) return err("ROOM_LIMIT_EXCEEDED");

  // ルーム名があれば「slug-接尾辞」、無ければランダム。衝突時は接尾辞を引き直す。
  let code = codeGen.generate(input.roomName);
  for (let i = 0; i < 5 && store.get(code) !== undefined; i++) {
    code = codeGen.generate(input.roomName);
  }

  const participantId = codeGen.generateParticipantId();
  const resumeToken = codeGen.generateResumeToken();

  // クライアントが渡すのは wire の設定（`members` を含む）。**名簿はここから作らない**
  // （#95 S4a・D15）。輪に並べられるのは作成時点の在室者＝作成者ただ一人なので、
  // `members` に他人が含まれていても無視して落とす。
  const wireConfig: SessionConfig = input.config ?? {
    language: "TypeScript",
    difficulty: "easy",
    members: [input.displayName],
    intervalMinutes: 5 as IntervalMinutes,
  };
  const { members: _ignoredMembers, ...timerConfig } = wireConfig;
  const config: TimerConfig = timerConfig;

  const seat: RotationEntry = { kind: "member", participantId, eligible: true };
  const agg = initialAggregate(config, [seat]);

  // 作成者は「この接続でそのツールに居る」1 本だけを持つ（#95 S4b・D14）。
  // **ハブから作った人は `null`** —— 選択画面に居るので、timer の一覧には出ない。
  const creator: MembershipParticipant = {
    id: participantId,
    displayName: input.displayName,
    connections: new Map([[input.connId, input.tool]]),
    joinedAt: now,
  };

  const membership: MembershipRoom = { code, createdAt: now, participants: [creator] };

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

  return ok({ code, participantId, resumeToken, membership, timer });
}
