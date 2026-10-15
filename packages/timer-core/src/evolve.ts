/**
 * evolve 関数 — DomainEvent を適用して集約を更新する純粋関数
 * T013: FR-003, FR-007, FR-008
 */

import type { Aggregate, TimerConfig, RotationEntry, ServerClock } from "./aggregate.js";
import {
  initialAggregateInSeconds,
  isPermutation,
  isSeatIndex,
  nextDriverAfterRemoval,
  nextEligibleIndex,
  rotationEntryId,
} from "./aggregate.js";
import type { DomainEvent } from "./events.js";

/**
 * 走行中の clock を「現在の残量で停止（凍結）」した状態にする純粋ヘルパ（F1/F2・v2.3）。
 * secondsLeft は停止中 secondsLeftAtAnchor をそのまま返すため、停止時点の残量を焼き付ける。
 * 既に停止中なら時間は再計算しない（一時停止→休憩 等の二重停止で、止まっていた壁時計時間を
 * 誤って差し引かないため）。冪等。
 */
function freezeRunningClock(clock: ServerClock, now: number): ServerClock {
  if (!clock.running) {
    return { ...clock, running: false, runningSince: null };
  }
  const addedMs = clock.runningSince !== null ? now - clock.runningSince : 0;
  const elapsedSinceAnchor = (now - clock.anchorServerTime) / 1000;
  const frozen = Math.max(0, clock.secondsLeftAtAnchor - elapsedSinceAnchor);
  return {
    ...clock,
    running: false,
    secondsLeftAtAnchor: frozen,
    anchorServerTime: now,
    accumulatedElapsedMs: clock.accumulatedElapsedMs + addedMs,
    runningSince: null,
  };
}

/**
 * イベントを集約に適用し、新しい集約を返す純粋関数
 * 全域関数（全イベント型を処理）
 *
 * **前提を満たさないイベントは黙って無視する（集約をそのまま返す。#376）。** 範囲外の添字・順列でない
 * 並べ替え・空の輪への交代がそれに当たる。evolve は純粋でログを持たないので知らせる手段が無く、
 * 拒否は decide の仕事である。decide と evolve は同じ述語（`aggregate.ts` の `isSeatIndex` /
 * `isPermutation`）で判定するので、decide が通したイベントを evolve が無視することはない。
 */
// 第3引数は呼び出し側の「この適用の時刻」を表すが、各イベントは自身に now を持つため
// 分岐側では event.now を使う。引数はイベントを持たない将来の適用や呼び出し規約の
// 一貫性のために残す（全呼び出し箇所が渡している）。
export function evolve(agg: Aggregate, event: DomainEvent, _now: number): Aggregate {
  return stopWithoutDriver(evolveByType(agg, event), event.now);
}

/**
 * 輪が空なのに時計が走っていたら止め、一時停止として表す（#376）。担当の居ない輪でタイマーを回さない。
 *
 * 表現は `SessionPaused` と同じ（残量を凍結し `isPaused: true`）。画面の再開ボタンは
 * `isPaused` のときだけ押せるので、席を足し直した後に「再開」で走り出せる。
 * **止まっている時計には触らない。** 休憩は isPaused を使わずに時計を止める（`evolveBreakStarted`）。
 * 休憩中や開始前に輪が空になっても一時停止を立てないので、席を足し直せば `BreakEnded`・`START` で走り出せる
 * （休憩中かどうかは集約に無く、ルームの `onBreak` が持つ。走っているかどうかで分けるのはそのため）。
 * 出口の 1 か所に置くのは、空の輪に後から届く `SessionStarted`・`SessionResumed`・`BreakEnded`・
 * `DriverTimerReset`・`SessionReset` もそれぞれ時計を走らせるからである。
 * `decide` は最後の 1 人の member.remove を拒むので、通常の経路からは届かない。
 */
