/**
 * evolve 関数のテスト
 * T012: FR-003, FR-007, FR-008
 */

import { describe, it, expect } from "vitest";
import { evolve, advanceDriver } from "../src/evolve.js";
import { INITIAL_BREAK_STATE } from "../src/aggregate.js";
import { anAggregate, memberSeats, proxySeat, seatIds } from "./support/aggregate-builder.js";

const baseAgg = anAggregate().build();
const NOW = 1000000;

describe("evolve: SessionStarted", () => {
  it("セッション開始で clock.running=true になる", () => {
    const agg = evolve(baseAgg, { type: "SessionStarted", now: NOW }, NOW);
    expect(agg.clock.running).toBe(true);
  });

  it("anchorServerTime が now に設定される", () => {
    const agg = evolve(baseAgg, { type: "SessionStarted", now: NOW }, NOW);
    expect(agg.clock.anchorServerTime).toBe(NOW);
  });

  it("runningSince が now に設定される", () => {
    const agg = evolve(baseAgg, { type: "SessionStarted", now: NOW }, NOW);
    expect(agg.clock.runningSince).toBe(NOW);
  });
});

describe("evolve: DriverSwitched", () => {
  const runningAgg = {
    ...baseAgg,
    clock: {
      ...baseAgg.clock,
      running: true,
      anchorServerTime: NOW,
      secondsLeftAtAnchor: 300,
      runningSince: NOW,
    },
  };

  it("交代でインデックスが進む", () => {
    // Given
    const event = { type: "DriverSwitched", nextIndex: 1, now: NOW + 10000 } as const;
    // When
    const agg = evolve(runningAgg, event, NOW + 10000);
    // Then
    expect(agg.session.currentIndex).toBe(1);
  });

  it("交代で現ドライバーの driverCounts が加算される", () => {
    // Given
    const event = { type: "DriverSwitched", nextIndex: 1, now: NOW + 10000 } as const;
    // When
    const agg = evolve(runningAgg, event, NOW + 10000);
    // Then
    expect(agg.session.driverCounts[0]).toBe(1);
  });

  it("交代で totalSwitches が増加する", () => {
    // Given
    const event = { type: "DriverSwitched", nextIndex: 1, now: NOW + 10000 } as const;
    // When
    const agg = evolve(runningAgg, event, NOW + 10000);
    // Then
    expect(agg.session.totalSwitches).toBe(1);
  });

  it("交代後 clock アンカーが更新される", () => {
    // Given
    const switchTime = NOW + 10000;
    // When
    const agg = evolve(
      runningAgg,
      { type: "DriverSwitched", nextIndex: 1, now: switchTime },
      switchTime,
    );
    // Then
    expect(agg.clock.anchorServerTime).toBe(switchTime);
    expect(agg.clock.secondsLeftAtAnchor).toBe(runningAgg.clock.intervalSeconds);
  });
});

/**
 * B-2 統合: advanceDriver 準拠の意味論（交代先が現ドライバーと同じ＝交代とみなさない）。
 * 反例 [len=1, currentIndex=0, ineligible=∅]（driver-switch-equivalence.test.ts 由来）を
 * evolve(DriverSwitched) 単体の振る舞いとして固定する。
 *
 * @requirements FR-163, FR-164
 */
describe("evolve: DriverSwitched（nextIndex === prevIndex）", () => {
  const runningAgg = {
    ...baseAgg,
    session: { ...baseAgg.session, rotation: memberSeats("Alice"), driverCounts: [0], currentIndex: 0 },
    clock: {
      ...baseAgg.clock,
      running: true,
      anchorServerTime: NOW,
      secondsLeftAtAnchor: 300,
      runningSince: NOW,
    },
  };

  it("交代先が現ドライバーと同じなら driverCounts を加算しない", () => {
    // Given（輪1人。nextIndex はドライバー本人を指す）
    // When
    const agg = evolve(runningAgg, { type: "DriverSwitched", nextIndex: 0, now: NOW + 10000 }, NOW + 10000);
    // Then
    expect(agg.session.driverCounts).toEqual([0]);
  });

  it("交代先が現ドライバーと同じなら totalSwitches を加算しない", () => {
    // Given
    // When
    const agg = evolve(runningAgg, { type: "DriverSwitched", nextIndex: 0, now: NOW + 10000 }, NOW + 10000);
    // Then
    expect(agg.session.totalSwitches).toBe(runningAgg.session.totalSwitches);
  });

  it("交代先が現ドライバーと同じでも currentIndex は変わらない", () => {
    // Given
    // When
    const agg = evolve(runningAgg, { type: "DriverSwitched", nextIndex: 0, now: NOW + 10000 }, NOW + 10000);
    // Then
    expect(agg.session.currentIndex).toBe(0);
  });

  it("交代先が現ドライバーと同じでも、タイマーは満タンから再アンカーされる", () => {
    // Given
    const switchTime = NOW + 10000;
    // When
    const agg = evolve(runningAgg, { type: "DriverSwitched", nextIndex: 0, now: switchTime }, switchTime);
    // Then（無限ループ防止のため、加算しない場合でも再アンカーは必須）
    expect(agg.clock.anchorServerTime).toBe(switchTime);
    expect(agg.clock.secondsLeftAtAnchor).toBe(runningAgg.clock.intervalSeconds);
  });
});

