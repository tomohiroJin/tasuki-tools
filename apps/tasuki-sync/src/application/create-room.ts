/**
 * ルームを作る（#95 S5a）。**wire を知らない。**
 *
 * timer の入口（`command-handlers/room-create.ts`）とハブの入口（`hub-handlers.ts`）は、
 * **同じ出来事を別の言葉で返すだけ**である。判定と状態の組み立てをここに置き、
 * 返し方（timer の `room.created` か、ハブの `room.created` ＋ `roster` か）は
 * 各メッセージ層に残す。**写しを 2 つ持たない**（`docs/adr/0002` の二重正本の禁止）。
 *
 * ## ツールの状態は作らない（#95 S5b・D8）
 *
 * ここが作るのは**名簿だけ**である。timer の状態は timer の入口が
 * （`command-handlers/room-create.ts` が `initial-timer-state.ts` で）作り、poker の
 * ラウンドは poker の入口が作る。選択画面から作ったルームはどちらも持たずに生まれ、
 * **最初にそのツールへ入った人が作る**。
 *
 * S5a は逆の裁定（ハブの `room.create` が timer の状態も作る）を採っていた。当時は
 * 入口ごとの門があり、状態が無いと選択画面から timer へ入れなかったためである。
 * **S5b で門を廃止したので、その必要が消えた。**
 */
import { ok, err, type Result } from "neverthrow";
import type { ErrorCode } from "@tasuki/timer-core";
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
  /** その接続が宣言するツール。**ハブは null**（#95 S5a・D14）。 */
  tool: ToolId | null;
}

export interface CreatedRoom {
  code: string;
  participantId: string;
  resumeToken: string;
  membership: MembershipRoom;
  /**
   * 作成時刻（壁時計）。**ツールの状態を作る側が同じ値を使う**ため返す（#95 S5b）。
   * 呼び出し側で `clock.now()` を引き直すと、名簿とツールの状態で `createdAt` がずれる。
   */
  createdAt: number;
}

/**
 * ルームを作り、**名簿を**組み立てて返す。**保管も配信もしない。**
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

  // 作成者は「この接続でそのツールに居る」1 本だけを持つ（#95 S4b・D14）。
  // **ハブから作った人は `null`** —— 選択画面に居るので、timer の一覧には出ない。
  const creator: MembershipParticipant = {
    id: participantId,
    displayName: input.displayName,
    connections: new Map([[input.connId, input.tool]]),
    joinedAt: now,
  };

  const membership: MembershipRoom = { code, createdAt: now, participants: [creator] };

  tokenStore.issueResume(resumeToken, { participantId, roomCode: code });

  return ok({ code, participantId, resumeToken, membership, createdAt: now });
}
