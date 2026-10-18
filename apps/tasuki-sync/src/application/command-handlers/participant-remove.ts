/**
 * `participant.remove` 専用分岐（フェーズ5で `handlers.ts` から移動）。
 *
 * `handlers.ts` の `handleRoomCommand` 内にあった `participant.remove` の
 * 専用分岐をそのまま移動した。呼び出し側（`handleRoomCommand`）は在室確認と
 * アクター解決を済ませた `{ room, actor }` を `ctx` として渡す。
 * このハンドラは decide/evolve の共通パイプラインを
 * 経由せず、自分自身で `store.put`/`broadcastSnapshot`/`broadcastSignal` を
 * 完結させて `ok(undefined)` を返す（元の分岐と同じ構造。パイプライン共通処理
 * の手前で完結して return する形をそのまま保つ）。
 *
 * Issue #79 で「退出後に在室者が 0 人になるなら、部屋を残さず破棄する」経路を足した。
 * 破棄の後始末はアイドル回収と共通の `destroy-room.ts` へ委ねる。
 */

import { ok, err, type Result } from "neverthrow";
import {
  removalNotificationFor,
  errorMessageFor,
  type TimerState,
  type ErrorCode,
  type Command,
} from "@tasuki/timer-core";
import type { Participant as MembershipParticipant } from "@tasuki/room-core";
import { planRemoval } from "../room-removal.js";
import type { WallClock } from "../../ports/wall-clock.js";
import type { Broadcaster } from "../../ports/broadcaster.js";
import type { RoomState } from "../apply-room-level-event.js";
import { occupants } from "../timer-snapshot-dto.js";

/** `handleRoomCommand` が事前に解決済みの在室ルームと実行者。 */
export interface ParticipantRemoveContext {
  state: RoomState;
  actor: MembershipParticipant;
}

export interface ParticipantRemoveDeps {
  clock: WallClock;
  broadcaster: Broadcaster;
  /** 名簿と timer の状態を保管し、合成した snapshot を配信する（`handlers.ts`）。 */
  commit: (state: RoomState) => void;
  reconcileSchedule: (timer: TimerState) => void;
  messageForRemoval: (
    code: ReturnType<typeof removalNotificationFor>,
    actorDisplayName: string,
  ) => string;
  sendError: (connId: string, code: ErrorCode, message: string) => void;
  /** ルームごと破棄する共通経路（`destroy-room.ts`）。アイドル回収と同じ後始末を通す。 */
  destroyRoom: (roomCode: string) => void;
  /**
   * 名簿から消えた人の票を捨てる（R8・#95 S5b）。**poker の保管はここから触らない** ——
   * 配線（`create-sync-server.ts`）が poker のメッセージ層へ繋ぐ。
   *
   * **必須にしてある。** 省略可能にすると、本番の配線が繋ぎ忘れても全テストが緑のまま、
   * 名簿に居ない人の票が公開時の集計へ混ざる状態が静かに戻る
   * （`destroy-room.ts` の `rounds` を必須にしたのと同じ理由）。
   */
  discardPokerVote: (roomCode: string, participantId: string) => void;
}

/**
 * 参加者の退出（⑪）。参加者は Room レベルのため decide ではなくここで扱う。
 * rotation に居れば rotation からも外し（現ドライバーなら evolve が繰り上げ）、
 * **部屋に誰かが残るなら** rotation 最後の1人は外せない（rotation を空にしない）。
 * 誰も残らないなら部屋ごと破棄する（Issue #79）。
 * 自己退出も可能（FR-079）。#95 S3 で在室者は全員同格になったため「誰が実行できるか」
 * という判定は無く、ここでは「結果の状態が妥当か」だけを検査する。
 */
