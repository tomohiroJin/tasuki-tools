/**
 * ルームへ参加する（#95 S5a）。**wire を知らない。**
 *
 * timer の入口（`command-handlers/room-join.ts`）とハブの入口（`hub-handlers.ts`）で
 * **同じ守り**（レート制限・入口の門・合言葉・復帰）を通す。写しを 2 つ持つと片方だけが
 * 直り、**合言葉を知らない人が保護ルームの名簿を読める**という形の穴が開く
 * （S4a で実際に出た欠陥と同型。2026-09-13 の実測 4）。
 *
 * ## 返すのは結果だけで、保管も配信もしない
 *
 * 配信すべき相手が入口ごとに違う（timer は snapshot、ハブは roster）。
 * エラーの返し方も違う（timer は `ServerMsg`、ハブは `HubServerMsg`）ので、
 * ここは `Result` で返して呼び出し側に決めさせる。
 *
 * ## 時刻が 2 系統あることに注意
 *
 * ルームの会計（`joinedAt`）は壁時計、レート制限は単調時計（設計正本 D8）。
 * 取り違えると NTP のステップ調整でレート制限が飛ぶ。
 */
import { ok, err, type Result } from "neverthrow";
import type { ErrorCode, TimerState } from "@tasuki/timer-core";
import {
  addParticipant,
  attachConnection,
  findParticipant,
  type Participant as MembershipParticipant,
  type Room as MembershipRoom,
  type ToolId,
} from "@tasuki/room-core";
import type { Clock } from "../ports/clock.js";
import type { RoomStore } from "../ports/room-store.js";
import type { TimerStore } from "../ports/timer-store.js";
import type { RoomCodeGen } from "../ports/code-gen.js";
import type { TokenStore } from "./token-store.js";
import type { RateLimitGate } from "./rate-limit-gate.js";
import type { ToolGate } from "./tool-gate.js";
import { constantTimeEqual } from "./secure-compare.js";

export interface JoinRoomDeps {
  store: RoomStore;
  timers: TimerStore;
  clock: Clock;
  codeGen: RoomCodeGen;
  tokenStore: TokenStore;
  toolGate: ToolGate;
  rateLimitGate: RateLimitGate;
}

export interface JoinRoomInput {
  connId: string;
  code: string;
  displayName: string;
  /**
   * その接続が宣言するツール。**ハブは null**（#95 S5a・D14）。
   *
   * `null` のときは**入口の門を通さない** —— 門が見るのは「そのツールの状態があるか」で、
   * ハブはどのツールも要求しないからである。名簿にあるルームには入れる。
   */
  tool: ToolId | null;
  resumeToken?: string;
  passphrase?: string;
  /** timer 固有。AI 鍵を持って入ったか（ハブは持たない）。 */
  hasAiKey?: boolean;
}

export interface JoinRoomOutcome {
  /** `resumed` は復帰（同じ参加者に接続を足した）、`joined` は新しい参加者。 */
  kind: "resumed" | "joined";
  participantId: string;
  resumeToken: string;
  membership: MembershipRoom;
  /** そのルームの timer の状態（**poker だけのルームでは無い**）。 */
  timer: TimerState | undefined;
}