/**
 * 直前に実際に運転した人（#374）。ナビ（⑦）は輪の上の 1 つ前の席ではなく、この人を指す。
 * 席は飛ばされる・強制指名で飛ぶ・並べ替えで動くので、識別子で持つ。
 */
describe("evolve: 直前のドライバー（#374）", () => {
  const running = () => anAggregate().withRotation("Alice", "Bob", "Charlie").running().build();
  const switchTo = (agg: ReturnType<typeof running>, nextIndex: number) =>
    evolve(agg, { type: "DriverSwitched", nextIndex, now: NOW + 10000 }, NOW + 10000);

  it("交代が起きる前は、直前のドライバーは居ない", () => {
    expect(running().session.previousDriverId).toBeNull();
  });

  it("飛ばされた席を挟んで交代しても、直前のドライバーは交代前の運転者（飛ばされた席の人ではない）", () => {
    // Given（Alice が運転中。Bob の席（添字 1）は不適格）
    // When（サーバーと同じ経路で、不適格な席を飛ばして交代する）
    const agg = advanceDriver(running(), new Set([1]), NOW + 10000);
    // Then（Bob を飛ばして Charlie へ。直前に運転したのは Alice）
    expect(agg.session.currentIndex).toBe(2);
    expect(agg.session.previousDriverId).toBe("Alice");
  });

  it("運転中の人が輪から外れたら、直前のドライバーはその人になる（2 つ前の人を残さない）", () => {
    // Given（Alice → Bob と交代済み。いまは Bob が運転中で、直前は Alice）
    const afterOne = switchTo(running(), 1);
    // When（運転中の Bob が輪から外れ、Charlie が運転者になる）
    const agg = evolve(afterOne, { type: "MemberRemoved", index: 1, nextDriverIndex: 1, now: NOW + 20000 }, NOW + 20000);
    // Then（直前に運転していたのは Bob。Alice は 2 つ前）
    expect(agg.session.rotation[agg.session.currentIndex]).toMatchObject({ participantId: "Charlie" });
    expect(agg.session.previousDriverId).toBe("Bob");
  });

  it("ロビーで先頭の席を外して入れ直し、開始しても、直前のドライバーは居ない（運転した人は居ない）", () => {
    // Given（まだ開始していない輪。先頭の Alice は「運転中の席」だが運転していない）
    const lobby = anAggregate().withRotation("Alice", "Bob", "Charlie").build();
    // When（Alice を外して入れ直し、開始する）
    const removed = evolve(lobby, { type: "MemberRemoved", index: 0, nextDriverIndex: 0, now: NOW }, NOW);
    const readded = evolve(removed, { type: "MemberAdded", participantId: "Alice", now: NOW }, NOW);
    const started = evolve(readded, { type: "SessionStarted", now: NOW }, NOW);
    // Then
    expect(removed.session.previousDriverId).toBeNull();
    expect(started.session.previousDriverId).toBeNull();
  });

  it("開始すると、前の名残の直前のドライバーは消える", () => {
    // Given（直前のドライバーが残った集約。止まっている）
    const stale = { ...baseAgg, session: { ...baseAgg.session, previousDriverId: "Alice" } };
    // When
    const started = evolve(stale, { type: "SessionStarted", now: NOW }, NOW);
    // Then
    expect(started.session.previousDriverId).toBeNull();
  });

  it("一時停止中に運転中の人が外れても、直前のドライバーはその人になる（セッションは続いている）", () => {
    // Given（Alice → Bob と交代して一時停止）
    const paused = evolve(switchTo(running(), 1), { type: "SessionPaused", now: NOW + 15000 }, NOW + 15000);
    // When
    const agg = evolve(paused, { type: "MemberRemoved", index: 1, nextDriverIndex: 1, now: NOW + 20000 }, NOW + 20000);
    // Then
    expect(agg.session.previousDriverId).toBe("Bob");
  });

  it("運転中でない人が輪から外れても、直前のドライバーは変わらない", () => {
    // Given（Alice → Bob。直前は Alice）
    const afterOne = switchTo(running(), 1);
    // When（運転していない Charlie が外れる）
    const agg = evolve(afterOne, { type: "MemberRemoved", index: 2, nextDriverIndex: 1, now: NOW + 20000 }, NOW + 20000);
    // Then
    expect(agg.session.previousDriverId).toBe("Alice");
  });

  it("交代先が現ドライバーと同じなら、直前のドライバーは変わらない", () => {
    // Given（Alice → Bob と交代済み）
    const afterOne = switchTo(running(), 1);
    // When（Bob のまま現状維持）
    const agg = switchTo(afterOne, 1);
    // Then
    expect(agg.session.previousDriverId).toBe("Alice");
  });

  it("並べ替えても、直前のドライバーは人に付いたまま", () => {
    // Given（Alice → Bob）
    const afterOne = switchTo(running(), 1);
    // When（並びを逆にする）
    const agg = evolve(afterOne, { type: "MembersShuffled", order: [2, 1, 0], now: NOW }, NOW);
    // Then
    expect(agg.session.previousDriverId).toBe("Alice");
  });

  it("リセットすると、直前のドライバーは居なくなる", () => {
    const afterOne = switchTo(running(), 1);
    const agg = evolve(afterOne, { type: "SessionReset", now: NOW + 20000 }, NOW + 20000);
    expect(agg.session.previousDriverId).toBeNull();
  });
});

