/**
 * evolve 関数 — DomainEvent を適用して集約を更新する純粋関数
 * T013: FR-003, FR-007, FR-008
 */

import type { Aggregate, SessionConfig, IntervalMinutes } from "./aggregate.js";
import { initialAggregate } from "./aggregate.js";
import type { DomainEvent } from "./events.js";

/**
 * イベントを集約に適用し、新しい集約を返す純粋関数
 * 全域関数（全イベント型を処理）
 */
export function evolve(agg: Aggregate, event: DomainEvent, now: number): Aggregate {
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
      const config = buildConfigFromReset(agg);
      return initialAggregate(config);
    }

    case "PhaseSet":
      // PhaseSet はルーム全体に適用。集約（session+clock）には影響しない
      return agg;

    case "ConfigSet":
      return evolveConfigSet(agg, event.config, event.now);

    case "MemberAdded":
      return evolveMemberAdded(agg, event.name);

    case "MemberRemoved":
      return evolveMemberRemoved(agg, event.index);

    case "MemberMoved":
      return evolveMemberMoved(agg, event.fromIndex, event.toIndex);

    case "ProblemSet":
    case "HandoffNoteSet":
    case "BreakStarted":
    case "BreakEnded":
    case "SessionCompleted":
      // これらはルーム全体のフィールドに影響するが集約(session+clock)は変わらない
      return agg;
  }
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
  const addedMs =
    agg.clock.runningSince !== null ? now - agg.clock.runningSince : 0;

  return {
    session: {
      ...agg.session,
      isPaused: true,
    },
    clock: {
      ...agg.clock,
      running: false,
      accumulatedElapsedMs: agg.clock.accumulatedElapsedMs + addedMs,
      runningSince: null,
    },
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

function evolveConfigSet(
  agg: Aggregate,
  partial: Partial<SessionConfig>,
  _now: number,
): Aggregate {
  let session = agg.session;
  let clock = agg.clock;

  // members 指定時のみ rotation/driverCounts/currentIndex を再構築する。
  // 現ドライバー名を保持しつつ追従する（位置が見つからなければ 0 にクランプ）。
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

function evolveMemberAdded(agg: Aggregate, name: string): Aggregate {
  return {
    ...agg,
    session: {
      ...agg.session,
      rotation: [...agg.session.rotation, name],
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

/** リセット時に SessionConfig を集約から再構成する */
function buildConfigFromReset(agg: Aggregate): SessionConfig {
  return {
    language: "TypeScript",
    difficulty: "easy",
    members: [...agg.session.rotation],
    intervalMinutes:
      (agg.clock.intervalSeconds / 60) as IntervalMinutes,
  };
}
