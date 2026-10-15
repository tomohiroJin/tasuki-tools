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
import type { WallClock } from "../ports/wall-clock.js";
import type { RoomStore } from "../ports/room-store.js";
import type { RoomCodeGen } from "../ports/code-gen.js";
import type { TokenStore } from "./token-store.js";

export interface CreateRoomDeps {
  store: RoomStore;
  clock: WallClock;
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

  const code = pickFreeCode(store, codeGen, input.roomName);
  // **事後条件: 返すコードは空いている**（#375）。引き直しの上限まで使用中のコードしか
  // 出なければ作らない。最後のコードで先へ進むと、呼び出し側の保管が既にあるルーム
  // （参加者・トークン・状態）を上書きする。新しいコードを足さず「いまは作れない」の
  // ROOM_LIMIT_EXCEEDED で断る（画面は既定の文言を出す）。
  if (code === undefined) return err("ROOM_LIMIT_EXCEEDED");

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

/**
 * コードを引く回数の上限（最初の 1 回を含む）。
 *
 * 接尾辞は 8 桁（32 種）・ランダムのコードは 6 桁（31 種）で、ルーム数の上限
 * （`maxRooms`）の下では 1 回ぶつかることさえまず起きない。上限は「起きないはずの
 * ことが起きたとき（codeGen の故障など）に止まる」ためのもので、poker の
 * `generateRoomId` も同じ回数で打ち切る。
 */
export const MAX_CODE_ATTEMPTS = 6;

/**
 * 空いているコードを引く。上限まで引いても空かなければ `undefined`。
 *
 * ルーム名があれば「slug-接尾辞」、無ければランダム。衝突時は接尾辞を引き直す。
 */
function pickFreeCode(
  store: RoomStore,
  codeGen: RoomCodeGen,
  roomName: string | undefined,
): string | undefined {
  for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
    const code = codeGen.generate(roomName);
    if (store.get(code) === undefined) return code;
  }
  return undefined;
}
