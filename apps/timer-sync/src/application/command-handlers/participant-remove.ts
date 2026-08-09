/**
 * `participant.remove` 専用分岐（フェーズ5で `handlers.ts` から移動）。
 *
 * `handlers.ts` の `handleRoomCommand` 内にあった `participant.remove` の
 * 専用分岐をそのまま移動した。呼び出し側（`handleRoomCommand`）は在室確認・
 * アクター解決・`rejectIfUnauthorized` を済ませた `{ room, actor }` を
 * `ctx` として渡す。このハンドラは decide/evolve の共通パイプラインを
 * 経由せず、自分自身で `store.put`/`broadcastSnapshot`/`broadcastSignal` を
 * 完結させて `ok(undefined)` を返す（元の分岐と同じ構造。パイプライン共通処理
 * の手前で完結して return する形をそのまま保つ）。
 *
 * Issue #79 で「退出後に在室者が 0 人になるなら、部屋を残さず破棄する」経路を足した。
 * 破棄の後始末はアイドル回収と共通の `destroy-room.ts` へ委ねる。
 */

import { ok, err, type Result } from "neverthrow";
import {
  evolve,
  canRemoveParticipant,
  removalNotificationFor,
  errorMessageFor,
  type Room,
  type Participant,
  type ErrorCode,
} from "@tasuki/timer-core";
import type { Clock } from "../../ports/clock.js";
import type { Broadcaster } from "../../ports/broadcaster.js";
import type { RoomStore } from "../../ports/room-store.js";

/** `handleRoomCommand` が事前に解決済みの在室ルームと実行者。 */
export interface ParticipantRemoveContext {
  room: Room;
  actor: Participant;
}

export interface ParticipantRemoveDeps {
  store: RoomStore;
  clock: Clock;
  broadcaster: Broadcaster;
  reconcileSchedule: (room: Room) => void;
  rotationDisplayNames: (room: Room) => string[];
  transferHostBeforeRemoval: (room: Room, leavingParticipantId: string) => Room;
  messageForRemoval: (
    code: ReturnType<typeof removalNotificationFor>,
    actorDisplayName: string,
  ) => string;
  sendError: (connId: string, code: ErrorCode, message: string) => void;
  /** ルームごと破棄する共通経路（`destroy-room.ts`）。アイドル回収と同じ後始末を通す。 */
  destroyRoom: (roomCode: string) => void;
}

/**
 * 参加者の退出（⑪）。参加者は Room レベルのため decide ではなくここで扱う。
 * rotation に居れば rotation からも外し（現ドライバーなら evolve が繰り上げ）、
 * **部屋に誰かが残るなら** rotation 最後の1人は外せない（rotation を空にしない）。
 * 誰も残らないなら部屋ごと破棄する（Issue #79）。
 * 自己退出も可能（FR-079）。誰が実行できるかは呼び出し側の rejectIfUnauthorized が
 * 判定済みで、ここでは「結果の状態が妥当か」だけを検査する。
 */