function stopWithoutDriver(agg: Aggregate, now: number): Aggregate {
  if (agg.session.rotation.length > 0 || !agg.clock.running) return agg;
  return {
    session: { ...agg.session, isPaused: true },
    clock: freezeRunningClock(agg.clock, now),
  };
}

function evolveByType(agg: Aggregate, event: DomainEvent): Aggregate {
  switch (event.type) {
    case "SessionStarted":
      return evolveSessionStarted(agg, event.now);

    case "DriverSwitched":
      return evolveDriverSwitched(agg, event.nextIndex, event.now);

    case "SessionPaused":
      return evolveSessionPaused(agg, event.now);

    case "SessionResumed":
      return evolveSessionResumed(agg, event.now);

    case "SessionReset": {
      // F3(v2.3 #3): リセットは「最初から再スタート（走行）」にする。
      // 旧仕様は initialAggregate をそのまま返し running=false だったため、
      // リセット後に開始できず詰む不具合があった。走行状態でアンカーし直す。
      // リセットは並び順を保ったまま最初から走り直す。rotation は参加者IDの配列なので
      // config（表示名の一覧）からは復元できず、現在の並びをそのまま引き継ぐ（D6b）。
      // 間隔は集約の秒をそのまま使う（設定の真実源は `TimerState.config` であって集約ではない）。
      const fresh = initialAggregateInSeconds(agg.clock.intervalSeconds, agg.session.rotation);
      return {
        session: fresh.session,
        clock: {
          ...fresh.clock,
          running: true,
          anchorServerTime: event.now,
          runningSince: event.now,
        },
      };
    }

    case "DriverTimerReset":
      return evolveDriverTimerReset(agg, event.now);

    case "PhaseSet":
      // PhaseSet はルーム全体に適用。集約（session+clock）には影響しない
      return agg;

    case "ConfigSet":
      return evolveConfigSet(agg, event.config, event.now);

    case "MemberAdded":
      return evolveMemberAdded(agg, event.participantId);

    case "MemberRemoved":
      return evolveMemberRemoved(agg, event.index, event.nextDriverIndex);

    case "MemberMoved":
      return evolveMemberMoved(agg, event.fromIndex, event.toIndex);

    case "MembersShuffled":
      return evolveMembersShuffled(agg, event.order);

    case "BreakStarted":
      return evolveBreakStarted(agg, event.now);

    case "BreakEnded":
      return evolveBreakEnded(agg, event.now);

    case "HandoffNoteSet":
    case "SessionCompleted":
    case "SessionAborted":
    case "ProxyMemberAdded":
    case "ParticipantRenamed":
    case "DriverSkipped":
    case "DriverResumed":
      // **これらを集約の畳み込みでは扱わない**、という意味である。
      // 「集約が変わらない」という意味ではない —— #95 S4a で `eligible` が
      // `SessionState.rotation` の席に入り、代理も席になったので、
      // `ProxyMemberAdded`（席と driverCounts を伸ばす）・`DriverSkipped` /
      // `DriverResumed`（席の `eligible` を書き換える）は **`session` を変える**。
      // その反映を持つのはアプリ層（`apps/tasuki-sync/src/application/apply-room-level-event.ts`）
      // であって、ここではない。**`rotation` を触るのは evolve だけ、と読まないこと。**
      return agg;
  }
}


/**
 * 稼働中に次の eligible ドライバーへ交代する（plan.md L194/L209）。
 * `ineligible`（driverEligible===false のインデックス集合）を飛ばして次の対象を選ぶ。
 * B-2統合により、交代先の決定（nextEligibleIndex）とイベント適用（担当回数加算・
 * タイマー再アンカー・交代回数加算、あるいは全員 ineligible 時の現状維持＋再アンカーのみ）は
 * evolveDriverSwitched に一本化された。本関数はその1行ラッパである。
 * 不変条件 rotation.length === driverCounts.length は evolve(DriverSwitched) が保つ。
 *
 * @param agg 集約
 * @param ineligible ドライバー対象外のインデックス集合（undefined = 全員対象）
 * @param now 現在時刻 (epoch ms)
 */
