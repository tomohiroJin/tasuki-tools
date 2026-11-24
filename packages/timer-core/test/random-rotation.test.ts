/**
 * ランダム交代のモード（#660）。
 *
 * 交代のたびに、**この周でまだ運転していない適格な人**から次のドライバーを引く。引く順（`order`）は
 * サーバーが作った順列で、集約が持つ。次に替わる人はその順から決まるので、予告（snapshot の「次」）と
 * 実際の交代先は同じ関数（`nextDriverIndex`）の同じ答えになる。
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { decide } from "../src/decide.js";
import { advanceDriver, evolve } from "../src/evolve.js";
import { initialAggregate, nextDriverIndex, rotationEntryId } from "../src/aggregate.js";
import type { Aggregate } from "../src/aggregate.js";
import { anAggregate, memberSeats, NOW } from "./support/aggregate-builder.js";

const LATER = NOW + 60_000;

/** decide が返したイベントを順に当てる。失敗したら前提の誤りとして投げる。 */
function run(agg: Aggregate, cmd: Parameters<typeof decide>[0], now = LATER): Aggregate {
  const events = decide(cmd, agg, now)._unsafeUnwrap();
  return events.reduce((acc, event) => evolve(acc, event, now), agg);
}

function driverId(agg: Aggregate): string {
  return rotationEntryId(agg.session.rotation[agg.session.currentIndex]!);
}

/** 予告（次に替わる人の識別子）。居なければ null。 */
function forecastId(agg: Aggregate, ineligible?: ReadonlySet<number>): string | null {
  const next = nextDriverIndex(agg.session, agg.session.currentIndex, ineligible);
  return next === agg.session.currentIndex ? null : rotationEntryId(agg.session.rotation[next]!);
}

describe("nextDriverIndex: 輪の順のモード", () => {
  it("ランダム交代でなければ、輪の上の次の適格な席を返す", () => {
    const agg = anAggregate().withRotation("a", "b", "c").withCurrentDriver(0).running().build();

    expect(agg.session.randomRotation).toBeNull();
    expect(nextDriverIndex(agg.session, 0, new Set([1]))).toBe(2);
  });
});