describe("evolve: SessionPaused / SessionResumed", () => {
  const runningAgg = {
    ...baseAgg,
    clock: {
      ...baseAgg.clock,
      running: true,
      anchorServerTime: NOW,
      secondsLeftAtAnchor: 300,
      accumulatedElapsedMs: 5000,
      runningSince: NOW - 10000,
    },
  };

  it("PAUSE で running=false, isPaused=true になる", () => {
    // Given
    const pauseTime = NOW + 5000;
    // When
    const agg = evolve(
      runningAgg,
      { type: "SessionPaused", now: pauseTime },
      pauseTime,
    );
    // Then
    expect(agg.clock.running).toBe(false);
    expect(agg.session.isPaused).toBe(true);
  });

  it("PAUSE で稼働区間が accumulatedElapsedMs に加算される（停止除外）", () => {
    // Given
    const pauseTime = NOW + 5000;
    // When
    const agg = evolve(
      runningAgg,
      { type: "SessionPaused", now: pauseTime },
      pauseTime,
    );
    // Then（runningSince = NOW - 10000, pauseTime = NOW + 5000 → +15000ms）
    expect(agg.clock.accumulatedElapsedMs).toBe(5000 + 15000);
    expect(agg.clock.runningSince).toBeNull();
  });

  it("RESUME で running=true, isPaused=false になる", () => {
    // Given
    const pausedAgg = {
      ...baseAgg,
      session: { ...baseAgg.session, isPaused: true },
      clock: {
        ...baseAgg.clock,
        running: false,
        secondsLeftAtAnchor: 250,
        runningSince: null,
      },
    };
    const resumeTime = NOW + 20000;
    // When
    const agg = evolve(
      pausedAgg,
      { type: "SessionResumed", now: resumeTime },
      resumeTime,
    );
    // Then
    expect(agg.clock.running).toBe(true);
    expect(agg.session.isPaused).toBe(false);
    expect(agg.clock.runningSince).toBe(resumeTime);
    expect(agg.clock.anchorServerTime).toBe(resumeTime);
  });
});

/**
 * @requirements FR-008
 */
describe("evolve: 不変条件", () => {
  it("rotation.length === driverCounts.length が常に成立する", () => {
    // Given（メンバー追加 → 削除の順で操作する）
    const addEvent = { type: "MemberAdded", participantId: "Dave", now: NOW } as const;
    const removeEvent = { type: "MemberRemoved", index: 0, nextDriverIndex: 0, now: NOW } as const;
    // When
    const agg1 = evolve(baseAgg, addEvent, NOW);
    const agg2 = evolve(agg1, removeEvent, NOW);
    // Then（各操作後に不変条件を確認する）
    expect(agg1.session.rotation.length).toBe(agg1.session.driverCounts.length);
    expect(agg2.session.rotation.length).toBe(agg2.session.driverCounts.length);
  });

  it("currentIndex は rotation.length 未満に収まる", () => {
    // Given
    const event = { type: "DriverSwitched", nextIndex: 0, now: NOW } as const;
    // When
    const agg = evolve(baseAgg, event, NOW);
    // Then
    expect(agg.session.currentIndex).toBeLessThan(agg.session.rotation.length);
  });
});

