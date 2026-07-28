/**
 * evolve 関数 — DomainEvent を適用して集約を更新する純粋関数
 * T013: FR-003, FR-007, FR-008
 */

import type { Aggregate, SessionConfig, IntervalMinutes, ServerClock } from "./aggregate.js";
import { initialAggregate, nextEligibleIndex } from "./aggregate.js";
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
 */
// 第3引数は呼び出し側の「この適用の時刻」を表すが、各イベントは自身に now を持つため
// 分岐側では event.now を使う。引数はイベントを持たない将来の適用や呼び出し規約の
// 一貫性のために残す（全呼び出し箇所が渡している）。
export function evolve(agg: Aggregate, event: DomainEvent, _now: number): Aggregate {
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
      const fresh = initialAggregate(buildConfigFromReset(agg), agg.session.rotation);
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
      return evolveMemberRemoved(agg, event.index);

    case "MemberMoved":
      return evolveMemberMoved(agg, event.fromIndex, event.toIndex);

    case "MembersShuffled":
      return evolveMembersShuffled(agg, event.order);

    case "BreakStarted":
      return evolveBreakStarted(agg, event.now);

    case "BreakEnded":
      return evolveBreakEnded(agg, event.now);

    case "ProblemSet":
    case "HandoffNoteSet":
    case "SessionCompleted":
    case "SessionAborted":
    case "ProxyMemberAdded":
    case "ParticipantRenamed":
    case "DriverSkipped":
    case "DriverResumed":
    case "ProblemEdited":
    case "ProblemModeSet":
      // これらはルーム全体のフィールドに影響するが集約(session+clock)は変わらない
      return agg;
  }
}