describe("nextDriverIndex: ランダム交代の抽選", () => {
  it("引く順の先頭から、まだ運転していない人を選ぶ", () => {
    const agg = anAggregate().withRotation("a", "b", "c", "d").withRandomRotation(["c", "a", "d", "b"]).running().build();

    expect(forecastId(agg)).toBe("c");
  });

  it("この周で運転した人は飛ばす", () => {
    const agg = anAggregate()
      .withRotation("a", "b", "c", "d")
      .withRandomRotation(["c", "a", "d", "b"], ["a", "c"])
      .running()
      .build();

    expect(forecastId(agg)).toBe("d");
  });

  it("適格でない人は飛ばす", () => {
    const agg = anAggregate().withRotation("a", "b", "c", "d").withRandomRotation(["c", "a", "d", "b"]).running().build();

    // c（添字 2）が一時離脱
    expect(forecastId(agg, new Set([2]))).toBe("d");
  });

  it("いまの運転者は、引く順の先頭に居ても選ばない", () => {
    const agg = anAggregate().withRotation("a", "b", "c").withRandomRotation(["a", "b", "c"], []).running().build();

    expect(forecastId(agg)).toBe("b");
  });

  it("適格な全員が運転し終えていたら、次の周として引く順の先頭の適格な人を選ぶ", () => {
    const agg = anAggregate()
      .withRotation("a", "b", "c")
      .withCurrentDriver(2)
      .withRandomRotation(["c", "b", "a"], ["a", "b", "c"])
      .running()
      .build();

    // c はいまの運転者なので飛ばし、b が次の周の最初になる
    expect(forecastId(agg)).toBe("b");
  });

  it("まだ運転していない人が適格でなければ、運転し終えた適格な人へ回す（次の周）", () => {
    const agg = anAggregate()
      .withRotation("a", "b", "c")
      .withRandomRotation(["c", "b", "a"], ["a", "b"])
      .running()
      .build();

    // c（添字 2）だけが未運転だが、適格でない
    expect(forecastId(agg, new Set([2]))).toBe("b");
  });

  it("ほかの全員が適格でなければ、いまの運転者のまま", () => {
    const agg = anAggregate().withRotation("a", "b", "c").withRandomRotation(["c", "b", "a"]).running().build();

    expect(nextDriverIndex(agg.session, 0, new Set([1, 2]))).toBe(0);
  });

  it("全員が適格でなくても、いまの運転者のまま", () => {
    const agg = anAggregate().withRotation("a", "b", "c").withRandomRotation(["c", "b", "a"]).running().build();

    expect(nextDriverIndex(agg.session, 0, new Set([0, 1, 2]))).toBe(0);
  });

  it("1 人の輪では、自分を返す", () => {
    const agg = anAggregate().withRotation("a").withRandomRotation(["a"]).running().build();

    expect(nextDriverIndex(agg.session, 0, undefined)).toBe(0);
  });

  it("空の輪では 0 を返す", () => {
    expect(nextDriverIndex({ rotation: [], randomRotation: { order: [], drove: [] } }, 0, undefined)).toBe(0);
  });

  it("引く順に居ない席（引いた後に入った人）は、引く順の人の後ろに、輪の順で並ぶ", () => {
    // 引く順は a・b だけ。c・d は後から入った
    const agg = anAggregate().withRotation("a", "b", "c", "d").withRandomRotation(["b", "a"]).running().build();

    expect(forecastId(agg)).toBe("b");
    // b が適格でなければ、後から入った人のうち輪の順で先の c
    expect(forecastId(agg, new Set([1]))).toBe("c");
    expect(forecastId(agg, new Set([1, 2]))).toBe("d");
  });

  it("引く順に居ない席でも、まだ運転していなければ、運転し終えた人より先に選ぶ", () => {
    const agg = anAggregate().withRotation("a", "b", "c").withRandomRotation(["b", "a"], ["a", "b"]).running().build();

    expect(forecastId(agg)).toBe("c");
  });

  it("引く順に、輪に居ない識別子・同じ識別子が混ざっていても、輪の席だけを 1 回ずつ見る", () => {
    const agg = anAggregate()
      .withRotation("a", "b", "c")
      .withRandomRotation(["gone", "c", "c", "b"], ["a", "c"])
      .running()
      .build();

    expect(forecastId(agg)).toBe("b");
  });
});

