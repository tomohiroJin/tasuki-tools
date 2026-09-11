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
  evolve,
  removalNotificationFor,
  errorMessageFor,
  rotationEntryId,
  type TimerState,
  type ErrorCode,
} from "@tasuki/timer-core";
import {
  hasNoParticipants,
  removeParticipant,
  type Participant as MembershipParticipant,
} from "@tasuki/room-core";
import type { Clock } from "../../ports/clock.js";
import type { Broadcaster } from "../../ports/broadcaster.js";
import type { RoomState } from "../apply-room-level-event.js";
import { occupants } from "../timer-snapshot-dto.js";

/** `handleRoomCommand` が事前に解決済みの在室ルームと実行者。 */
export interface ParticipantRemoveContext {
  state: RoomState;
  actor: MembershipParticipant;
}

export interface ParticipantRemoveDeps {
  clock: Clock;
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
  cmd: { command: "participant.remove"; [key: string]: unknown },
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
    // 「自分で抜けた」のか「他人に外された」のかは、実行者と対象の participantId を
    // 突き合わせて決める。**この比較は #95 S3 でも残る**（役割とは無関係で、
    // 本人へ見せる文言そのものを分ける唯一の判断である）。
    const removalCode = removalNotificationFor(participant.id, targetId);
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
  //
  // 在室者は名簿の人だけを数える。代理はローテーション上のラベルであり、名簿には居ない（D6）。
  // 名簿が空になれば、輪に代理が残っていてもルームごと破棄する
  // （S3 が残した「代理だけが残る部屋」はこの変更で作れなくなる・#95 S4a）。
  // **`occupants()` の結果（`residents`）で数えないこと** —— あちらは輪の代理を
  // 混ぜて返すので、代理を「残る人」に数えてしまう。
  //
  // 判定は `@tasuki/room-core` の `hasNoParticipants` に任せる。「名簿が空か」は
  // メンバーシップ文脈の述語であり、ここで `participants.length === 0` を書き写すと
  // **名簿の表現が変わったときに片側だけが取り残される**（#245 のレビューで、
  // 書き写しが SC-039③④ の指標としても現れた）。
  //
  // 対象が代理なら `removeParticipant` は何もしない（代理は名簿に居ない・D6）ので、
  // ここで先に外しても輪の席の処理は下でそのまま行える。
  const membershipAfterRemoval = removeParticipant(membership, targetId);
  if (hasNoParticipants(membershipAfterRemoval)) {
    // 後始末はアイドル回収と同じ共通経路へ委ねる（スケジューラ・委譲・presence タイマー・
    // トークン・名簿・timer の状態・ラウンド。1 つでも取りこぼすと消えた部屋のタイマーが
    // 生き残る。内訳と順序の正本は `application/destroy-room.ts`）。
    destroyRoom(timer.code);
    // 破棄した部屋へは snapshot も signal も配信しない（宛先がもう居ない）。
    // 本人への通知だけは残す — 通知が無いと、抜けた本人が操作できない画面に
    // 取り残される（Issue #32 で塞いだ穴をソロだけ開け直すことになる）。
    notifyRemovedTarget();
    return ok(undefined);
  }

  // rotation の枠を外すかを決める（D6b・FR-085）。
  // rotation は参加者IDの配列なので、退出者の枠は ID でそのまま一意に引ける。
  // 参加順から「枠の持ち主」を推測していた G6 の規則（sameNameOwner）は、
  // 同名の二重参加や再接続で実態とずれたため撤去した。
  const idx = timer.session.rotation.findIndex((e) => rotationEntryId(e) === targetId);
  // 名簿から外す（代理は名簿に居ないので何も起きない。輪の席だけが下で外れる）。
  // AI 鍵の持ち主からも落とす —— 名簿から消えた人の鍵を持ち越すと、宛先の無い
  // 候補が残り続ける（wire には出ないので観測はできないが、参照は残る）。
  let next: RoomState = {
    membership: membershipAfterRemoval,
    timer: { ...timer, aiKeyHolders: timer.aiKeyHolders.filter((id) => id !== targetId) },
  };
  if (idx >= 0) {
    // 数えるのは**席（`RotationEntry`）**であって名簿の人数ではない。守っているのは
    // 「evolve が currentIndex を決められる輪が残ること」なので、代理の席も 1 席と数える
    // （代理は輪の上では実在のメンバーと同格に回る）。上の在室者判定が名簿だけを数えるのと
    // 基準が違うのは、見ている不変条件が別物だからである ——
    // あちらは「部屋に人が残るか」、ここは「輪が空にならないか」。
    if (timer.session.rotation.length <= 1) {
      sendError(connId, "BelowMinMembers", errorMessageFor("BelowMinMembers"));
      return err("BelowMinMembers");
    }
    const agg = evolve(
      { session: timer.session, clock: timer.clock },
      { type: "MemberRemoved", index: idx, now },
      now,
    );
    next = { ...next, timer: { ...next.timer, session: agg.session, clock: agg.clock } };
  }
  commit(next);
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