// ─── advanceDriver（eligible を尊重する交代ヘルパ）──────────────────────────────
describe("advanceDriver: ineligible を飛ばす交代（plan.md L194/L209）", () => {
  const runningAgg = {
    ...baseAgg,
    clock: {
      ...baseAgg.clock,
      running: true,
      anchorServerTime: NOW,
      secondsLeftAtAnchor: 300,
      runningSince: NOW,
    },
  };

  it("全員 eligible のときは次のインデックスへ進み交代相当になる", () => {
    // Given（ineligible の指定なし = 全員 eligible）
    const ineligible = undefined;
    // When
    const agg = advanceDriver(runningAgg, ineligible, NOW + 10000);
    // Then（交代相当: タイマーが次担当でリセットされる）
    expect(agg.session.currentIndex).toBe(1);
    expect(agg.session.totalSwitches).toBe(1);
    expect(agg.clock.anchorServerTime).toBe(NOW + 10000);
    expect(agg.clock.secondsLeftAtAnchor).toBe(runningAgg.clock.intervalSeconds);
  });

  it("次が ineligible のときはスキップしてその次の eligible へ進む", () => {
    // When（currentIndex=0、Bob(1) が ineligible → Charlie(2) へ）
    const agg = advanceDriver(runningAgg, new Set([1]), NOW + 10000);
    // Then
    expect(agg.session.currentIndex).toBe(2);
  });

  it("全員 ineligible のときは現状維持しつつタイマーのみ再アンカーする（無限ループ防止）", () => {
    // Given（全員 ineligible）
    const ineligible = new Set([0, 1, 2]);
    // When
    const agg = advanceDriver(runningAgg, ineligible, NOW + 10000);
    // Then（現ドライバーは維持しつつ、残り0で即再発火する無限ループを防ぐためタイマーは再アンカーされる）
    expect(agg.session.currentIndex).toBe(0);
    expect(agg.session.totalSwitches).toBe(0);
    expect(agg.clock.anchorServerTime).toBe(NOW + 10000);
    expect(agg.clock.secondsLeftAtAnchor).toBe(runningAgg.clock.intervalSeconds);
  });

  it("交代後も rotation.length === driverCounts.length が保たれる", () => {
    const agg = advanceDriver(runningAgg, new Set([1]), NOW + 10000);
    expect(agg.session.rotation.length).toBe(agg.session.driverCounts.length);
  });
});

// ─── evolve: ConfigSet（coverage-supplement.test.ts より移動・T036） ──
//
// ⚠ かつてここには `members` から rotation/driverCounts を組み直す挙動を固定する
// 2 本があった。#95 S4a で `TimerConfig` から `members` が消え、**輪の出入りは
// member.add/remove/move・addProxy・participant.remove だけが担う**ようになったので、
// その性質は概念ごと無くなった（設計正本 §6.5）。残っているのは間隔の反映だけである。

describe("evolve: ConfigSet", () => {
  it("intervalMinutes 変更は停止中なら新間隔で初期化する", () => {
    // Given
    const agg = anAggregate().build();
    // When
    const next = evolve(agg, { type: "ConfigSet", config: { intervalMinutes: 10 }, now: NOW }, NOW);
    // Then
    expect(next.clock.intervalSeconds).toBe(600);
    expect(next.clock.secondsLeftAtAnchor).toBe(600);
  });

  it("稼働中の間隔変更は残り時間を凍結する", () => {
    // Given
    let agg = anAggregate().build();
    agg = evolve(agg, { type: "SessionStarted", now: NOW }, NOW); // running
    agg = { ...agg, clock: { ...agg.clock, secondsLeftAtAnchor: 123 } };
    // When
    const next = evolve(agg, { type: "ConfigSet", config: { intervalMinutes: 7 }, now: NOW }, NOW);
    // Then（稼働中は残り時間を凍結し新間隔で初期化しない）
    expect(next.clock.intervalSeconds).toBe(420);
    expect(next.clock.secondsLeftAtAnchor).toBe(123);
  });
});