describe("decide: ランダム交代の SWITCH", () => {
  it("予告した人へ替わり、その人をこの周で運転した人に足す", () => {
    const agg = anAggregate().withRotation("a", "b", "c", "d").withRandomRotation(["c", "a", "d", "b"]).running().build();

    const next = run(agg, { command: "session.act", action: "SWITCH" });

    expect(driverId(next)).toBe("c");
    expect(next.session.randomRotation).toEqual({ order: ["c", "a", "d", "b"], drove: ["a", "c"] });
  });

  it("サーバーが渡した順列で、引く順を作り直す", () => {
    const agg = anAggregate().withRotation("a", "b", "c", "d").withRandomRotation(["c", "a", "d", "b"]).running().build();

    const next = run(agg, { command: "session.act", action: "SWITCH", randomOrder: [3, 1, 0, 2] });

    // 交代先は作り直す前の順で決まる（予告と同じ人）。次の交代からは新しい順
    expect(driverId(next)).toBe("c");
    expect(next.session.randomRotation).toEqual({ order: ["d", "b", "a", "c"], drove: ["a", "c"] });
    expect(forecastId(next)).toBe("d");
  });

  it("適格な全員が運転し終えたら、次の周を始める（運転した人は交代先の 1 人だけになる）", () => {
    const agg = anAggregate()
      .withRotation("a", "b", "c")
      .withCurrentDriver(2)
      .withRandomRotation(["c", "b", "a"], ["a", "b", "c"])
      .running()
      .build();

    const next = run(agg, { command: "session.act", action: "SWITCH" });

    expect(driverId(next)).toBe("b");
    expect(next.session.randomRotation?.drove).toEqual(["b"]);
  });

  it("適格でない席を飛ばす", () => {
    const agg = anAggregate().withRotation("a", "b", "c", "d").withRandomRotation(["c", "a", "d", "b"]).running().build();

    const next = run(agg, { command: "session.act", action: "SWITCH", ineligible: new Set([2]) });

    expect(driverId(next)).toBe("d");
  });

  it("ほかに適格な人が居なければ、運転者も袋も変えず、時計だけ満タンに戻す", () => {
    const agg = anAggregate().withRotation("a", "b").withRandomRotation(["b", "a"]).running().build();

    const next = run(agg, { command: "session.act", action: "SWITCH", ineligible: new Set([1]), randomOrder: [0, 1] });

    expect(driverId(next)).toBe("a");
    expect(next.session.totalSwitches).toBe(0);
    expect(next.session.randomRotation).toEqual({ order: ["b", "a"], drove: ["a"] });
    expect(next.clock.anchorServerTime).toBe(LATER);
  });

  it("ナビゲーター（直前に実際に運転した人）は、交代前の運転者になる", () => {
    const agg = anAggregate().withRotation("a", "b", "c", "d").withRandomRotation(["d", "b", "c", "a"]).running().build();

    const once = run(agg, { command: "session.act", action: "SWITCH" });
    const twice = run(once, { command: "session.act", action: "SWITCH" });

    expect(driverId(once)).toBe("d");
    expect(once.session.previousDriverId).toBe("a");
    expect(driverId(twice)).toBe("b");
    expect(twice.session.previousDriverId).toBe("d");
  });

  it.each([
    ["重複", [0, 0, 1]],
    ["範囲外", [0, 1, 3]],
    ["長さが足りない", [0, 1]],
    ["整数でない", [0, 1, 1.5]],
  ])("順列でない randomOrder（%s）は InvalidIndex で断る", (_label, randomOrder) => {
    const agg = anAggregate().withRotation("a", "b", "c").withRandomRotation(["b", "c", "a"]).running().build();

    const result = decide({ command: "session.act", action: "SWITCH", randomOrder }, agg, LATER);

    expect(result._unsafeUnwrapErr().type).toBe("InvalidIndex");
  });

  it("輪の順のモードでは randomOrder を見ない（順列でなくても断らず、輪の次へ替わる）", () => {
    const agg = anAggregate().withRotation("a", "b", "c").running().build();

    const result = decide({ command: "session.act", action: "SWITCH", randomOrder: [9] }, agg, LATER);

    expect(result._unsafeUnwrap()).toEqual([{ type: "DriverSwitched", nextIndex: 1, now: LATER }]);
  });
});

describe("advanceDriver: ランダム交代（時間切れ・繰り上げ）", () => {
  it("予告した人へ替わり、渡した順列で引く順を作り直す", () => {
    const agg = anAggregate().withRotation("a", "b", "c").withRandomRotation(["c", "b", "a"]).running().build();
    const forecast = forecastId(agg);

    const next = advanceDriver(agg, undefined, LATER, [1, 0, 2]);

    expect(driverId(next)).toBe(forecast);
    expect(next.session.randomRotation).toEqual({ order: ["b", "a", "c"], drove: ["a", "c"] });
  });

  it("順列でない randomOrder を渡されたら、引く順を作り直さずに替わる", () => {
    const agg = anAggregate().withRotation("a", "b", "c").withRandomRotation(["c", "b", "a"]).running().build();

    const next = advanceDriver(agg, undefined, LATER, [0, 0, 0]);

    expect(driverId(next)).toBe("c");
    expect(next.session.randomRotation).toEqual({ order: ["c", "b", "a"], drove: ["a", "c"] });
  });

  it("輪の順のモードでは、今までどおり輪の次へ替わる", () => {
    const agg = anAggregate().withRotation("a", "b", "c").running().build();

    const next = advanceDriver(agg, new Set([1]), LATER, [2, 1, 0]);

    expect(driverId(next)).toBe("c");
    expect(next.session.randomRotation).toBeNull();
  });
});