export function advanceDriver(
  agg: Aggregate,
  ineligible: Set<number> | undefined,
  now: number,
): Aggregate {
  return evolve(
    agg,
    { type: "DriverSwitched", nextIndex: nextEligibleIndex(agg.session, agg.session.currentIndex, ineligible), now },
    now,
  );
}

// ─── 各イベントの適用 ─────────────────────────────────────────────────────────

function evolveSessionStarted(agg: Aggregate, now: number): Aggregate {
  return {
    ...agg,
    clock: {
      ...agg.clock,
      running: true,
      anchorServerTime: now,
      runningSince: now,
    },
  };
}

/**
 * 交代先（nextIndex）が席の添字でなければ集約を変えない（#376。判定は decide と共有の `isSeatIndex`）。
 * 空の輪には席が無いので、交代は常に無視される（decide も空の輪の SWITCH を BelowMinMembers で拒む）。
 *
 * B-2統合: 交代先（nextIndex）が適用前の currentIndex と等しい場合は「交代していない」
 * とみなし、driverCounts/totalSwitches を加算しない（advanceDriver 準拠。ユーザー確定の
 * 設計判断）。全員 ineligible で decide が現状維持の nextIndex を返した場合や、輪1人で
 * 隣が自分自身になる場合がこれに当たる。タイマーの再アンカーは加算の有無に関わらず必ず
 * 行う（残り0のまま据え置くと自動交代が即再発火し無限ループになるため）。
 */
function evolveDriverSwitched(
  agg: Aggregate,
  nextIndex: number,
  now: number,
): Aggregate {
  if (!isSeatIndex(nextIndex, agg.session.rotation.length)) return agg;
  const prevIndex = agg.session.currentIndex;

  // 稼働区間を accumulatedElapsedMs に確定加算して新しいアンカーを設定
  const addedMs =
    agg.clock.runningSince !== null ? now - agg.clock.runningSince : 0;
  const reanchoredClock = {
    ...agg.clock,
    anchorServerTime: now,
    secondsLeftAtAnchor: agg.clock.intervalSeconds,
    accumulatedElapsedMs: agg.clock.accumulatedElapsedMs + addedMs,
    runningSince: now,
  };

  if (nextIndex === prevIndex) {
    return { session: agg.session, clock: reanchoredClock };
  }

  const newDriverCounts = [...agg.session.driverCounts];
  if (prevIndex >= 0 && prevIndex < newDriverCounts.length) {
    newDriverCounts[prevIndex] = (newDriverCounts[prevIndex] ?? 0) + 1;
  }

  return {
    session: {
      ...agg.session,
      currentIndex: nextIndex,
      driverCounts: newDriverCounts,
      totalSwitches: agg.session.totalSwitches + 1,
    },
    clock: reanchoredClock,
  };
}

function evolveSessionPaused(agg: Aggregate, now: number): Aggregate {
  // F1(v2.3 #2a): 押下時点の残量を凍結する（満タンに戻るバグ修正）。
  return {
    session: { ...agg.session, isPaused: true },
    clock: freezeRunningClock(agg.clock, now),
  };
}

function evolveSessionResumed(agg: Aggregate, now: number): Aggregate {
  return {
    session: {
      ...agg.session,
      isPaused: false,
    },
    clock: {
      ...agg.clock,
      running: true,
      anchorServerTime: now,
      runningSince: now,
    },
  };
}

/**
 * Issue #14: 現ドライバーのまま持ち時間だけを満タンからやり直す（再スタート）。
 * session は isPaused の解除だけを行い、currentIndex / driverCounts / totalSwitches /
 * rotation は変えない（＝人も回数も動かさない）。clock は満タンで再アンカーして走行させる。
 * 稼働区間は accumulatedElapsedMs に確定加算する（セッション経過は実走時間の記録なので
 * 巻き戻さない。advanceDriver の現状維持分岐・evolveDriverSwitched と同じ扱い）。
 */
