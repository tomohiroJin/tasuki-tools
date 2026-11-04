/**
 * 境界の性質テスト（fast-check）— #522
 *
 * 自動の変異の調査（docs/superpowers/specs/2026-11-01-test-gap-survey.md 2.5）で、製品のテストでも
 * 生き残った境界・既定値の演算を、timer-core 自身のテストで守る。
 *   - 参加者の上限（decide.ts の participant.addProxy）
 *   - 席の移動で運転手の位置を追う判断（evolve.ts の MemberMoved）
 *   - 休憩までの交代回数（break-policy.ts の rounds）
 *   - 時計のずれの符号（aggregate.ts の elapsedMs）
 *
 * 方針:
 *   - 正解は実装の式を写さない。移動は「運転手の参加者 ID が移動の前後で変わらない」と、
 *     別の手順（filter と slice）で組んだ並びとの突き合わせで書く。
 *   - 境界ちょうどの値は `fc.constantFrom` で必ず混ぜる（乱数の一様な選び方では当たらない）。
 *   - 種と回数を固定する（速い段に収め、落ちたら同じ反例で再現できる）。
 *   - 受理と拒否は分けて見て、拒否はエラーの種類（type）で見る。
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { decide } from "../src/decide.js";
import { evolve } from "../src/evolve.js";
import {
  elapsedMs,
  initialAggregate,
  INITIAL_BREAK_STATE,
  MAX_MEMBERS,
  rotationEntryId,
  type Aggregate,
  type BreakMark,
  type ServerClock,
} from "../src/aggregate.js";
import { isBreakDue, type BreakPolicy } from "../src/break-policy.js";
import { anAggregate, memberSeats, seatIds } from "./support/aggregate-builder.js";

const RUN = { seed: 522, numRuns: 300 } as const;

// ─── 参加者の上限 ───────────────────────────────────────────────────────────

describe("参加者の上限（participant.addProxy）", () => {
  /** 席が n 人いる集約（IDは P0〜P(n-1)） */
  function withSeats(n: number): Aggregate {
    return anAggregate()
      .withRotation(...Array.from({ length: n }, (_, k) => `P${k}`))
      .build();
  }

  const addProxy = (agg: Aggregate) =>
    decide({ command: "participant.addProxy", displayName: "新人", participantId: "NEW" }, agg, 1_000);

  it("上限の 1 つ手前（MAX_MEMBERS - 1 人）の輪には足せる", () => {
    const result = addProxy(withSeats(MAX_MEMBERS - 1));
    expect(result.isOk()).toBe(true);
  });

  it("上限ちょうど（MAX_MEMBERS 人）の輪には足せず、MemberLimitExceeded になる", () => {
    const result = addProxy(withSeats(MAX_MEMBERS));
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ type: "MemberLimitExceeded", limit: MAX_MEMBERS });
  });

  it("人数ごとに、足せるのは上限に満たないときだけで、断るときは MemberLimitExceeded（上限ちょうどを必ず混ぜる）", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constantFrom(1, MAX_MEMBERS - 1, MAX_MEMBERS), fc.integer({ min: 1, max: MAX_MEMBERS })),
        (n) => {
          const result = addProxy(withSeats(n));
          const outcome = result.isOk() ? "accepted" : result._unsafeUnwrapErr().type;
          const expected = n < MAX_MEMBERS ? "accepted" : "MemberLimitExceeded";
          expect({ n, outcome }).toEqual({ n, outcome: expected });
        },
      ),
      RUN,
    );
  });
});

// ─── 席の移動と運転手の位置 ─────────────────────────────────────────────────

