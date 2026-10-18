/**
 * 人をルームから外すときの**状態の計算**（#419・G-6）。
 *
 * かつて `command-handlers/participant-remove.ts` の中にあった「名簿から外す → 空なら破棄 →
 * 輪の席を外す（繰り上げ含む）」を、入口が 2 つ（timer の `participant.remove` と
 * poker の `remove-participant`）になったために切り出した。
 *
 * **純関数である。送信も保管もしない。** 外した後の保管・配信・通知は入口ごとに違う
 * （timer は本人へ通知を送り、poker は timer の状態を持たないルームでも呼ばれる）ので、
 * 呼び出し側が行う。ここへ副作用を入れると片方の入口の都合がもう片方へ漏れる。
 *
 * 外した後の「保管・票の後始末・予約の突き合わせ・知らせ」の順序だけは両方の入口で同じなので、
 * 副作用を持つ {@link applyTimerRemoval} をこのファイルの末尾に 1 つだけ置く（planRemoval は純関数のまま）。
 *
 * `timer` が `undefined` のルーム（poker だけで使っているルーム・D8 の遅延生成）では
 * 輪の処理を飛ばし、名簿だけを更新する。
 */
import { err, ok, type Result } from "neverthrow";
import {
  decide,
  evolve,
  rotationEntryId,
  type ErrorCode,
  type TimerState,
} from "@tasuki/timer-core";
import { hasNoParticipants, removeParticipant, type Room } from "@tasuki/room-core";
import type { Broadcaster } from "../ports/broadcaster.js";
import type { RoomState } from "./apply-room-level-event.js";
import { pickPromotionTarget } from "./pick-promotion-target.js";
import { computeIneligibleIndices, occupants } from "./timer-snapshot-dto.js";

export type RemovalOutcome =
  /** 名簿が空になる。ルームごと破棄する。 */
  | { kind: "destroy" }
  /** 外した後の名簿と、（あれば）輪を外した timer の状態。 */
  | { kind: "removed"; membership: Room; timer: TimerState | undefined };

export type RemovalError =
  | "PARTICIPANT_NOT_FOUND"
  | "BelowMinMembers"
  /**
   * decide が返した失敗。`decide` をそのまま呼び出し側のエラー応答に使う。
   * （コード名を持つ形にすると、エラーコードを走査する検査が偽のコードとして拾うため、型ごと持つ。）
   */
  | { decide: ErrorCode };