function evolveDriverTimerReset(agg: Aggregate, now: number): Aggregate {
  const addedMs =
    agg.clock.runningSince !== null ? now - agg.clock.runningSince : 0;
  return {
    session: { ...agg.session, isPaused: false },
    clock: {
      ...agg.clock,
      running: true,
      anchorServerTime: now,
      secondsLeftAtAnchor: agg.clock.intervalSeconds,
      accumulatedElapsedMs: agg.clock.accumulatedElapsedMs + addedMs,
      runningSince: now,
    },
  };
}

/**
 * F2(v2.3 #2b): 休憩開始でタイマーを停止し残量を凍結する。
 * F1 の一時停止と同じく押下時点の残量を secondsLeftAtAnchor に焼き付ける。
 * 休憩は一時停止とは別概念なので isPaused は立てない（session は ...agg で維持）。
 */
function evolveBreakStarted(agg: Aggregate, now: number): Aggregate {
  // F2(v2.3 #2b): 休憩開始＝タイマーを残量凍結で停止（一時停止と同型・onBreak はルームレベル）。
  return { ...agg, clock: freezeRunningClock(agg.clock, now) };
}

/**
 * F2(v2.3 #2b): 休憩終了で凍結残量から走行を再開する。
 * secondsLeftAtAnchor は休憩開始時の凍結値のままなので、anchorServerTime=now で
 * その値から再カウントが始まる（休憩中の経過時間は消費しない）。
 */
function evolveBreakEnded(agg: Aggregate, now: number): Aggregate {
  // F2(v2.3 #2b): 休憩終了＝凍結残量から再開。既に走行中なら冪等に何もしない。
  if (agg.clock.running) return agg;
  // 一時停止中に休憩していた場合、休憩終了でも一時停止は維持し走行再開しない
  // （running=true かつ isPaused=true の矛盾＝表示は停止中なのに裏で進む、を防ぐ）。
  if (agg.session.isPaused) return agg;
  return {
    ...agg,
    clock: {
      ...agg.clock,
      running: true,
      anchorServerTime: now,
      runningSince: now,
    },
  };
}

/**
 * 設定変更を集約へ反映する。
 *
 * ⚠ **かつてここには `partial.members` から rotation を組み直す分岐があった。**
 * #95 S4a で `TimerConfig` から `members` が消え、型の上でも到達できなくなったので
 * 落とした（wire からも到達不能である。#294 より前は境界の `build-domain-command.ts` が
 * 捨てていたが、いまは `SessionConfigSchema` に項目そのものが無い）。
 * 輪の出入りは member.add/remove/move・addProxy・participant.remove だけが担う。
 */
function evolveConfigSet(
  agg: Aggregate,
  partial: Partial<TimerConfig>,
  _now: number,
): Aggregate {
  const session = agg.session;
  let clock = agg.clock;

  // intervalMinutes 指定時のみ clock を更新する。
  // 稼働中は残り時間を凍結し（途中変更で残りが飛ばないように）、停止中のみ新間隔で初期化する。
  if (partial.intervalMinutes !== undefined) {
    const intervalSeconds = partial.intervalMinutes * 60;
    clock = {
      ...clock,
      intervalSeconds,
      secondsLeftAtAnchor: clock.running
        ? clock.secondsLeftAtAnchor
        : intervalSeconds,
    };
  }

  return { session, clock };
}

function evolveMemberAdded(agg: Aggregate, participantId: string): Aggregate {
  const entry: RotationEntry = { kind: "member", participantId, eligible: true };
  return {
    ...agg,
    session: {
      ...agg.session,
      rotation: [...agg.session.rotation, entry],
      driverCounts: [...agg.session.driverCounts, 0],
    },
  };
}