export async function handleParticipantRemove(
  connId: string,
  ctx: ParticipantRemoveContext,
  cmd: { command: "participant.remove"; [key: string]: unknown },
  deps: ParticipantRemoveDeps,
): Promise<Result<undefined, ErrorCode>> {
  const {
    store,
    clock,
    broadcaster,
    reconcileSchedule,
    rotationDisplayNames,
    transferHostBeforeRemoval,
    messageForRemoval,
    sendError,
    destroyRoom,
  } = deps;
  const { room: targetRoom, actor: participant } = ctx;

  const now = clock.now();
  const targetId = cmd.participantId;
  if (typeof targetId !== "string") {
    sendError(connId, "INVALID", "不正な対象は外せません");
    return err("INVALID");
  }
  const target = targetRoom.participants.find((p) => p.participantId === targetId);
  if (!target) {
    sendError(connId, "PARTICIPANT_NOT_FOUND", errorMessageFor("PARTICIPANT_NOT_FOUND"));
    return err("PARTICIPANT_NOT_FOUND");
  }
  // 不変条件: 実在（非代理）の編集者以上が1名以上残ること（FR-072/073）。
  // 権限ではなくドメインガードなので checkPermission とは別に検査する（plan.md D3）。
  if (!canRemoveParticipant(targetRoom.participants, targetId)) {
    sendError(connId, "LAST_MANAGER_LEAVE", errorMessageFor("LAST_MANAGER_LEAVE"));
    return err("LAST_MANAGER_LEAVE");
  }

  /**
   * 退出した本人へ専用通知を送る（残りメンバーの snapshot には含まれず取り残されるため）。
   * クライアントはこれを受けて退出メッセージ＋次の画面へ遷移する。
   * 代理(connId=null)はクライアントが無いので送らない。
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
    if (!target.connId) return;
    // ホストが自分自身を退出させる経路では先に transferHostBeforeRemoval が走るが、
    // transferHost は role と hostParticipantId だけを書き換え participantId は変えない
    // ため、実行者と対象の同一判定（removalNotificationFor）はずれない。
    const removalCode = removalNotificationFor(participant.participantId, targetId);
    sendError(target.connId, removalCode, messageForRemoval(removalCode, participant.displayName));
  };

  // ソロの部屋からの退出（Issue #79）。退出後に在室者が 0 人になるなら、参加者を
  // 1 人減らした状態は作らず、ルームごと破棄する。
  //
  // 下の rotation 長ガード（BelowMinMembers）は「rotation を空にすると evolve が
  // currentIndex を決められず破綻する」ことを避けるための保護であり、**部屋に人が
  // 残る前提**の不変条件である。ところがこの保護は、作った直後のソロの部屋にも
  // そのまま効いていた。結果としてルームを作った本人が気が変わっても抜けられず、
  // タブを閉じるしかない（しかも部屋はアイドル回収まで最大 ROOM_IDLE_TTL_MS 残る）。
  //
  // 誰も残らないのであれば rotation を維持する意味は無い。そこで evolve を通さず
  // ルームごと破棄する。緩めるのはこの一点だけで、1 人でも残るなら従来どおり
  // 拒否する（rotation が空の部屋に人が取り残される破綻を作らないため）。
  // 在室者の数え方は canRemoveParticipant（core）と同じで、代理(isPlaceholder)も
  // 「残る人」に数える。代理は自分では退出しないので部屋に残り続けるためである。
  const remainingResidents = targetRoom.participants.filter((p) => p.participantId !== targetId);
  if (remainingResidents.length === 0) {
    // 後始末はアイドル回収と同じ共通経路へ委ねる（スケジューラ・委譲・presence タイマー・
    // トークン・ストアの 5 点。1 つでも取りこぼすと消えた部屋のタイマーが生き残る）。
    destroyRoom(targetRoom.code);
    // 破棄した部屋へは snapshot も signal も配信しない（宛先がもう居ない）。
    // 本人への通知だけは残す — 通知が無いと、抜けた本人が操作できない画面に
    // 取り残される（Issue #32 で塞いだ穴をソロだけ開け直すことになる）。
    notifyRemovedTarget();
    return ok(undefined);
  }

  // 対象が現ホストなら、退出させる前にホストを引き継ぐ（plan.md D2b）。
  // 引き継がずに退出させると hostParticipantId が実在しない参加者を指し、
  // 開始前のルームはホスト限定操作が誰にも実行できなくなって恒久的に詰む。
  // 自動委譲は切断契機でしか発火しないため救済もない。
  const roomBeforeRemoval = target.participantId === targetRoom.hostParticipantId
    ? transferHostBeforeRemoval(targetRoom, targetId)
    : targetRoom;
  // rotation の枠を外すかを決める（D6b・FR-085）。
  // rotation は参加者IDの配列なので、退出者の枠は ID でそのまま一意に引ける。
  // 参加順から「枠の持ち主」を推測していた G6 の規則（sameNameOwner）は、
  // 同名の二重参加や再接続で実態とずれたため撤去した。
  const idx = roomBeforeRemoval.session.rotation.indexOf(targetId);
  let next: Room = {
    ...roomBeforeRemoval,
    participants: roomBeforeRemoval.participants.filter((p) => p.participantId !== targetId),
  };
  if (idx >= 0) {
    if (roomBeforeRemoval.session.rotation.length <= 1) {
      sendError(connId, "BelowMinMembers", errorMessageFor("BelowMinMembers"));
      return err("BelowMinMembers");
    }
    const agg = evolve(
      { session: roomBeforeRemoval.session, clock: roomBeforeRemoval.clock },
      { type: "MemberRemoved", index: idx, now },
      now,
    );
    next = { ...next, session: agg.session, clock: agg.clock };
    next = { ...next, config: { ...next.config, members: rotationDisplayNames(next) } };
  }
  store.put(next);
  broadcaster.broadcastSnapshot(next.code, next);
  reconcileSchedule(next);
  // 誰が誰を退出させたかを在室者へ伝える（FR-077）。
  // store.put の後に配信することが重要で、broadcastSignal は呼び出し時点のストアから
  // 宛先を決めるため、この順序により退出させられた本人には届かない（本人向けは下の error）。
  broadcaster.broadcastSignal(next.code, {
    type: "signal",
    signal: "notice",
    action: "participant-removed",
    actorName: participant.displayName,
    actorParticipantId: participant.participantId,
    targetName: target.displayName,
    targetParticipantId: target.participantId,
  });
  // 退出した本人へ専用通知を送る（種類の判定と理由は notifyRemovedTarget の docstring 参照）。
  notifyRemovedTarget();
  return ok(undefined);
}