describe("予告と実際の交代先（選び直し）", () => {
  it("予告した人が適格でなくなったら、予告は引く順の次の人へ移り、交代もその人へ替わる", () => {
    const agg = anAggregate().withRotation("a", "b", "c", "d").withRandomRotation(["c", "d", "b", "a"]).running().build();
    expect(forecastId(agg)).toBe("c");

    // c（添字 2）が一時離脱した
    const ineligible = new Set([2]);
    expect(forecastId(agg, ineligible)).toBe("d");
    const next = run(agg, { command: "session.act", action: "SWITCH", ineligible });

    expect(driverId(next)).toBe("d");
  });

  it("飛ばされた人は、戻ればこの周のうちに番が回る", () => {
    const agg = anAggregate().withRotation("a", "b", "c", "d").withRandomRotation(["c", "d", "b", "a"]).running().build();

    const skipped = run(agg, { command: "session.act", action: "SWITCH", ineligible: new Set([2]) });

    // c は運転していないので、戻れば次の予告になる
    expect(skipped.session.randomRotation?.drove).toEqual(["a", "d"]);
    expect(forecastId(skipped)).toBe("c");
  });

  it("予告した人が輪から外れたら、予告は引く順の次の人へ移る", () => {
    const agg = anAggregate().withRotation("a", "b", "c", "d").withRandomRotation(["c", "d", "b", "a"]).running().build();

    const removed = run(agg, { command: "member.remove", index: 2 });

    expect(forecastId(removed)).toBe("d");
    expect(driverId(run(removed, { command: "session.act", action: "SWITCH" }))).toBe("d");
  });
});

describe("ランダム交代の性質", () => {
  /** 席の数と、交代ごとにサーバーが渡す順列の列。 */
  const scenarioArb = fc.integer({ min: 2, max: 6 }).chain((len) =>
    fc.record({
      len: fc.constant(len),
      startOrder: fc.shuffledSubarray([...Array(len).keys()], { minLength: len }),
      orders: fc.array(fc.shuffledSubarray([...Array(len).keys()], { minLength: len }), { minLength: 3 * len, maxLength: 3 * len }),
    }),
  );

  function started(len: number, startOrder: number[]): Aggregate {
    const ids = Array.from({ length: len }, (_, i) => `p${i}`);
    const lobby = initialAggregate({ intervalMinutes: 5, rotationMode: "random" }, memberSeats(...ids));
    return run(lobby, { command: "session.act", action: "START", randomOrder: startOrder }, NOW);
  }

  it("予告した人と、交代で替わる人は、いつも同じ", () => {
    fc.assert(
      fc.property(scenarioArb, ({ len, startOrder, orders }) => {
        let agg = started(len, startOrder);
        for (const randomOrder of orders) {
          const forecast = forecastId(agg);
          agg = run(agg, { command: "session.act", action: "SWITCH", randomOrder });
          expect(driverId(agg)).toBe(forecast);
        }
      }),
    );
  });

  it("同じ人が続けて運転しない", () => {
    fc.assert(
      fc.property(scenarioArb, ({ len, startOrder, orders }) => {
        let agg = started(len, startOrder);
        for (const randomOrder of orders) {
          const before = driverId(agg);
          agg = run(agg, { command: "session.act", action: "SWITCH", randomOrder });
          expect(driverId(agg)).not.toBe(before);
        }
      }),
    );
  });

  it("1 周（席の数だけの運転）のうちに、全員が 1 回ずつ運転する", () => {
    fc.assert(
      fc.property(scenarioArb, ({ len, startOrder, orders }) => {
        let agg = started(len, startOrder);
        const drivers = [driverId(agg)];
        for (const randomOrder of orders) {
          agg = run(agg, { command: "session.act", action: "SWITCH", randomOrder });
          drivers.push(driverId(agg));
        }
        const everyone = Array.from({ length: len }, (_, i) => `p${i}`).sort();
        // 開始の運転者から数えて、席の数ごとに区切った 1 周は、全員の並べ替えになる
        for (let round = 0; (round + 1) * len <= drivers.length; round++) {
          expect(drivers.slice(round * len, (round + 1) * len).sort()).toEqual(everyone);
        }
      }),
    );
  });

  it("担当回数は、どの時点でも最大と最小の差が 1 以下に収まる", () => {
    fc.assert(
      fc.property(scenarioArb, ({ len, startOrder, orders }) => {
        let agg = started(len, startOrder);
        for (const randomOrder of orders) {
          agg = run(agg, { command: "session.act", action: "SWITCH", randomOrder });
          const counts = agg.session.driverCounts;
          expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
        }
      }),
    );
  });
});