describe("evolve: MemberMoved", () => {
  it("代理の席を移動しても席の中身は保たれる（ラベルが落ちない）", () => {
    // Given（Bob の席が代理。名簿に居ない人が輪に並んでいる・#95 S4a D6）
    let agg = anAggregate()
      .withSeats(
        { kind: "member", participantId: "Alice", eligible: true },
        proxySeat("Bob", "同席のボブ"),
        { kind: "member", participantId: "Charlie", eligible: true },
      )
      .build();
    agg = { ...agg, session: { ...agg.session, driverCounts: [1, 2, 3], currentIndex: 1 } };
    // When（代理の席を先頭へ動かす）
    const next = evolve(agg, { type: "MemberMoved", fromIndex: 1, toIndex: 0, now: NOW }, NOW);
    // Then
    expect(seatIds(next.session.rotation)).toEqual(["Bob", "Alice", "Charlie"]);
    expect(next.session.rotation[0]).toEqual({
      kind: "proxy",
      id: "Bob",
      label: "同席のボブ",
      eligible: true,
    });
    expect(next.session.driverCounts).toEqual([2, 1, 3]);
    expect(next.session.currentIndex).toBe(0);
  });

  it("メンバーを移動すると rotation と driverCounts が同じ並びで動く", () => {
    // Given
    let agg = anAggregate().build();
    agg = { ...agg, session: { ...agg.session, driverCounts: [1, 2, 3], currentIndex: 0 } };
    // When
    const next = evolve(agg, { type: "MemberMoved", fromIndex: 0, toIndex: 2, now: NOW }, NOW);
    // Then
    expect(seatIds(next.session.rotation)).toEqual(["Bob", "Charlie", "Alice"]);
    expect(next.session.driverCounts).toEqual([2, 3, 1]);
    // 現ドライバー(Alice)は index 0→2 へ追従
    expect(next.session.currentIndex).toBe(2);
  });
});

describe("evolve: SessionReset", () => {
  // v2.3 #3: リセットは「最初から再スタート（走行）」になった（旧仕様は clock 停止だった）。
  it("リセットで集約が初期化され clock が走行状態で再スタートする", () => {
    // Given
    let agg = anAggregate().build();
    agg = evolve(agg, { type: "SessionStarted", now: NOW }, NOW);
    // When
    const reset = evolve(agg, { type: "SessionReset", now: NOW + 5000 }, NOW + 5000);
    // Then（デフォルト間隔5分=300秒で再初期化される）
    expect(reset.clock.running).toBe(true);
    expect(reset.clock.anchorServerTime).toBe(NOW + 5000);
    expect(reset.clock.runningSince).toBe(NOW + 5000);
    expect(reset.clock.secondsLeftAtAnchor).toBe(300);
    expect(seatIds(reset.session.rotation)).toEqual(["Alice", "Bob", "Charlie"]);
    expect(reset.session.totalSwitches).toBe(0);
  });
});

describe("evolve: MemberRemoved で輪が空になる（#376）", () => {
  // `decide` は最後の 1 人の `member.remove` を拒むので、通常の経路からは届かない。
  // evolve は全域関数なので、イベントを直接渡されても `NaN` を含まない集約を返す。
  it("Given 1 人の輪 / When その 1 人の MemberRemoved / Then 輪と担当回数が空になり currentIndex は 0", () => {
    // Given
    const agg = anAggregate().withRotation("Alice").build();
    // When
    const next = evolve(agg, { type: "MemberRemoved", index: 0, nextDriverIndex: 0, now: NOW }, NOW);
    // Then
    expect(next.session.rotation).toEqual([]);
    expect(next.session.driverCounts).toEqual([]);
    expect(next.session.currentIndex).toBe(0);
  });

  it("Given 空になった輪 / When MemberAdded / Then 足した人が currentIndex 0 の担当になる", () => {
    // Given
    const emptied = evolve(anAggregate().withRotation("Alice").build(), { type: "MemberRemoved", index: 0, nextDriverIndex: 0, now: NOW }, NOW);
    // When
    const next = evolve(emptied, { type: "MemberAdded", participantId: "Bob", now: NOW }, NOW);
    // Then
    expect(seatIds(next.session.rotation)).toEqual(["Bob"]);
    expect(next.session.currentIndex).toBe(0);
  });

  it("Given 走っている 1 人の輪 / When その 1 人の MemberRemoved / Then 時計は残量を凍結して止まり、一時停止になる", () => {
    // Given（NOW に走り出した輪。30 秒後に外す）
    const agg = anAggregate().withRotation("Alice").running().build();
    // When
    const next = evolve(agg, { type: "MemberRemoved", index: 0, nextDriverIndex: 0, now: NOW + 30_000 }, NOW + 30_000);
    // Then（SessionPaused と同じ表現。再開ボタンは isPaused のときだけ押せる）
    expect(next.clock.running).toBe(false);
    expect(next.clock.runningSince).toBeNull();
    expect(next.clock.secondsLeftAtAnchor).toBe(agg.clock.secondsLeftAtAnchor - 30);
    expect(next.session.isPaused).toBe(true);
  });

  it.each(["SessionStarted", "SessionResumed", "BreakEnded", "DriverTimerReset", "SessionReset"] as const)(
    "Given 空になった輪 / When %s / Then 時計は回らない",
    (type) => {
      // Given
      const emptied = evolve(anAggregate().withRotation("Alice").running().build(), { type: "MemberRemoved", index: 0, nextDriverIndex: 0, now: NOW }, NOW);
      // When
      const next = evolve(emptied, { type, now: NOW + 1000 }, NOW + 1000);
      // Then
      expect(next.clock.running).toBe(false);
      expect(next.session.isPaused).toBe(true);
    },
  );
});