/**
 * 稼働中に次の eligible ドライバーへ交代する（plan.md L194/L209）。
 * `ineligible`（driverEligible===false のインデックス集合）を飛ばして次の対象を選ぶ。
 * 交代先が見つかれば DriverSwitched 相当（担当回数加算・タイマー再アンカー・交代回数加算）を適用する。
 * 全員 ineligible で交代先が現状と同じ場合は、ドライバーを維持しつつタイマーのみ再アンカーして
 * 自動交代が残り0で即再発火する無限ループを防ぐ。
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
  const cur = agg.session.currentIndex;
  const nextIndex = nextEligibleIndex(agg.session, cur, ineligible);
  if (nextIndex !== cur) {
    return evolve(agg, { type: "DriverSwitched", nextIndex, now }, now);
  }

  // 交代先が現状と同じ（全員 ineligible 等）→ 現状維持。タイマーのみ再アンカーする。
  const addedMs =
    agg.clock.runningSince !== null ? now - agg.clock.runningSince : 0;
  return {
    session: agg.session,
    clock: {
      ...agg.clock,
      anchorServerTime: now,
      secondsLeftAtAnchor: agg.clock.intervalSeconds,
      accumulatedElapsedMs: agg.clock.accumulatedElapsedMs + addedMs,
      runningSince: now,
    },
  };
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

function evolveDriverSwitched(
  agg: Aggregate,
  nextIndex: number,
  now: number,
): Aggregate {
  const prevIndex = agg.session.currentIndex;
  const newDriverCounts = [...agg.session.driverCounts];

  // 現ドライバーの担当回数を加算
  if (prevIndex >= 0 && prevIndex < newDriverCounts.length) {
    newDriverCounts[prevIndex] = (newDriverCounts[prevIndex] ?? 0) + 1;
  }

  // 稼働区間を accumulatedElapsedMs に確定加算して新しいアンカーを設定
  const addedMs =
    agg.clock.runningSince !== null ? now - agg.clock.runningSince : 0;

  return {
    session: {
      ...agg.session,
      currentIndex: nextIndex,
      driverCounts: newDriverCounts,
      totalSwitches: agg.session.totalSwitches + 1,
    },
    clock: {
      ...agg.clock,
      anchorServerTime: now,
      secondsLeftAtAnchor: agg.clock.intervalSeconds,
      accumulatedElapsedMs: agg.clock.accumulatedElapsedMs + addedMs,
      runningSince: now,
    },
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

function evolveConfigSet(
  agg: Aggregate,
  partial: Partial<SessionConfig>,
  _now: number,
): Aggregate {
  let session = agg.session;
  let clock = agg.clock;

  // members 指定時のみ rotation/driverCounts/currentIndex を再構築する。
  // 現ドライバーを保持しつつ追従する（位置が見つからなければ 0 にクランプ）。
  //
  // **注意（D6b）:** rotation は参加者IDの配列になったが、この分岐は `partial.members` の
  // 中身をそのまま rotation にする。表示名の一覧を渡すと rotation が名前に戻り、
  // 識別子の不変条件が壊れる。そのためサーバー層（handlers の buildDomainCommand）は
  // config.set から members を落としており、共有ルームではこの分岐に到達しない。
  // 輪の出入りは member.add/remove/move・addProxy・participant.remove だけが担う。
  if (partial.members !== undefined) {
    const currentMember = agg.session.rotation[agg.session.currentIndex];
    const newRotation = [...partial.members];
    // 旧担当回数を引き継ぐ。重複名は左から順に消費し取り違えを防ぐ。
    const remaining = agg.session.rotation.map((name, i) => ({
      name,
      count: agg.session.driverCounts[i] ?? 0,
      used: false,
    }));
    const newDriverCounts = newRotation.map((name) => {
      const hit = remaining.find((r) => !r.used && r.name === name);
      if (hit) {
        hit.used = true;
        return hit.count;
      }
      return 0;
    });
    let newIndex = newRotation.indexOf(currentMember ?? "");
    if (newIndex < 0) newIndex = 0;

    session = {
      ...session,
      rotation: newRotation,
      currentIndex: Math.max(0, Math.min(newIndex, newRotation.length - 1)),
      driverCounts: newDriverCounts,
    };
  }

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
  return {
    ...agg,
    session: {
      ...agg.session,
      rotation: [...agg.session.rotation, participantId],
      driverCounts: [...agg.session.driverCounts, 0],
    },
  };
}

function evolveMemberRemoved(agg: Aggregate, index: number): Aggregate {
  const newRotation = agg.session.rotation.filter((_, i) => i !== index);
  const newDriverCounts = agg.session.driverCounts.filter((_, i) => i !== index);

  // currentIndex の調整
  let newIndex = agg.session.currentIndex;
  if (index < newIndex) {
    newIndex = newIndex - 1;
  } else if (index === newIndex) {
    newIndex = newIndex % newRotation.length;
  }

  return {
    ...agg,
    session: {
      ...agg.session,
      rotation: newRotation,
      currentIndex: Math.max(0, Math.min(newIndex, newRotation.length - 1)),
      driverCounts: newDriverCounts,
    },
  };
}

function evolveMemberMoved(
  agg: Aggregate,
  fromIndex: number,
  toIndex: number,
): Aggregate {
  const newRotation = [...agg.session.rotation];
  const newDriverCounts = [...agg.session.driverCounts];

  const [movedName] = newRotation.splice(fromIndex, 1);
  const [movedCount] = newDriverCounts.splice(fromIndex, 1);

  if (movedName !== undefined) {
    newRotation.splice(toIndex, 0, movedName);
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
 * 現ドライバー名を新しい位置へ remap する（位置ではなく名前で人を保持する）。
 */
function evolveMembersShuffled(agg: Aggregate, order: number[]): Aggregate {
  const oldRotation = agg.session.rotation;
  const oldCounts = agg.session.driverCounts;
  const currentName = oldRotation[agg.session.currentIndex];
  const newRotation = order.map((i) => oldRotation[i]!);
  const newDriverCounts = order.map((i) => oldCounts[i] ?? 0);
  const remapped = currentName !== undefined ? newRotation.indexOf(currentName) : -1;
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

/** リセット時に SessionConfig を集約から再構成する */
/**
 * リセット時に `initialAggregate` へ渡す一時的な設定を組む。
 *
 * `initialAggregate` は rotation を第2引数で受け取り `members` を見ない（D6b）ため、
 * ここの `members` は使われない。rotation は参加者IDの配列なので、これを表示名の一覧である
 * `members` に流し込むと「IDが名前として扱われる」誤りになる。空にして流用を封じる。
 */
function buildConfigFromReset(agg: Aggregate): SessionConfig {
  return {
    language: "TypeScript",
    difficulty: "easy",
    members: [],
    intervalMinutes:
      (agg.clock.intervalSeconds / 60) as IntervalMinutes,
  };
}