export async function handleParticipantRemove(
  connId: string,
  ctx: ParticipantRemoveContext,
  cmd: Extract<Command, { command: "participant.remove" }>,
  deps: ParticipantRemoveDeps,
): Promise<Result<undefined, ErrorCode>> {
  const {
    clock,
    broadcaster,
    commit,
    reconcileSchedule,
    messageForRemoval,
    sendError,
    destroyRoom,
    discardPokerVote,
  } = deps;
  const { state, actor: participant } = ctx;
  const { membership, timer } = state;

  const now = clock.now();
  const targetId = cmd.participantId;
  if (typeof targetId !== "string") {
    sendError(connId, "INVALID", "不正な対象は外せません");
    return err("INVALID");
  }
  // 対象は名簿の参加者か、輪の上の代理のどちらか（#95 S4a）。
  const residents = occupants(membership, timer);
  const target = residents.find((p) => p.participantId === targetId);
  if (!target) {
    sendError(connId, "PARTICIPANT_NOT_FOUND", errorMessageFor("PARTICIPANT_NOT_FOUND"));
    return err("PARTICIPANT_NOT_FOUND");
  }

  /**
   * 退出した本人へ専用通知を送る（残りメンバーの snapshot には含まれず取り残されるため）。
   * クライアントはこれを受けて退出メッセージ＋次の画面へ遷移する。
   * 代理（接続を持たない）はクライアントが無いので送らない。
   *
   * **その人の接続すべてへ送る**（#95 S4b）。選択画面とツールを別タブで開いている人を
   * 片方のタブだけ追い出すと、残ったタブは存在しないルームの画面を映したままになる。
   *
   * 「通知しない」ではなく「誰の操作かで種類を分ける」（Issue #32）。自己退出（本人が
   * 自分自身を対象に退出した）と他者による退出を同じ種類で伝えると、自分で押した操作を
   * 「外されました」と伝えることになるため、removalNotificationFor() で種類を判定し、
   * どちらの場合も必ず本人へ送る。
   *
   * `sendError` は connId へ直接送るためストアを引かない。したがってルームを破棄した
   * 後でも本人には届く（下のソロ退出の経路がこれに依存している）。
   */
  const notifyRemovedTarget = (): void => {
    if (target.connIds.length === 0) return;
    // 「自分で抜けた」のか「他人に外された」のかは、実行者と対象の participantId を
    // 突き合わせて決める。**この比較は #95 S3 でも残る**（役割とは無関係で、
    // 本人へ見せる文言そのものを分ける唯一の判断である）。
    const removalCode = removalNotificationFor(participant.id, targetId);
    const message = messageForRemoval(removalCode, participant.displayName);
    for (const connId of target.connIds) sendError(connId, removalCode, message);
  };

  // 名簿・輪の計算は `room-removal.ts` の `planRemoval` に分けてある（#419・poker の入口と共有）。
  // ソロの退出でルームごと破棄する理由（#79）、最後の 1 席の繰り上げ（#290・#376）の注記もそちらにある。
  const planned = planRemoval({ membership, timer }, targetId, now);
  if (planned.isErr()) {
    const failure = planned.error;
    const code: ErrorCode = typeof failure === "string" ? failure : failure.decide;
    sendError(connId, code, errorMessageFor(code));
    return err(code);
  }
  const outcome = planned.value;
  if (outcome.kind === "destroy") {
    // 後始末はアイドル回収と同じ共通経路へ委ねる（スケジューラ・お題の生成・presence タイマー・
    // トークン・名簿・timer の状態・お題・ラウンド。1 つでも取りこぼすと消えた部屋のタイマーが
    // 生き残る。内訳と順序の正本は `application/destroy-room.ts`）。
    destroyRoom(timer.code);
    // 破棄した部屋へは snapshot も signal も配信しない（宛先がもう居ない）。
    // 本人への通知だけは残す — 通知が無いと、抜けた本人が操作できない画面に
    // 取り残される（Issue #32 で塞いだ穴をソロだけ開け直すことになる）。
    notifyRemovedTarget();
    return ok(undefined);
  }
  // timer を渡したので、外した後の timer は必ず返る。
  const next: RoomState = { membership: outcome.membership, timer: outcome.timer ?? timer };
  commit(next);
  // **退出した人の票を捨てる**（R8・#95 S5b）。名簿を更新し終えてから呼ぶ ——
  // poker 側は更新後の名簿で自動公開を測り直す（残った全員が投票済みになりうる）。
  // ルームごと破棄する経路（上の在室者 0）では呼ばない（`destroy-room.ts` が両方消す）。
  discardPokerVote(next.timer.code, targetId);
  reconcileSchedule(next.timer);
  // 誰が誰を退出させたかを在室者へ伝える（FR-077）。
  // store.put の後に配信することが重要で、broadcastSignal は呼び出し時点のストアから
  // 宛先を決めるため、この順序により退出させられた本人には届かない（本人向けは下の error）。
  broadcaster.broadcastSignal(next.timer.code, {
    type: "signal",
    signal: "notice",
    action: "participant-removed",
    actorName: participant.displayName,
    actorParticipantId: participant.id,
    targetName: target.displayName,
    targetParticipantId: target.participantId,
  });
  // 退出した本人へ専用通知を送る（種類の判定と理由は notifyRemovedTarget の docstring 参照）。
  notifyRemovedTarget();
  return ok(undefined);
}