describe("モードの切り替え（config.set）", () => {
  it("ランダムを選ぶと、渡した順列が引く順になり、いまの運転者だけが運転した状態になる", () => {
    const agg = anAggregate().withRotation("a", "b", "c").withCurrentDriver(1).running().build();

    const next = run(agg, { command: "config.set", config: { rotationMode: "random" }, randomOrder: [2, 1, 0] });

    expect(next.session.randomRotation).toEqual({ order: ["c", "b", "a"], drove: ["b"] });
    expect(forecastId(next)).toBe("c");
  });

  it("ConfigSet のイベントは設定にモードを載せる", () => {
    const agg = anAggregate().withRotation("a", "b").build();

    const events = decide({ command: "config.set", config: { rotationMode: "random" }, randomOrder: [1, 0] }, agg, LATER)._unsafeUnwrap();

    expect(events).toEqual([
      { type: "ConfigSet", config: { rotationMode: "random" }, randomRotation: { order: ["b", "a"], drove: ["a"] }, now: LATER },
    ]);
  });

  it("順列を渡されなければ、引く順は空で始める（輪の順で並び、次の交代で作り直す）", () => {
    const agg = anAggregate().withRotation("a", "b", "c").running().build();

    const next = run(agg, { command: "config.set", config: { rotationMode: "random" } });

    expect(next.session.randomRotation).toEqual({ order: [], drove: ["a"] });
    expect(forecastId(next)).toBe("b");
  });

  it("既にランダムなら、もう一度選んでも袋を作り直さない", () => {
    const agg = anAggregate().withRotation("a", "b", "c").withRandomRotation(["c", "b", "a"], ["a", "c"]).running().build();

    const next = run(agg, { command: "config.set", config: { rotationMode: "random" }, randomOrder: [0, 1, 2] });

    expect(next.session.randomRotation).toEqual({ order: ["c", "b", "a"], drove: ["a", "c"] });
  });

  it("モードに触れない設定の変更では、袋を変えない", () => {
    const agg = anAggregate().withRotation("a", "b", "c").withRandomRotation(["c", "b", "a"]).running().build();

    const events = decide({ command: "config.set", config: { navigatorEnabled: true } }, agg, LATER)._unsafeUnwrap();

    expect(events).toEqual([{ type: "ConfigSet", config: { navigatorEnabled: true }, now: LATER }]);
    expect(events.reduce((acc, e) => evolve(acc, e, LATER), agg).session.randomRotation).toEqual(agg.session.randomRotation);
  });

  it("輪の順に戻すと袋を捨て、次の交代から輪の順で回る", () => {
    const agg = anAggregate().withRotation("a", "b", "c").withRandomRotation(["c", "b", "a"]).running().build();

    const back = run(agg, { command: "config.set", config: { rotationMode: "order" } });

    expect(back.session.randomRotation).toBeNull();
    expect(driverId(run(back, { command: "session.act", action: "SWITCH" }))).toBe("b");
  });

  it("順列でない randomOrder は InvalidIndex で断る", () => {
    const agg = anAggregate().withRotation("a", "b", "c").build();

    const result = decide({ command: "config.set", config: { rotationMode: "random" }, randomOrder: [0, 0, 2] }, agg, LATER);

    expect(result._unsafeUnwrapErr().type).toBe("InvalidIndex");
  });
});