describe("evolve: 休憩中に輪が空になる（#376）", () => {
  // 休憩は isPaused を使わない（evolveBreakStarted）。空の輪で止めるのは「走っている時計」だけで、
  // 休憩で止まっている時計には isPaused を立てない。
  it("Given 休憩中の 1 人の輪 / When 外して席を足し直し BreakEnded / Then 一時停止にならず走り出す", () => {
    // Given
    let agg = anAggregate().withRotation("Alice").running().build();
    agg = evolve(agg, { type: "BreakStarted", now: NOW + 1000 }, NOW + 1000);
    // When
    agg = evolve(agg, { type: "MemberRemoved", index: 0, nextDriverIndex: 0, now: NOW + 2000 }, NOW + 2000);
    const emptied = agg;
    agg = evolve(agg, { type: "MemberAdded", participantId: "Bob", now: NOW + 3000 }, NOW + 3000);
    agg = evolve(agg, { type: "BreakEnded", now: NOW + 4000 }, NOW + 4000);
    // Then
    expect(agg.session.break.since).toBeNull();
    expect(emptied.session.isPaused).toBe(false);
    expect(emptied.clock.running).toBe(false);
    expect(agg.clock.running).toBe(true);
  });

  it("Given 走っていない空の輪 / When BreakStarted / Then isPaused を立てない", () => {
    // Given（開始前の 1 人の輪を空にする）
    const emptied = evolve(anAggregate().withRotation("Alice").build(), { type: "MemberRemoved", index: 0, nextDriverIndex: 0, now: NOW }, NOW);
    // When
    const next = evolve(emptied, { type: "BreakStarted", now: NOW + 1000 }, NOW + 1000);
    // Then
    expect(next.session.isPaused).toBe(false);
    expect(next.clock.running).toBe(false);
    expect(next.session.break.since).toBe(NOW + 1000);
  });
});

describe("evolve: 運転中の人を外したときの次の担当（#376）", () => {
  const agg = anAggregate().withRotation("A", "B", "C", "D").withCurrentDriver(1).build();

  it("Given B が運転中 / When B を外し nextDriverIndex=2 / Then 担当は D（decide が資格で選んだ席）", () => {
    const next = evolve(agg, { type: "MemberRemoved", index: 1, nextDriverIndex: 2, now: NOW }, NOW);
    expect(seatIds(next.session.rotation)[next.session.currentIndex]).toBe("D");
  });

  // 範囲外の nextDriverIndex は、ほかの不正な入力と同じく集約を変えない（位置で次の席へ倒さない）
  it.each([-1, 3, 0.5])("Given B が運転中 / When nextDriverIndex=%s（範囲外） / Then 集約を変えない", (nextDriverIndex) => {
    const next = evolve(agg, { type: "MemberRemoved", index: 1, nextDriverIndex, now: NOW }, NOW);
    expect(next).toEqual(agg);
  });

  it("Given B が運転中 / When 運転者でない A を外すが nextDriverIndex が範囲外 / Then 集約を変えない（イベントごと不正）", () => {
    const next = evolve(agg, { type: "MemberRemoved", index: 0, nextDriverIndex: 3, now: NOW }, NOW);
    expect(next).toEqual(agg);
  });

  it("Given B が運転中 / When A を外す（運転者ではない） / Then nextDriverIndex は見ず、担当は B のまま", () => {
    const next = evolve(agg, { type: "MemberRemoved", index: 0, nextDriverIndex: 2, now: NOW }, NOW);
    expect(seatIds(next.session.rotation)[next.session.currentIndex]).toBe("B");
  });
});