describe("席の移動（member.move）と運転手", () => {
  /** 席の数・運転手の位置・動かす元と先。運転手の前後ちょうどの席と両端を必ず混ぜる */
  const moveArb = fc
    .integer({ min: 1, max: MAX_MEMBERS })
    .chain((len) =>
      fc.integer({ min: 0, max: len - 1 }).chain((current) => {
        const seat = fc
          .oneof(
            fc.integer({ min: 0, max: len - 1 }),
            fc.constantFrom(0, len - 1, current - 1, current, current + 1),
          )
          .map((i) => Math.min(len - 1, Math.max(0, i)));
        return fc.record({ len: fc.constant(len), current: fc.constant(current), from: seat, to: seat });
      }),
    );

  it("どの席からどの席へ動かしても、運転手は同じ人のまま・席の並びは動かした通り・担当回数は席に付いて動く", () => {
    fc.assert(
      fc.property(moveArb, ({ len, current, from, to }) => {
        // Given: 席ごとに違う担当回数を持たせ、動いたかを見分けられるようにする
        const ids = Array.from({ length: len }, (_, k) => `P${k}`);
        const base = anAggregate().withRotation(...ids).withCurrentDriver(current).running().build();
        const before: Aggregate = {
          ...base,
          session: { ...base.session, driverCounts: ids.map((_, k) => (k + 1) * 10) },
        };

        // When
        const decided = decide({ command: "member.move", fromIndex: from, toIndex: to }, before, 5_000);
        expect(decided.isOk()).toBe(true);
        let after = before;
        for (const event of decided._unsafeUnwrap()) after = evolve(after, event, 5_000);

        // Then: 動かした後の並び（filter と slice で組む。実装の splice を写さない）
        const without = ids.filter((_, k) => k !== from);
        const expectedIds = [...without.slice(0, to), ids[from], ...without.slice(to)];
        const afterIds = seatIds(after.session.rotation);
        const driverBefore = rotationEntryId(before.session.rotation[current]!);
        const driverAfter = afterIds[after.session.currentIndex];
        const countOf = (agg: Aggregate, id: string) => agg.session.driverCounts[seatIds(agg.session.rotation).indexOf(id)];
        expect({
          afterIds,
          driverAfter,
          counts: ids.map((id) => countOf(after, id)),
        }).toEqual({
          afterIds: expectedIds,
          driverAfter: driverBefore,
          counts: ids.map((id) => countOf(before, id)),
        });
      }),
      RUN,
    );
  });

  it.each([
    // 運転手の前の席を、運転手の席ちょうどへ動かす（運転手が 1 つ前へずれる）
    { name: "前の席を運転手の席ちょうどへ", ids: ["A", "B", "C"], current: 1, from: 0, to: 1, expectDriver: "B" },
    // 運転手の後ろの席を、運転手の席ちょうどへ動かす（運転手が 1 つ後ろへずれる）
    { name: "後ろの席を運転手の席ちょうどへ", ids: ["A", "B", "C"], current: 1, from: 2, to: 1, expectDriver: "B" },
    // 運転手の席そのものを動かす（運転手は動かした先へついていく）
    { name: "運転手の席そのものを末尾へ", ids: ["A", "B", "C"], current: 0, from: 0, to: 2, expectDriver: "A" },
  ])("例: $name 動かしても運転手は $expectDriver のまま", ({ ids, current, from, to, expectDriver }) => {
    const before = anAggregate().withRotation(...ids).withCurrentDriver(current).running().build();
    const decided = decide({ command: "member.move", fromIndex: from, toIndex: to }, before, 5_000);
    let after = before;
    for (const event of decided._unsafeUnwrap()) after = evolve(after, event, 5_000);
    expect(seatIds(after.session.rotation)[after.session.currentIndex]).toBe(expectDriver);
  });
});

// ─── 休憩までの交代回数（周回） ─────────────────────────────────────────────