describe("開始・リセット", () => {
  it("設定がランダムなら、初期の集約はランダム交代で始まる（引く順は空）", () => {
    const agg = initialAggregate({ intervalMinutes: 5, rotationMode: "random" }, memberSeats("a", "b"));

    expect(agg.session.randomRotation).toEqual({ order: [], drove: ["a"] });
  });

  it("設定が輪の順（または省略）なら、初期の集約は輪の順で始まる", () => {
    expect(initialAggregate({ intervalMinutes: 5 }, memberSeats("a")).session.randomRotation).toBeNull();
    expect(initialAggregate({ intervalMinutes: 5, rotationMode: "order" }, memberSeats("a")).session.randomRotation).toBeNull();
  });

  it("開始のとき、渡した順列で引く順を作り、いまの運転者だけが運転した状態にする", () => {
    // ロビーでランダムを選び、あとから人が入った（引く順は古いまま）
    const lobby = anAggregate().withRotation("a", "b", "c").withRandomRotation(["a"], ["a", "x"]).build();

    const next = run(lobby, { command: "session.act", action: "START", randomOrder: [2, 0, 1] });

    expect(next.session.randomRotation).toEqual({ order: ["c", "a", "b"], drove: ["a"] });
  });

  it("開始のとき、順列を渡されなければ、今の引く順のまま、いまの運転者だけが運転した状態にする", () => {
    const lobby = anAggregate().withRotation("a", "b", "c").withRandomRotation(["c", "b", "a"], ["a", "c"]).build();

    const next = run(lobby, { command: "session.act", action: "START" });

    expect(next.session.randomRotation).toEqual({ order: ["c", "b", "a"], drove: ["a"] });
  });

  it("開始前（ロビー）に先頭の席を外しても、袋から引かず、位置で次の席を先頭にする", () => {
    // ロビーの「運転中の席」は運転していない。袋から引くと、開始の運転者が輪の途中の席になる
    const lobby = anAggregate().withRotation("a", "b", "c", "d").withRandomRotation(["d", "c", "b", "a"]).build();

    const next = run(lobby, { command: "member.remove", index: 0 });

    expect(next.session.currentIndex).toBe(0);
    expect(driverId(next)).toBe("b");
    expect(next.session.randomRotation).toEqual({ order: ["d", "c", "b", "a"], drove: ["a"] });
  });

  it("一時停止中に運転中の人を外すと、輪の隣でなく、袋の予告した人が運転者になる（始まっていれば時計が止まっていても袋から引く）", () => {
    const paused = anAggregate().withRotation("a", "b", "c", "d").withRandomRotation(["d", "c", "b", "a"]).paused().build();
    expect(forecastId(paused)).toBe("d");

    const next = run(paused, { command: "member.remove", index: 0 });

    expect(driverId(next)).toBe("d");
    expect(next.session.randomRotation?.drove).toEqual(["a", "d"]);
  });

  it("休憩中に運転中の人を外すと、輪の隣でなく、袋の予告した人が運転者になる", () => {
    const running = anAggregate().withRotation("a", "b", "c", "d").withRandomRotation(["d", "c", "b", "a"]).running().build();
    const onBreak = run(running, { command: "break.start" });
    expect(onBreak.clock.running).toBe(false);

    const next = run(onBreak, { command: "member.remove", index: 0 });

    expect(driverId(next)).toBe("d");
    expect(next.session.randomRotation?.drove).toEqual(["a", "d"]);
  });

  it("開始のとき、順列でない randomOrder は InvalidIndex で断る", () => {
    const lobby = anAggregate().withRotation("a", "b").withRandomRotation([]).build();

    const result = decide({ command: "session.act", action: "START", randomOrder: [1, 1] }, lobby, LATER);

    expect(result._unsafeUnwrapErr().type).toBe("InvalidIndex");
  });

  it("輪の順のモードの開始は、今までどおり", () => {
    const lobby = anAggregate().withRotation("a", "b").build();

    expect(decide({ command: "session.act", action: "START", randomOrder: [1, 0] }, lobby, LATER)._unsafeUnwrap()).toEqual([
      { type: "SessionStarted", now: LATER },
    ]);
  });

  it("リセットしてもモードは残り、先頭の運転者だけが運転した状態に戻る", () => {
    const agg = anAggregate()
      .withRotation("a", "b", "c")
      .withCurrentDriver(2)
      .withRandomRotation(["b", "c", "a"], ["a", "b", "c"])
      .running()
      .build();

    const next = run(agg, { command: "session.reset" });

    expect(next.session.currentIndex).toBe(0);
    expect(next.session.randomRotation).toEqual({ order: ["b", "c", "a"], drove: ["a"] });
  });

  it("リセットのとき、渡した順列で引く順を作り直す（2 回目のセッションの開始はリセットで来る）", () => {
    const agg = anAggregate()
      .withRotation("a", "b", "c")
      .withCurrentDriver(1)
      .withRandomRotation(["b", "a"], ["a", "b"])
      .running()
      .build();

    const next = run(agg, { command: "session.reset", randomOrder: [2, 1, 0] });

    expect(next.session.randomRotation).toEqual({ order: ["c", "b", "a"], drove: ["a"] });
  });

  it("リセットのとき、順列でない randomOrder は InvalidIndex で断る", () => {
    const agg = anAggregate().withRotation("a", "b").withRandomRotation(["b", "a"]).running().build();

    const result = decide({ command: "session.reset", randomOrder: [0, 2] }, agg, LATER);

    expect(result._unsafeUnwrapErr().type).toBe("InvalidIndex");
  });

  it("輪の順のモードのリセットは、輪の順のまま（randomOrder を見ない）", () => {
    const agg = anAggregate().withRotation("a", "b").running().build();

    expect(decide({ command: "session.reset", randomOrder: [5] }, agg, LATER)._unsafeUnwrap()).toEqual([
      { type: "SessionReset", now: LATER },
    ]);
    expect(run(agg, { command: "session.reset" }).session.randomRotation).toBeNull();
  });

  it("空の輪をリセットしても、ランダム交代のまま壊れない（運転した人は空）", () => {
    const empty: Aggregate = {
      ...initialAggregate({ intervalMinutes: 5 }, []),
    };
    const random: Aggregate = { ...empty, session: { ...empty.session, randomRotation: { order: ["x"], drove: ["x"] } } };

    const next = evolve(random, { type: "SessionReset", now: LATER }, LATER);

    expect(next.session.randomRotation).toEqual({ order: ["x"], drove: [] });
  });
});