describe("evolve: 範囲外の添字の MemberRemoved / MemberMoved は集約を変えない（#376）", () => {
  // `decide` は範囲外の添字を InvalidIndex で拒むので、通常の経路からは届かない。
  const agg = (() => {
    const a = anAggregate().withRotation("Alice", "Bob", "Charlie").build();
    return { ...a, session: { ...a.session, currentIndex: 2 } };
  })();

  it.each([-1, 3, 4, 0.5])("MemberRemoved の index が %s", (index) => {
    // When
    const next = evolve(agg, { type: "MemberRemoved", index, nextDriverIndex: 0, now: NOW }, NOW);
    // Then
    expect(next).toEqual(agg);
  });

  it.each([
    [-1, 0],
    [0, -1],
    [3, 0],
    [0, 3],
    [0.5, 2],
    [0, 1.5],
  ])("MemberMoved の fromIndex=%s・toIndex=%s", (fromIndex, toIndex) => {
    // When
    const next = evolve(agg, { type: "MemberMoved", fromIndex, toIndex, now: NOW }, NOW);
    // Then
    expect(next).toEqual(agg);
  });

  it.each([-1, 3, 4, 0.5])("DriverSwitched の nextIndex が %s", (nextIndex) => {
    // When（現ドライバーと違う範囲外の番号。範囲内なら交代と再アンカーが起きる）
    const next = evolve(agg, { type: "DriverSwitched", nextIndex, now: NOW + 1000 }, NOW + 1000);
    // Then
    expect(next).toEqual(agg);
  });

  it.each([
    [[0, 1]],
    [[0, 1, 2, 3]],
    [[0, 1, 2, 0]], // 長く、重複で集合の大きさだけは輪の長さに一致する
    [[0, 0, 1]],
    [[0, 1, 3]],
    [[-1, 0, 1]],
    [[0, 1, 1.5]],
  ])("MembersShuffled の order が順列でない（%j）", (order) => {
    // When
    const next = evolve(agg, { type: "MembersShuffled", order, now: NOW }, NOW);
    // Then
    expect(next).toEqual(agg);
  });
});

describe("evolve: MemberRemoved / MemberMoved の index 調整分岐", () => {
  it("現ドライバーより前を削除すると currentIndex が 1 減る", () => {
    // Given（[Alice,Bob,Charlie]）
    let agg = anAggregate().build();
    agg = { ...agg, session: { ...agg.session, currentIndex: 2 } };
    // When
    const next = evolve(agg, { type: "MemberRemoved", index: 0, nextDriverIndex: 0, now: NOW }, NOW);
    // Then
    expect(seatIds(next.session.rotation)).toEqual(["Bob", "Charlie"]);
    expect(next.session.currentIndex).toBe(1);
  });

  it("現ドライバーより後ろから前へ移動すると currentIndex が 1 増える", () => {
    // Given
    let agg = anAggregate().build();
    agg = { ...agg, session: { ...agg.session, currentIndex: 1 } };
    // When（index2(Charlie) を index0 へ。fromIndex(2)>cur(1) かつ toIndex(0)<=cur(1) → cur++）
    const next = evolve(agg, { type: "MemberMoved", fromIndex: 2, toIndex: 0, now: NOW }, NOW);
    // Then
    expect(seatIds(next.session.rotation)).toEqual(["Charlie", "Alice", "Bob"]);
    expect(next.session.currentIndex).toBe(2);
  });

  it("現ドライバーより前から後ろへ移動すると currentIndex が 1 減る", () => {
    // Given
    let agg = anAggregate().build();
    agg = { ...agg, session: { ...agg.session, currentIndex: 1 } };
    // When（index0(Alice) を index2 へ。fromIndex(0)<cur(1) かつ toIndex(2)>=cur(1) → cur--）
    const next = evolve(agg, { type: "MemberMoved", fromIndex: 0, toIndex: 2, now: NOW }, NOW);
    // Then
    expect(seatIds(next.session.rotation)).toEqual(["Bob", "Charlie", "Alice"]);
    expect(next.session.currentIndex).toBe(0);
  });
});

