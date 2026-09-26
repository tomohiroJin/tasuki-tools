/**
 * ルームへ参加する（#95 S5a）。**wire を知らない。**
 *
 * timer の入口（`command-handlers/room-join.ts`）とハブの入口（`hub-handlers.ts`）で
 * **同じ守り**（レート制限・合言葉・復帰）を通す。写しを 2 つ持つと片方だけが直り、
 * **合言葉を知らない人が保護ルームの名簿を読める**という形の穴が開く
 * （S4a で実際に出た欠陥と同型。2026-09-13 の実測 4）。
 *
 * ## 入口の門は S5b で廃止した
 *
 * S4a〜S5a は「そのツールの状態があるルームにだけ入れる」門（`tool-gate.ts`）を通していた。
 * **S5b でツール状態を遅延生成にした**（D8）ので、状態の有無は参加の可否を意味しなくなった。
 * 越境を止めるのは合言葉の関門（`room-entry.ts`）で、poker の入口もそれを通る。
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
import { createInitialTimerState } from "./initial-timer-state.js";
import { checkPassphrase, findResumableParticipant } from "./room-entry.js";
import { TOOL_TIMER } from "./tool-id.js";

/**
 * 「そのルームは無い」と返すときの文言。**入口をまたいで 1 つにする。**
 *
 * 合言葉の関門で拒んだ場合も、本当に存在しない場合も、**コード・文言・レート制限の積算まで
 * 完全に同じ**にする（`docs/adr/0011`）。区別できるとルームコード列挙の手がかりになる。
 * 文言を入口ごとに書くと、片方だけ言い回しが変わった瞬間にその区別が生まれる。
 */
export const ROOM_NOT_FOUND_MESSAGE = "指定されたルームコードが見つかりません";

export interface JoinRoomDeps {
  store: RoomStore;
  timers: TimerStore;
  clock: Clock;
  codeGen: RoomCodeGen;
  tokenStore: TokenStore;
  rateLimitGate: RateLimitGate;
}

export interface JoinRoomInput {
  connId: string;
  code: string;
  displayName: string;
  /**
   * その接続が宣言するツール。**ハブは null**（#95 S5a・D14）。
   *
   * `TOOL_TIMER` のときだけ、timer の状態が無ければ**その場で作る**（#95 S5b・D8）。
   * ハブ（`null`）は選択画面に居るだけなのでどのツールの状態も作らない。
   */
  tool: ToolId | null;
  resumeToken?: string;
  passphrase?: string;
}

export interface JoinRoomOutcome {
  /** `resumed` は復帰（同じ参加者に接続を足した）、`joined` は新しい参加者。 */
  kind: "resumed" | "joined";
  participantId: string;
  resumeToken: string;
  membership: MembershipRoom;
  /**
   * そのルームの timer の状態。
   *
   * **timer の入口から入ったなら必ずある**（無ければ遅延生成する・#95 S5b）。
   * ハブと poker の入口では、まだ誰も timer へ入っていないルームで `undefined` になる。
   */
  timer: TimerState | undefined;
}

export function joinRoom(
  deps: JoinRoomDeps,
  input: JoinRoomInput,
): Result<JoinRoomOutcome, ErrorCode> {
  const { store, timers, clock, codeGen, tokenStore, rateLimitGate } = deps;

  // ルームの会計（joinedAt）に使う壁時計。**レート制限には渡さない**（設計正本 D8）。
  const now = clock.now();
  // レート制限に渡す単調時計。壁時計とは別系統で、NTP のステップ調整・起動時の
  // 時計補正の影響を受けない。`now` と取り違えないこと。
  const rateNow = performance.now();

  // **ルームを照会する前に判定する。** 照会してから判定すると、残量が無いときに
  // ROOM_NOT_FOUND が返り、攻撃者はトークンを消費せずに存在確認を続けられる（設計正本 D3）。
  if (rateLimitGate.shouldReject(input.connId, rateNow)) return err("JOIN_RATE_LIMITED");

  const room = store.get(input.code);
  if (!room) {
    // 失敗を記録（次回以降のレート判定に使う）。時刻は単調時計のほう（D8）。
    rateLimitGate.consume(input.connId, rateNow);
    return err("ROOM_NOT_FOUND");
  }

  const existingTimer = timers.get(input.code);

  /**
   * この参加で返す timer の状態。**timer の入口なら無ければ作る**（#95 S5b・D8）。
   *
   * S4a〜S5a はここに入口ごとの門（`tool-gate.ts`）があり、状態が無いルームを
   * 「存在しないルーム」として拒んでいた。**入口が選択画面へ一本化される以上、
   * 拒むのではなく作るのが正しい。** 越境を止めるのは下の合言葉の関門である。
   */
  const timerFor = (participantId: string): TimerState | undefined =>
    input.tool === TOOL_TIMER && existingTimer === undefined
      ? createInitialTimerState({ code: input.code, createdAt: now, participantId })
      : existingTimer;

  // 復帰（同じ端末・同じルーム）。**接続を足す。前の接続を奪わない**（#95 S4b・D14）。
  // 判定は `room-entry.ts` が持つ（poker の入口と同じものを通す）。
  const resumed = findResumableParticipant(tokenStore, room, input.code, input.resumeToken);
  if (resumed !== undefined && input.resumeToken !== undefined) {
    return ok({
      kind: "resumed",
      participantId: resumed.id,
      resumeToken: input.resumeToken,
      membership: attachConnection(room, resumed.id, input.connId, input.tool),
      timer: timerFor(resumed.id),
    });
  }

  // **合言葉の関門**（R4-2・#95 S5b でここが越境を止める唯一の場所になった）。
  // 復帰は上で return 済みのためここには来ない＝再認証不要。
  //
  // **ハブもここを通る**（#95 S5a）。通さないと、合言葉を知らない人が選択画面から
  // 保護ルームの名簿を読めてしまう。
  const allowed = checkPassphrase(tokenStore.getPassphrase(input.code), input.passphrase);
  if (allowed.isErr()) {
    // 失敗をレート制限に積算（総当たりの緩和・既存 join 制限と統合）。
    rateLimitGate.consume(input.connId, rateNow);
    return err(allowed.error);
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

  // かつてはここで AI の鍵を持って入った人を timer の状態へ書いていた。
  // #91 PR 3 で timer のお題ごと消えた（お題はルームの共有資産になった）。
  const timer = timerFor(participantId);

  tokenStore.issueResume(resumeToken, { participantId, roomCode: input.code });

  return ok({
    kind: "joined",
    participantId,
    resumeToken,
    membership: addParticipant(room, newParticipant),
    timer,
  });
}