describe("ランダム交代の間の、指名・並べ替え・席の出入り", () => {
  it("指名（driver.assign）は通り、指名された人はこの周で運転した人になる", () => {
    const agg = anAggregate().withRotation("a", "b", "c", "d").withRandomRotation(["c", "d", "b", "a"]).running().build();

    const next = run(agg, { command: "driver.assign", index: 1 });

    expect(driverId(next)).toBe("b");
    expect(next.session.randomRotation).toEqual({ order: ["c", "d", "b", "a"], drove: ["a", "b"] });
    // 予告は変わらない（c はまだ運転していない）
    expect(forecastId(next)).toBe("c");
  });

  it("この周で運転し終えた人を指名しても、周は始め直さない", () => {
    const agg = anAggregate()
      .withRotation("a", "b", "c")
      .withCurrentDriver(1)
      .withRandomRotation(["c", "b", "a"], ["a", "b"])
      .running()
      .build();

    const next = run(agg, { command: "driver.assign", index: 0 });

    expect(driverId(next)).toBe("a");
    expect(next.session.randomRotation?.drove).toEqual(["a", "b"]);
    expect(forecastId(next)).toBe("c");
  });

  it("輪の順のモードの指名は、今までどおり（イベントに袋を載せない）", () => {
    const agg = anAggregate().withRotation("a", "b", "c").running().build();

    expect(decide({ command: "driver.assign", index: 2 }, agg, LATER)._unsafeUnwrap()).toEqual([
      { type: "DriverSwitched", nextIndex: 2, now: LATER },
    ]);
  });

  it("並べ替え（member.shuffle）のあとも、予告は同じ人を指す（袋は席の識別子で持つ）", () => {
    const agg = anAggregate().withRotation("a", "b", "c", "d").withRandomRotation(["c", "d", "b", "a"]).running().build();

    const shuffled = run(agg, { command: "member.shuffle", order: [0, 3, 1, 2] });

    expect(forecastId(shuffled)).toBe("c");
    expect(driverId(run(shuffled, { command: "session.act", action: "SWITCH" }))).toBe("c");
  });

  it("席の移動（member.move）のあとも、予告は同じ人を指す", () => {
    const agg = anAggregate().withRotation("a", "b", "c", "d").withRandomRotation(["c", "d", "b", "a"]).running().build();

    const moved = run(agg, { command: "member.move", fromIndex: 2, toIndex: 0 });

    expect(forecastId(moved)).toBe("c");
  });

  it("途中で入った人は、この周のうちに番が回る", () => {
    const agg = anAggregate().withRotation("a", "b").withRandomRotation(["b", "a"]).running().build();

    const joined = run(agg, { command: "member.add", participantId: "c" });
    const first = run(joined, { command: "session.act", action: "SWITCH" });
    const second = run(first, { command: "session.act", action: "SWITCH" });

    expect([driverId(first), driverId(second)]).toEqual(["b", "c"]);
  });

  it("運転中の人を外すと、予告した人が運転者になり、この周で運転した人に足される", () => {
    const agg = anAggregate().withRotation("a", "b", "c", "d").withRandomRotation(["c", "d", "b", "a"]).running().build();

    const next = run(agg, { command: "member.remove", index: 0 });

    expect(driverId(next)).toBe("c");
    expect(next.session.randomRotation?.drove).toEqual(["a", "c"]);
  });

  it("運転中の人を外すとき、適格でない席は選ばない", () => {
    const agg = anAggregate().withRotation("a", "b", "c", "d").withRandomRotation(["c", "d", "b", "a"]).running().build();

    const next = run(agg, { command: "member.remove", index: 0, ineligible: new Set([2]) });

    expect(driverId(next)).toBe("d");
  });

  it("運転中の人を外すとき、ほかに適格な人が居なければ、位置で次の席にし、その人をこの周で運転した人に足す", () => {
    const agg = anAggregate().withRotation("a", "b", "c", "d").withRandomRotation(["b", "c", "d", "a"]).running().build();

    const next = run(agg, { command: "member.remove", index: 0, ineligible: new Set([1, 2, 3]) });

    expect(driverId(next)).toBe("b");
    expect(next.session.randomRotation).toEqual({ order: ["b", "c", "d", "a"], drove: ["a", "b"] });
    // 全員が戻ったあとの 2 回の交代は c・d（繰り上がった b が、同じ周でもう一度当たらない）
    const first = run(next, { command: "session.act", action: "SWITCH" });
    const second = run(first, { command: "session.act", action: "SWITCH" });
    expect([driverId(first), driverId(second)]).toEqual(["c", "d"]);
  });

  it("位置で繰り上がった人がこの周で運転し終えていても、周は始め直さない", () => {
    const agg = anAggregate()
      .withRotation("a", "b", "c")
      .withRandomRotation(["c", "b", "a"], ["a", "b"])
      .running()
      .build();

    const next = run(agg, { command: "member.remove", index: 0, ineligible: new Set([1, 2]) });

    expect(driverId(next)).toBe("b");
    expect(next.session.randomRotation?.drove).toEqual(["a", "b"]);
  });

  it("運転者が替わらない交代のイベントは、袋を載せていても袋を変えない", () => {
    const agg = anAggregate().withRotation("a", "b", "c").withRandomRotation(["c", "b", "a"]).running().build();

    const next = evolve(
      agg,
      { type: "DriverSwitched", nextIndex: 0, randomRotation: { order: ["a"], drove: ["c"] }, now: LATER },
      LATER,
    );

    expect(next.session.randomRotation).toEqual({ order: ["c", "b", "a"], drove: ["a"] });
  });

  it("範囲外の席を外すイベントは、袋を載せていても袋を変えない", () => {
    const agg = anAggregate().withRotation("a", "b", "c").withRandomRotation(["c", "b", "a"]).running().build();

    const next = evolve(
      agg,
      { type: "MemberRemoved", index: 9, nextDriverIndex: 0, randomRotation: { order: ["a"], drove: ["c"] }, now: LATER },
      LATER,
    );

    expect(next.session.randomRotation).toEqual({ order: ["c", "b", "a"], drove: ["a"] });
  });

  it("運転中でない人を外しても、袋は変えない", () => {
    const agg = anAggregate().withRotation("a", "b", "c").withRandomRotation(["c", "b", "a"]).running().build();

    const next = run(agg, { command: "member.remove", index: 1 });

    expect(driverId(next)).toBe("a");
    expect(next.session.randomRotation).toEqual({ order: ["c", "b", "a"], drove: ["a"] });
  });

  it("休憩中の交代のイベントは、袋も変えない", () => {
    const agg = anAggregate().withRotation("a", "b", "c").withRandomRotation(["c", "b", "a"]).running().build();
    const onBreak = run(agg, { command: "break.start" });

    const next = evolve(
      onBreak,
      { type: "DriverSwitched", nextIndex: 2, randomRotation: { order: ["a"], drove: ["c"] }, now: LATER },
      LATER,
    );

    expect(next.session.randomRotation).toEqual({ order: ["c", "b", "a"], drove: ["a"] });
  });

  it("輪の順のモードの集約は、袋を載せたイベントが届いても輪の順のまま", () => {
    const agg = anAggregate().withRotation("a", "b", "c").running().build();

    const next = evolve(
      agg,
      { type: "DriverSwitched", nextIndex: 2, randomRotation: { order: ["a"], drove: ["c"] }, now: LATER },
      LATER,
    );

    expect(next.session.currentIndex).toBe(2);
    expect(next.session.randomRotation).toBeNull();
  });
});