export function planRemoval(
  input: { membership: Room; timer: TimerState | undefined },
  targetId: string,
  now: number,
): Result<RemovalOutcome, RemovalError> {
  const { membership, timer } = input;

  // 対象は名簿の参加者か、輪の上の代理のどちらか（#95 S4a）。輪が無ければ名簿の人だけ。
  const known =
    timer === undefined
      ? membership.participants.some((p) => p.id === targetId)
      : occupants(membership, timer).some((p) => p.participantId === targetId);
  if (!known) return err("PARTICIPANT_NOT_FOUND");

  // ソロの部屋からの退出（Issue #79）。退出後に在室者が 0 人になるなら、参加者を
  // 1 人減らした状態は作らず、ルームごと破棄する。
  //
  // 下の rotation 長ガード（BelowMinMembers）は「rotation を空にして担当の居ない輪を
  // 作る」ことを避けるための保護であり（#376 より前は evolve の currentIndex が NaN になった）、**部屋に人が
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
  // **`occupants()` の結果で数えないこと** —— あちらは輪の代理を
  // 混ぜて返すので、代理を「残る人」に数えてしまう。
  //
  // 判定は `@tasuki/room-core` の `hasNoParticipants` に任せる。「名簿が空か」は
  // メンバーシップ文脈の述語であり、ここで `participants.length === 0` を書き写すと
  // **名簿の表現が変わったときに片側だけが取り残される**（#245 のレビューで、
  // 書き写しが SC-039③④ の指標としても現れた）。
  //
  // 対象が代理なら `removeParticipant` は `PARTICIPANT_NOT_FOUND` を返す（代理は名簿に居ない・D6）。
  // そのときは名簿を変えずに進むので、ここで先に外しても輪の席の処理は下でそのまま行える。
  const membershipAfterRemoval = removeParticipant(membership, targetId).unwrapOr(membership);
  if (hasNoParticipants(membershipAfterRemoval)) return ok({ kind: "destroy" });

  // timer の状態が無いルームには外す輪が無い。名簿だけを更新する。
  if (timer === undefined) {
    return ok({ kind: "removed", membership: membershipAfterRemoval, timer: undefined });
  }

  // rotation の枠を外すかを決める（D6b・FR-085）。
  // rotation は参加者IDの配列なので、退出者の枠は ID でそのまま一意に引ける。
  // 参加順から「枠の持ち主」を推測していた G6 の規則（sameNameOwner）は、
  // 同名の二重参加や再接続で実態とずれたため撤去した。
  const idx = timer.session.rotation.findIndex((e) => rotationEntryId(e) === targetId);
  // 名簿から外す（代理は名簿に居ないので何も起きない。輪の席だけが下で外れる）。
  // かつてはここで AI の鍵の持ち主の一覧からも落としていた。#91 PR 3 でその一覧ごと消えた。
  let nextTimer: TimerState = timer;
  if (idx >= 0) {
    // 数えるのは**席（`RotationEntry`）**であって名簿の人数ではない。守っているのは
    // 「evolve が currentIndex を決められる輪が残ること」なので、代理の席も 1 席と数える。
    //
    // **最後の 1 席でも拒まない**（#290・D1）。見学者を先に繰り上げてから外すので、
    // 輪は一瞬も空にならない（担当の居ない輪を作らない。#376 より前は空の輪で
    // `evolveMemberRemoved` が currentIndex を NaN にした。いまは 0 にして時計も止めるが、空の輪は認めない）。
    // 拒否を残すのは候補が居ないときの防御で、**名簿が空でない限りここへは来ない** ——
    // 退出者が唯一の席を持つなら、残る名簿の全員が見学だからである。
    let working = { session: timer.session, clock: timer.clock };
    if (timer.session.rotation.length <= 1) {
      const seatedIds = new Set(timer.session.rotation.map(rotationEntryId));
      const promoted = pickPromotionTarget(membership.participants, seatedIds, targetId);
      if (promoted === null) return err("BelowMinMembers");
      const added = evolve(working, { type: "MemberAdded", participantId: promoted.id, now }, now);
      working = { session: added.session, clock: added.clock };
    }
    // **`idx` は繰り上げの後も有効である。** `MemberAdded` は席を末尾へ足すので、
    // 先にある退出者の位置は動かない（ここへ来る時点で `idx` は 0 である）。
    // 席を外すのは decide の member.remove と同じ 1 つの経路にする（#376）。運転中の人が抜けるなら、
    // 次の担当は交代と同じ資格の規則で decide が選ぶ。資格は member.remove と同じく**操作の前の名簿**で測る
    // （`handlers.ts` の `ineligible` と同じ。抜ける人の席は選ばれないので、前後どちらでも結果は変わらない）。
    // 添字は繰り上げを済ませた `working` の輪のもの。繰り上げで輪は 2 席以上あるので、BelowMinMembers は返らない。
    const ineligible = computeIneligibleIndices(membership, {
      ...timer,
      session: working.session,
      clock: working.clock,
    });
    const removed = decide({ command: "member.remove", index: idx, ineligible }, working, now);
    if (removed.isErr()) return err({ decide: removed.error.type });
    const agg = removed.value.reduce((acc, event) => evolve(acc, event, now), working);
    nextTimer = { ...timer, session: agg.session, clock: agg.clock };
  }
  return ok({ kind: "removed", membership: membershipAfterRemoval, timer: nextTimer });
}

export interface TimerRemovalDeps {
  broadcaster: Broadcaster;
  /** 名簿と timer の状態を保管し、snapshot を配信する（`handlers.ts` の `commit`）。 */
  commit: (state: RoomState) => void;
  reconcileSchedule: (timer: TimerState) => void;
  discardPokerVote: (roomCode: string, participantId: string) => void;
}

/**
 * timer の状態があるルームで人を外した後の、保管から知らせまでの後段（入口 2 つで共通）。
 *
 * 順序に意味がある。
 * 1. `commit`: 保管してから配る。
 * 2. `discardPokerVote`: **名簿を更新し終えてから**呼ぶ（poker は更新後の名簿で自動公開を測り直す・R8）。
 * 3. `reconcileSchedule`: 輪が変わったので自動交代の予約を測り直す。
 * 4. `broadcastSignal`: 保管の後に配るので、外された本人（もう名簿に居ない）には届かない（FR-077）。
 */
export function applyTimerRemoval(
  deps: TimerRemovalDeps,
  next: RoomState,
  actor: { id: string; displayName: string },
  target: { id: string; displayName: string },
): void {
  const { broadcaster, commit, reconcileSchedule, discardPokerVote } = deps;
  commit(next);
  discardPokerVote(next.timer.code, target.id);
  reconcileSchedule(next.timer);
  broadcaster.broadcastSignal(next.timer.code, {
    type: "signal",
    signal: "notice",
    action: "participant-removed",
    actorName: actor.displayName,
    actorParticipantId: actor.id,
    targetName: target.displayName,
    targetParticipantId: target.id,
  });
}