describe("ロビーへ戻すと時計を止め、休憩を畳む（PR #416 のレビュー）", () => {
  it.each(["setup", "ready", "celebration"] as const)(
    "Given 休憩中 / When PhaseSet %s / Then 休憩は畳まれ、時計は止まったまま",
    (phase) => {
      let agg = evolve(anAggregate().withRotation("a", "b").build(), { type: "SessionStarted", now: NOW }, NOW);
      agg = evolve(agg, { type: "BreakStarted", now: NOW + 1000 }, NOW + 1000);
      const next = evolve(agg, { type: "PhaseSet", phase, now: NOW + 2000 }, NOW + 2000);
      expect(next.session.break.since).toBeNull();
      expect(next.clock.running).toBe(false);
      // 休憩を畳んでも、そのあとの BreakEnded で走り出さない
      expect(evolve(next, { type: "BreakEnded", now: NOW + 3000 }, NOW + 3000).clock.running).toBe(false);
    },
  );

  it("Given 走っている集約 / When PhaseSet setup / Then 時計は止まり、稼働の累計を確定する", () => {
    const agg = evolve(anAggregate().withRotation("a", "b").build(), { type: "SessionStarted", now: NOW }, NOW);
    const next = evolve(agg, { type: "PhaseSet", phase: "setup", now: NOW + 5000 }, NOW + 5000);
    expect(next.clock.running).toBe(false);
    expect(next.clock.accumulatedElapsedMs).toBe(5000);
  });

  it("Given 休憩中 / When PhaseSet session / Then 集約を変えない", () => {
    let agg = evolve(anAggregate().withRotation("a", "b").build(), { type: "SessionStarted", now: NOW }, NOW);
    agg = evolve(agg, { type: "BreakStarted", now: NOW + 1000 }, NOW + 1000);
    expect(evolve(agg, { type: "PhaseSet", phase: "session", now: NOW + 2000 }, NOW + 2000)).toEqual(agg);
  });
});

describe("完成・中断は時計を止め、休憩を畳む（#402 設計 §3.5）", () => {
  it.each(["SessionCompleted", "SessionAborted"] as const)(
    "Given 休憩を経た走っている集約 / When %s / Then 時計は止まり、休憩の状態は初期値に戻る",
    (type) => {
      let agg = evolve(anAggregate().withRotation("a", "b").build(), { type: "SessionStarted", now: NOW }, NOW);
      agg = evolve(agg, { type: "BreakStarted", now: NOW + 1000 }, NOW + 1000);
      agg = evolve(agg, { type: "BreakEnded", now: NOW + 2000 }, NOW + 2000);
      const event =
        type === "SessionCompleted"
          ? ({ type, now: NOW + 3000, topicTitle: null } as const)
          : ({ type, now: NOW + 3000 } as const);
      const next = evolve(agg, event, NOW + 3000);
      expect(next.clock.running).toBe(false);
      expect(next.clock.accumulatedElapsedMs).toBe(2000);
      expect(next.session.break).toEqual(INITIAL_BREAK_STATE);
    },
  );

  // 完成・中断で止まった集約に、ロビーを経ずに START が届くと（一時停止 → 完成 → 開始の取り違えなど）、
  // 回数と稼働時間は残る。基準を 0 に戻すと、残った値の分だけ開始直後に休憩の条件を満たす（PR #416 のレビュー）。
  it("Given 交代 6 回・稼働 40 分の止まった集約 / When SessionStarted / Then 休憩の基準はいまの値になる", () => {
    const base = anAggregate().withRotation("a", "b").build();
    const stopped = {
      session: { ...base.session, totalSwitches: 6 },
      clock: { ...base.clock, accumulatedElapsedMs: 40 * 60_000 },
    };
    const next = evolve(stopped, { type: "SessionStarted", now: NOW }, NOW);
    expect(next.session.break).toEqual({ since: null, baseline: { elapsedMs: 40 * 60_000, switches: 6 }, suggestedAt: null });
  });

  it("Given 休憩の印が残る集約 / When SessionStarted / Then 休憩の状態は初期値", () => {
    const base = anAggregate().withRotation("a", "b").build();
    const dirty = {
      ...base,
      session: {
        ...base.session,
        break: { since: null, baseline: { elapsedMs: 5, switches: 5 }, suggestedAt: { elapsedMs: 5, switches: 5 } },
      },
    };
    expect(evolve(dirty, { type: "SessionStarted", now: NOW }, NOW).session.break).toEqual(INITIAL_BREAK_STATE);
  });
});