export function joinRoom(
  deps: JoinRoomDeps,
  input: JoinRoomInput,
): Result<JoinRoomOutcome, ErrorCode> {
  const { store, timers, clock, codeGen, tokenStore, toolGate, rateLimitGate } = deps;

  // ルームの会計（joinedAt）に使う壁時計。**レート制限には渡さない**（設計正本 D8）。
  const now = clock.now();
  // レート制限に渡す単調時計。壁時計とは別系統で、NTP のステップ調整・起動時の
  // 時計補正の影響を受けない。`now` と取り違えないこと。
  const rateNow = performance.now();

  // **ルームを照会する前に判定する。** 照会してから判定すると、残量が無いときに
  // ROOM_NOT_FOUND が返り、攻撃者はトークンを消費せずに存在確認を続けられる（設計正本 D3）。
  if (rateLimitGate.shouldReject(input.connId, rateNow)) return err("JOIN_RATE_LIMITED");

  const room = store.get(input.code);
  const timer = timers.get(input.code);

  // **入口の門**（`tool-gate.ts`・#95 S4a）。名簿は poker と 1 つの保管なので、
  // 「名簿にある」ことは「そのツールのルームである」ことを意味しない。そのツールの状態が
  // 無いルームは、**存在しないルームと完全に同じ応答**で拒む —— 区別できるとルームコード
  // 列挙の手がかりになる（ADR 0011）。
  //
  // **ハブ（`tool === null`）は門を通さない。** 選択画面はどのツールも要求せず、
  // 名簿そのものを見る場所だからである。
  const gateOpen = input.tool === null || toolGate.canEnterVia(input.tool, input.code);
  if (!room || !gateOpen) {
    // 失敗を記録（次回以降のレート判定に使う）。時刻は単調時計のほう（D8）。
    rateLimitGate.consume(input.connId, rateNow);
    return err("ROOM_NOT_FOUND");
  }

  // 復帰（同じ端末・同じルーム）。**接続を足す。前の接続を奪わない**（#95 S4b・D14）。
  if (input.resumeToken) {
    const tokenData = tokenStore.getResume(input.resumeToken);
    if (tokenData && tokenData.roomCode === input.code) {
      const existing = findParticipant(room, tokenData.participantId);
      if (existing) {
        return ok({
          kind: "resumed",
          participantId: tokenData.participantId,
          resumeToken: input.resumeToken,
          membership: attachConnection(room, tokenData.participantId, input.connId, input.tool),
          timer,
        });
      }
    }
  }

  // パスフレーズ保護ルームは新規参加時に一致を要求する（R4-2）。
  // 復帰は上で return 済みのためここには来ない＝再認証不要。
  //
  // **ハブもここを通る**（#95 S5a）。通さないと、合言葉を知らない人が選択画面から
  // 保護ルームの名簿を読めてしまう。
  const required = tokenStore.getPassphrase(input.code);
  // 保持側と同じく前後空白を正規化して比較する。
  const provided = (input.passphrase ?? "").trim();
  // 秘密の照合は定数時間で行う（ADR 0012・管理トークン／AI 解錠と同じ規律）。
  if (required !== undefined && !constantTimeEqual(provided, required)) {
    // 失敗をレート制限に積算（総当たりの緩和・既存 join 制限と統合）。
    rateLimitGate.consume(input.connId, rateNow);
    return err(provided ? "PASSPHRASE_MISMATCH" : "PASSPHRASE_REQUIRED");
  }

  // 名乗って参加した人は、その場で在室者の 1 人になる（#95 S3 で全員同格）。
  // ローテーション加入は別操作＝「ドライバーに加わる」であり、参加とは独立している。
  const participantId = codeGen.generateParticipantId();
  const resumeToken = codeGen.generateResumeToken();

  const newParticipant: MembershipParticipant = {
    id: participantId,
    displayName: input.displayName,
    connections: new Map([[input.connId, input.tool]]),
    joinedAt: now,
  };

  // AI 鍵の有無は**名簿ではなく timer の状態**が持つ（#95 S4a）。
  // 「その人が誰か」ではなく「その人が timer で何をできるか」だからである。
  const updatedTimer =
    input.hasAiKey === true && timer !== undefined
      ? { ...timer, aiKeyHolders: [...timer.aiKeyHolders, participantId] }
      : timer;

  tokenStore.issueResume(resumeToken, { participantId, roomCode: input.code });

  return ok({
    kind: "joined",
    participantId,
    resumeToken,
    membership: addParticipant(room, newParticipant),
    timer: updatedTimer,
  });
}