/**
 * 席を外す。範囲外の添字は集約を変えない（#376。判定は decide と共有の `isSeatIndex`）。
 *
 * 運転中の人を外したら、次の担当は出す側が資格の規則で選んだ `nextDriverIndex`（外した後の添字）にする。
 * それが範囲外なら、位置で次の席（`nextDriverAfterRemoval` を全員適格として引いた値。末尾なら先頭、
 * 空の輪なら 0）へ倒す。運転中でない人を外したら、手前の席が抜けたときだけ 1 つ詰める。
 */
function evolveMemberRemoved(agg: Aggregate, index: number, nextDriverIndex: number): Aggregate {
  const { rotation, driverCounts, currentIndex } = agg.session;
  if (!isSeatIndex(index, rotation.length)) return agg;
  const newRotation = rotation.filter((_, i) => i !== index);
  let newIndex: number;
  if (index !== currentIndex) {
    newIndex = index < currentIndex ? currentIndex - 1 : currentIndex;
  } else if (isSeatIndex(nextDriverIndex, newRotation.length)) {
    newIndex = nextDriverIndex;
  } else {
    newIndex = nextDriverAfterRemoval(agg.session, index, undefined);
  }
  return {
    ...agg,
    session: {
      ...agg.session,
      rotation: newRotation,
      currentIndex: newIndex,
      driverCounts: driverCounts.filter((_, i) => i !== index),
    },
  };
}

function evolveMemberMoved(
  agg: Aggregate,
  fromIndex: number,
  toIndex: number,
): Aggregate {
  const len = agg.session.rotation.length;
  if (!isSeatIndex(fromIndex, len) || !isSeatIndex(toIndex, len)) return agg;
  const newRotation = [...agg.session.rotation];
  const newDriverCounts = [...agg.session.driverCounts];

  const [movedEntry] = newRotation.splice(fromIndex, 1);
  const [movedCount] = newDriverCounts.splice(fromIndex, 1);

  if (movedEntry !== undefined) {
    newRotation.splice(toIndex, 0, movedEntry);
  }
  if (movedCount !== undefined) {
    newDriverCounts.splice(toIndex, 0, movedCount);
  }

  // currentIndex の追跡
  let newIndex = agg.session.currentIndex;
  if (agg.session.currentIndex === fromIndex) {
    newIndex = toIndex;
  } else if (fromIndex < agg.session.currentIndex && toIndex >= agg.session.currentIndex) {
    newIndex--;
  } else if (fromIndex > agg.session.currentIndex && toIndex <= agg.session.currentIndex) {
    newIndex++;
  }

  return {
    ...agg,
    session: {
      ...agg.session,
      rotation: newRotation,
      currentIndex: newIndex,
      driverCounts: newDriverCounts,
    },
  };
}

/**
 * メンバー順を order（順列）で並べ替える。
 * order[i] = 新しい i 番目に来る旧 rotation インデックス。driverCounts も同じ並びに追従させ、
 * 現ドライバーの席を新しい位置へ remap する（位置ではなく席の識別子で人を保持する）。
 */
function evolveMembersShuffled(agg: Aggregate, order: number[]): Aggregate {
  const oldRotation = agg.session.rotation;
  // 順列でない order は集約を変えない（#376。decideMembersShuffle も同じ前提を確かめて拒む）
  if (!isPermutation(order, oldRotation.length)) return agg;
  const oldCounts = agg.session.driverCounts;
  const currentEntry = oldRotation[agg.session.currentIndex];
  // `!`: order は直前で [0..len-1] の順列だと確かめた（添字は必ず範囲内）
  const newRotation = order.map((i) => oldRotation[i]!);
  const newDriverCounts = order.map((i) => oldCounts[i] ?? 0);
  const currentId = currentEntry !== undefined ? rotationEntryId(currentEntry) : undefined;
  const remapped =
    currentId !== undefined
      ? newRotation.findIndex((e) => rotationEntryId(e) === currentId)
      : -1;
  return {
    ...agg,
    session: {
      ...agg.session,
      rotation: newRotation,
      driverCounts: newDriverCounts,
      currentIndex: remapped >= 0 ? remapped : 0,
    },
  };
}