describe("休憩までの交代回数（isBreakDue / rounds）", () => {
  function aggAt(totalSwitches: number, brk: Partial<typeof INITIAL_BREAK_STATE>): Aggregate {
    const base = initialAggregate({ intervalMinutes: 5 }, memberSeats("A", "B"));
    return {
      session: { ...base.session, totalSwitches, break: { ...INITIAL_BREAK_STATE, ...brk } },
      clock: base.clock,
    };
  }

  /** 基準の交代回数は 0 でないものを必ず混ぜる（0 だけでは `-` と `+` が区別できない） */
  const baseSwitchesArb = fc.oneof(fc.constantFrom(0, 1, 7), fc.integer({ min: 0, max: 200 }));

  it("基準から数えた交代回数が（適格な席の数 × every）に満たなければ休憩の時ではなく、達すれば時になる", () => {
    fc.assert(
      fc.property(
        baseSwitchesArb,
        fc.integer({ min: 2, max: MAX_MEMBERS }),
        fc.integer({ min: 1, max: 5 }),
        fc.constantFrom("auto", "suggest") as fc.Arbitrary<BreakPolicy["mode"]>,
        fc.boolean(),
        fc.integer({ min: 0, max: 60 }),
        fc.constantFrom("below", "exact", "above", "zero", "free"),
        (baseSwitches, seats, every, mode, hasSuggested, anyDelta, kind) => {
          const threshold = seats * every;
          // 基準からの交代回数: 閾値の前後ちょうどと 0 を必ず混ぜる
          const useDelta = { below: threshold - 1, exact: threshold, above: threshold + 1, zero: 0, free: anyDelta }[kind];
          const mark: BreakMark = { elapsedMs: 0, switches: baseSwitches };
          // 知らせた時点の基準（suggest では優先して使われる）。もう一方の基準は別の値にして取り違えを検出する
          const other: BreakMark = { elapsedMs: 0, switches: baseSwitches + 3 };
          const agg =
            mode === "suggest" && hasSuggested
              ? aggAt(other.switches + useDelta, { baseline: mark, suggestedAt: other })
              : aggAt(mark.switches + useDelta, { baseline: mark });
          const due = isBreakDue(agg, { trigger: "rounds", every, mode }, seats);
          expect({ useDelta, threshold, due }).toEqual({ useDelta, threshold, due: useDelta >= threshold });
        },
      ),
      RUN,
    );
  });

  it.each([
    { name: "基準が 0", base: 0, total: 3, expected: false },
    { name: "基準が 0 で閾値ちょうど", base: 0, total: 4, expected: true },
    { name: "基準が 5 で、基準から 3 回（閾値 4 に満たない）", base: 5, total: 8, expected: false },
    { name: "基準が 5 で、基準から 4 回（閾値ちょうど）", base: 5, total: 9, expected: true },
  ])("例: 2 席 × 2 周で閾値 4 回 — $name", ({ base, total, expected }) => {
    const agg = aggAt(total, { baseline: { elapsedMs: 0, switches: base } });
    expect(isBreakDue(agg, { trigger: "rounds", every: 2, mode: "auto" }, 2)).toBe(expected);
  });
});

// ─── 時計のずれ（clockOffset） ──────────────────────────────────────────────

describe("稼働経過時間（elapsedMs）の時計のずれ", () => {
  const clockOf = (accumulatedElapsedMs: number, runningSince: number): ServerClock => ({
    running: true,
    intervalSeconds: 300,
    anchorServerTime: runningSince,
    secondsLeftAtAnchor: 300,
    accumulatedElapsedMs,
    runningSince,
  });

  it("稼働中は「積み上げ + (いま - 開始) + ずれ」になる（開始・ずれが 0 でない値を必ず混ぜる）", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constantFrom(0, 1), fc.integer({ min: 0, max: 1_000_000 })),
        fc.oneof(fc.constantFrom(0, 1, 1_000_000), fc.integer({ min: 0, max: 2_000_000_000 })),
        fc.integer({ min: 0, max: 600_000 }),
        fc.oneof(fc.constantFrom(-1, 1, -500, 500), fc.integer({ min: -60_000, max: 60_000 })),
        (accumulated, startedAt, ranFor, offset) => {
          const now = startedAt + ranFor;
          const actual = elapsedMs(clockOf(accumulated, startedAt), now, offset);
          // ずれは「いま」を進める量。区間の長さ ranFor にそのまま足される
          expect(actual).toBe(accumulated + ranFor + offset);
        },
      ),
      RUN,
    );
  });

  it("止まっているときは、ずれがあっても積み上げをそのまま返す", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.oneof(fc.constantFrom(-1, 1), fc.integer({ min: -60_000, max: 60_000 })),
        (accumulated, offset) => {
          const stopped: ServerClock = { ...clockOf(accumulated, 1_000), running: false, runningSince: null };
          expect(elapsedMs(stopped, 99_999, offset)).toBe(accumulated);
        },
      ),
      RUN,
    );
  });
});
