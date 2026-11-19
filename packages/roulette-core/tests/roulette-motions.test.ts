import { describe, expect, it } from "vitest";
import {
  LAUNCH_MOTIONS,
  LAUNCH_MOTION_EXTRA_MS,
  FAST_SPAN_MS,
  LAUNCH_MOTION_ODDS,
  MOTION_EXTRA_CAP_MS,
  NEXT_MOVE_MS,
  SPIN_DURATION_MS,
  SPIN_MOTIONS,
  SPIN_MOTION_EXTRA_MS,
  SPIN_MOTION_ODDS,
  STOP_HOLD_MS,
  STOP_STYLES,
  STOP_STYLE_EXTRA_MS,
  isLaunchMotion,
  isSpinMotion,
  launchMotionMs,
  pickStopsMs,
  spinDurationMs,
} from "../src/limits.js";
import { drawLaunchMotion, drawSpinMotion } from "../src/motion.js";
import {
  INITIAL_ROULETTE_STATE,
  setMode,
  setPickCount,
  startSpin,
  toView,
  type Member,
  type RouletteState,
  type SpinInput,
} from "../src/index.js";
import { foldCase } from "./support/name-conflict.js";

function many(n: number): Member[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p-${i}`, name: `人${i}`, present: true }));
}

function spinInput(patch: Partial<SpinInput> = {}): SpinInput {
  return { members: many(4), spunBy: "あおい", now: 1000, randomInt: () => 0, randomSettle: () => 0.5, conflicts: foldCase, ...patch };
}

/** 動きを引く乱数。n（母数）ごとに返す値を決める。呼ばれた n を記録する */
function motionRandom(of: (n: number) => number): { random: (n: number) => number; calls: number[] } {
  const calls: number[] = [];
  return {
    calls,
    random: (n) => {
      calls.push(n);
      return of(n);
    },
  };
}

const LAUNCH_HIT = LAUNCH_MOTION_ODDS - 1;
const SPIN_HIT = SPIN_MOTION_ODDS - 1;

/** 出る目のときだけ、指定の動きを返す乱数（母数 12・16・3 は動きの抽選、それ以外は 0） */
function hitting(launchIndex: number | null, spinIndex: number | null): (n: number) => number {
  // 母数 12 → 出るか（動き出し）・母数 16 → 出るか（回転）・母数 3 → どの動きか（動き出しと回転の順に引く）
  let pickCalls = 0;
  return (n) => {
    if (n === LAUNCH_MOTION_ODDS) return launchIndex === null ? 0 : LAUNCH_HIT;
    if (n === SPIN_MOTION_ODDS) return spinIndex === null ? 0 : SPIN_HIT;
    if (n === LAUNCH_MOTIONS.length) {
      pickCalls++;
      return pickCalls === 1 && launchIndex !== null ? launchIndex : (spinIndex ?? 0);
    }
    return 0;
  };
}

function modeState(mode: "once" | "order" | "press"): RouletteState {
  return setMode(INITIAL_ROULETTE_STATE, mode, 0)._unsafeUnwrap();
}

/**
 * @requirements #640 振る舞い 1（動きの表と確率）・決めること 1・3
 */
describe("動きの表", () => {
  it("動き出し 3 種・回転 3 種。名前は重ならず、確率は 1/12 と 1/16（止まり方の 1/24 より出やすい）", () => {
    // Given / When / Then
    expect([...LAUNCH_MOTIONS]).toEqual(["shake", "windup", "stumble"]);
    expect([...SPIN_MOTIONS]).toEqual(["backward", "turnback", "fast"]);
    expect(LAUNCH_MOTION_ODDS).toBe(12);
    expect(SPIN_MOTION_ODDS).toBe(16);
    expect(MOTION_EXTRA_CAP_MS).toBe(4000);
  });

  it("動き出しは延ばす長さを持ち（0 より大きい）、回転は逆回転が 0・途中で向きを変えるが延び・速いは縮む", () => {
    // Given / When / Then
    for (const m of LAUNCH_MOTIONS) expect(LAUNCH_MOTION_EXTRA_MS[m]).toBeGreaterThan(0);
    expect(SPIN_MOTION_EXTRA_MS.backward).toBe(0);
    expect(SPIN_MOTION_EXTRA_MS.turnback).toBeGreaterThan(0);
    expect(SPIN_MOTION_EXTRA_MS.fast).toBeLessThan(0);
  });

  it("名前の判定: 知らない名前・無い・継承のキー（toString）は動きではない", () => {
    // Given / When / Then
    expect(isLaunchMotion("windup")).toBe(true);
    expect(isLaunchMotion("backward")).toBe(false);
    expect(isLaunchMotion("toString")).toBe(false);
    expect(isLaunchMotion(undefined)).toBe(false);
    expect(isSpinMotion("fast")).toBe(true);
    expect(isSpinMotion("shake")).toBe(false);
    expect(isSpinMotion("constructor")).toBe(false);
    expect(isSpinMotion(null)).toBe(false);
  });
});

/**
 * @requirements #640 決めること 3（合計の上限）
 */
describe("延びる時間の合計は上限（+4 秒）に収まる", () => {
  const styles: (string | null)[] = [null, ...STOP_STYLES];
  const launches: (string | null)[] = [null, ...LAUNCH_MOTIONS];
  const spins: (string | null)[] = [null, ...SPIN_MOTIONS];

  it("止まり方 × 動き出し × 回転の全組み合わせで、動き出しの長さは 0 以上で、延びた合計が上限を越えない", () => {
    for (const style of styles) {
      for (const launch of launches) {
        for (const spin of spins) {
          // Given / When
          const ms = launchMotionMs(launch, style, spin);
          const total = spinDurationMs(1, style, { launch, spin }) - SPIN_DURATION_MS;
          // Then
          expect(ms, `${String(style)}/${String(launch)}/${String(spin)}`).toBeGreaterThanOrEqual(0);
          expect(total, `${String(style)}/${String(launch)}/${String(spin)}`).toBeLessThanOrEqual(MOTION_EXTRA_CAP_MS);
          // 動き出しが無ければ長さは 0・あれば表の長さ以下
          if (launch === null) expect(ms).toBe(0);
          else expect(ms).toBeLessThanOrEqual(LAUNCH_MOTION_EXTRA_MS[launch as keyof typeof LAUNCH_MOTION_EXTRA_MS]);
        }
      }
    }
  });

  it("上限に収まるときは表の長さのまま。越えるときだけ動き出しを詰める（止まり方と回転は詰めない）", () => {
    // Given: 止まり方 linger（+2500）・途中で向きを変える（+1000）に、動き出し stumble（+1300）を重ねる = 4800 > 4000
    const room = MOTION_EXTRA_CAP_MS - STOP_STYLE_EXTRA_MS.linger - SPIN_MOTION_EXTRA_MS.turnback;
    // When / Then: 詰めるのは動き出しだけ
    expect(launchMotionMs("stumble", "linger", "turnback")).toBe(room);
    expect(spinDurationMs(1, "linger", { launch: "stumble", spin: "turnback" })).toBe(
      SPIN_DURATION_MS + STOP_STYLE_EXTRA_MS.linger + SPIN_MOTION_EXTRA_MS.turnback + room,
    );
    // 収まる組み合わせは詰めない
    expect(launchMotionMs("stumble", null, null)).toBe(LAUNCH_MOTION_EXTRA_MS.stumble);
    expect(launchMotionMs("shake", "nudge", "backward")).toBe(LAUNCH_MOTION_EXTRA_MS.shake);
  });

  it("表の値で、止まり方の最大 + 回転の動きの最大は上限に収まる（詰めるのは動き出しだけなので、表を変えた人がここで気づく）", () => {
    // Given
    const maxStyle = Math.max(...STOP_STYLES.map((s) => STOP_STYLE_EXTRA_MS[s]));
    const maxSpin = Math.max(...SPIN_MOTIONS.map((m) => SPIN_MOTION_EXTRA_MS[m]));
    // When / Then
    expect(maxStyle + maxSpin).toBeLessThanOrEqual(MOTION_EXTRA_CAP_MS);
    // 動き出しを 0 まで詰めても収まるので、どの組み合わせでも上限を越えない
    for (const style of styles) for (const spin of spins) expect(launchMotionMs(null, style, spin)).toBe(0);
  });

  it("速い回転で縮める区間（FAST_SPAN_MS）は、縮める長さより長く、止まり方の最初の脚の最短（2600ms）以内", () => {
    // Given / When / Then
    expect(FAST_SPAN_MS).toBeGreaterThan(-SPIN_MOTION_EXTRA_MS.fast);
    expect(FAST_SPAN_MS).toBeLessThanOrEqual(2600);
  });

  it("動きの長さは、止まる時刻（1 人目）の差し引き。2 人目からはその分だけ後ろへずれる", () => {
    // Given
    const extra = LAUNCH_MOTION_EXTRA_MS.windup + SPIN_MOTION_EXTRA_MS.turnback;
    // When
    const stops = pickStopsMs(2, null, { launch: "windup", spin: "turnback" });
    // Then
    expect(stops).toEqual([SPIN_DURATION_MS + extra, SPIN_DURATION_MS + extra + STOP_HOLD_MS + NEXT_MOVE_MS]);
  });

  it("速い回転は止まる時刻を縮める。知らない名前・無いときは今の長さのまま", () => {
    // Given / When / Then
    expect(pickStopsMs(1, null, { spin: "fast" })).toEqual([SPIN_DURATION_MS + SPIN_MOTION_EXTRA_MS.fast]);
    expect(pickStopsMs(1, null, { launch: "unknown", spin: "toString" })).toEqual(pickStopsMs(1));
    expect(pickStopsMs(2, "nudge", {})).toEqual(pickStopsMs(2, "nudge"));
    expect(launchMotionMs("unknown", null, null)).toBe(0);
  });
});

/**
 * @requirements #640 振る舞い 1・決めること 6（抽選）
 */
describe("drawLaunchMotion・drawSpinMotion（動きを引く）", () => {
  it("動き出し: 1/12 の目（最後の値）のときだけ選ぶ。2 回目は動きの数を渡す", () => {
    // Given
    const hit = motionRandom((n) => (n === LAUNCH_MOTION_ODDS ? LAUNCH_HIT : 1));
    // When / Then
    expect(drawLaunchMotion(hit.random)._unsafeUnwrap()).toBe(LAUNCH_MOTIONS[1]);
    expect(hit.calls).toEqual([LAUNCH_MOTION_ODDS, LAUNCH_MOTIONS.length]);
  });

  it("回転: 1/16 の目（最後の値）のときだけ選ぶ。2 回目は動きの数を渡す", () => {
    // Given
    const hit = motionRandom((n) => (n === SPIN_MOTION_ODDS ? SPIN_HIT : 2));
    // When / Then
    expect(drawSpinMotion(hit.random)._unsafeUnwrap()).toBe(SPIN_MOTIONS[2]);
    expect(hit.calls).toEqual([SPIN_MOTION_ODDS, SPIN_MOTIONS.length]);
  });

  it("外れの目（最後の値以外）では選ばず、2 回目を引かない。0 を返し続ける乱数では毎回出ない", () => {
    for (let roll = 0; roll < LAUNCH_HIT; roll++) {
      // Given
      const miss = motionRandom(() => roll);
      // When / Then
      expect(drawLaunchMotion(miss.random)._unsafeUnwrap()).toBeNull();
      expect(miss.calls).toEqual([LAUNCH_MOTION_ODDS]);
    }
    for (let roll = 0; roll < SPIN_HIT; roll++) {
      const miss = motionRandom(() => roll);
      expect(drawSpinMotion(miss.random)._unsafeUnwrap()).toBeNull();
      expect(miss.calls).toEqual([SPIN_MOTION_ODDS]);
    }
    expect(drawLaunchMotion(() => 0)._unsafeUnwrap()).toBeNull();
    expect(drawSpinMotion(() => 0)._unsafeUnwrap()).toBeNull();
  });

  it("どの動きも選ばれうる", () => {
    // Given / When
    const launches = LAUNCH_MOTIONS.map((_, i) => drawLaunchMotion((n) => (n === LAUNCH_MOTION_ODDS ? LAUNCH_HIT : i))._unsafeUnwrap());
    const spins = SPIN_MOTIONS.map((_, i) => drawSpinMotion((n) => (n === SPIN_MOTION_ODDS ? SPIN_HIT : i))._unsafeUnwrap());
    // Then
    expect(launches).toEqual([...LAUNCH_MOTIONS]);
    expect(spins).toEqual([...SPIN_MOTIONS]);
  });

  it("乱数が契約（[0, n) の整数）を破ったら INVALID_RANDOM", () => {
    for (const bad of [LAUNCH_MOTION_ODDS, -1, 0.5, Number.NaN]) {
      // Given / When / Then
      expect(drawLaunchMotion(() => bad)._unsafeUnwrapErr()).toEqual({ code: "INVALID_RANDOM" });
    }
    for (const bad of [SPIN_MOTION_ODDS, -1, 0.5, Number.NaN]) {
      expect(drawSpinMotion(() => bad)._unsafeUnwrapErr()).toEqual({ code: "INVALID_RANDOM" });
    }
    // 2 回目（どの動きか）の違反
    expect(drawLaunchMotion((n) => (n === LAUNCH_MOTION_ODDS ? LAUNCH_HIT : LAUNCH_MOTIONS.length))._unsafeUnwrapErr()).toEqual({
      code: "INVALID_RANDOM",
    });
    expect(drawSpinMotion((n) => (n === SPIN_MOTION_ODDS ? SPIN_HIT : -1))._unsafeUnwrapErr()).toEqual({ code: "INVALID_RANDOM" });
  });
});

/**
 * @requirements #640 振る舞い 1・3・決めること 2・4（サーバーが引いて回転に載せる）
 */
describe("startSpin（変わった動き）", () => {
  it("動き出しと回転を別々に載せ、当たる人・止まる位置（picks・winnerIndex・settle）は動きなしの回転と同じ", () => {
    // Given: 同じ入力で、動きを引かない回転と、引く回転
    const plain = startSpin(INITIAL_ROULETTE_STATE, spinInput({ randomInt: (n) => n - 1 }))._unsafeUnwrap();
    // When
    const moved = startSpin(
      INITIAL_ROULETTE_STATE,
      spinInput({ randomInt: (n) => n - 1, randomMotion: motionRandom(hitting(2, 1)).random }),
    )._unsafeUnwrap();
    // Then: 動きの名前だけが違う
    expect(moved.lastSpin?.launchMotion).toBe("stumble");
    expect(moved.lastSpin?.spinMotion).toBe("turnback");
    expect({ ...moved.lastSpin, launchMotion: undefined, spinMotion: undefined }).toEqual({
      ...plain.lastSpin,
      launchMotion: undefined,
      spinMotion: undefined,
    });
  });

  it("当たりの乱数（randomInt）は動きの抽選に使わない。動きだけ・当たりだけの乱数は別に受ける", () => {
    // Given: 当たりの乱数は呼ばれた回数と母数を記録する。動きの乱数は別
    const pick = motionRandom(() => 0);
    const motion = motionRandom(hitting(0, 0));
    // When
    const s = startSpin(INITIAL_ROULETTE_STATE, spinInput({ randomInt: pick.random, randomMotion: motion.random }))._unsafeUnwrap();
    // Then
    expect(pick.calls).toEqual([4]);
    expect(motion.calls).toEqual([LAUNCH_MOTION_ODDS, LAUNCH_MOTIONS.length, SPIN_MOTION_ODDS, SPIN_MOTIONS.length]);
    expect(s.lastSpin?.launchMotion).toBe("shake");
    expect(s.lastSpin?.spinMotion).toBe("backward");
  });

  it("動き出しだけ・回転だけも出る（独立）。止まり方とも重なってよい", () => {
    // Given / When
    const onlyLaunch = startSpin(INITIAL_ROULETTE_STATE, spinInput({ randomMotion: hitting(1, null) }))._unsafeUnwrap();
    const onlySpin = startSpin(INITIAL_ROULETTE_STATE, spinInput({ randomMotion: hitting(null, 0) }))._unsafeUnwrap();
    const all = startSpin(
      INITIAL_ROULETTE_STATE,
      spinInput({ randomStyle: (n) => n - 1, randomMotion: hitting(0, 2) }),
    )._unsafeUnwrap();
    // Then
    expect(onlyLaunch.lastSpin?.launchMotion).toBe("windup");
    expect(onlyLaunch.lastSpin).not.toHaveProperty("spinMotion");
    expect(onlySpin.lastSpin?.spinMotion).toBe("backward");
    expect(onlySpin.lastSpin).not.toHaveProperty("launchMotion");
    expect(all.lastSpin?.stopStyle).toBe("swing");
    expect(all.lastSpin?.launchMotion).toBe("shake");
    expect(all.lastSpin?.spinMotion).toBe("fast");
  });

  it("出なければ何も持たない（wire にも載せない）。乱数を渡さなければ引かない", () => {
    // Given / When
    const miss = startSpin(INITIAL_ROULETTE_STATE, spinInput({ randomMotion: () => 0 }))._unsafeUnwrap();
    const none = startSpin(INITIAL_ROULETTE_STATE, spinInput())._unsafeUnwrap();
    // Then
    for (const s of [miss, none]) {
      expect(s.lastSpin).not.toHaveProperty("launchMotion");
      expect(s.lastSpin).not.toHaveProperty("spinMotion");
      expect(toView(s, 1000).spin).not.toHaveProperty("launchMotion");
      expect(toView(s, 1000).spin).not.toHaveProperty("spinMotion");
    }
  });

  it("2 人以上を選ぶときは 1 人目の大きな回転に掛ける（人数ぶんは引かない）", () => {
    // Given
    const state = setPickCount(INITIAL_ROULETTE_STATE, 2)._unsafeUnwrap();
    const motion = motionRandom(hitting(1, 0));
    // When
    const s = startSpin(state, spinInput({ randomMotion: motion.random }))._unsafeUnwrap();
    // Then: 抽選は 1 回の回転につき動き出し 1 回・回転 1 回
    expect(motion.calls).toEqual([LAUNCH_MOTION_ODDS, LAUNCH_MOTIONS.length, SPIN_MOTION_ODDS, SPIN_MOTIONS.length]);
    expect(s.lastSpin?.launchMotion).toBe("windup");
    expect(s.lastSpin?.picks).toHaveLength(2);
    const stops = pickStopsMs(2, null, { launch: "windup", spin: "backward" });
    expect(toView(s, 1000).spin?.durationMs).toBe(stops[1]);
  });

  it("順番に回すときも掛ける", () => {
    // Given / When
    const s = startSpin(modeState("order"), spinInput({ randomMotion: hitting(0, 1) }))._unsafeUnwrap();
    // Then
    expect(s.lastSpin?.launchMotion).toBe("shake");
    expect(s.lastSpin?.spinMotion).toBe("turnback");
    expect(s.lastSpin?.turn).toBe(1);
  });

  it("押して止めるときは掛けない（動きの乱数を引きもしない）。止めた位置と時刻の扱いは変えない", () => {
    // Given
    const motion = motionRandom(hitting(0, 0));
    // When
    const s = startSpin(modeState("press"), spinInput({ randomInt: () => 1, randomMotion: motion.random }))._unsafeUnwrap();
    // Then
    expect(s.lastSpin).not.toHaveProperty("launchMotion");
    expect(s.lastSpin).not.toHaveProperty("spinMotion");
    expect(motion.calls).toEqual([]);
  });

  it("動きの乱数が契約を破ったら INVALID_RANDOM（回さない）", () => {
    // Given / When / Then
    expect(startSpin(INITIAL_ROULETTE_STATE, spinInput({ randomMotion: () => 99 }))._unsafeUnwrapErr()).toEqual({ code: "INVALID_RANDOM" });
    expect(startSpin(modeState("order"), spinInput({ randomMotion: () => 99 }))._unsafeUnwrapErr()).toEqual({ code: "INVALID_RANDOM" });
    // 回転の乱数だけが壊れていても拒む
    expect(
      startSpin(INITIAL_ROULETTE_STATE, spinInput({ randomMotion: (n) => (n === SPIN_MOTION_ODDS ? 99 : 0) }))._unsafeUnwrapErr(),
    ).toEqual({ code: "INVALID_RANDOM" });
  });
});

/**
 * @requirements #640 振る舞い 4・決めること 3（止まるまで回転中・wire の長さ）
 */
describe("変わった動きの回転の長さ", () => {
  const moved = (state: RouletteState = INITIAL_ROULETTE_STATE): RouletteState =>
    startSpin(state, spinInput({ randomMotion: hitting(0, 1) }))._unsafeUnwrap();
  const long = SPIN_DURATION_MS + LAUNCH_MOTION_EXTRA_MS.shake + SPIN_MOTION_EXTRA_MS.turnback;

  it("wire の durationMs は延びた長さで、動きの名前を載せる", () => {
    // Given / When
    const v = toView(moved(), 1000).spin;
    // Then
    expect(v?.durationMs).toBe(long);
    expect(v?.launchMotion).toBe("shake");
    expect(v?.spinMotion).toBe("turnback");
  });

  it("延びた長さが過ぎるまでは回転中として次の回転を拒み、過ぎたら回せる", () => {
    // Given
    const s = moved();
    // When / Then
    expect(startSpin(s, spinInput({ now: 1000 + SPIN_DURATION_MS }))._unsafeUnwrapErr()).toEqual({ code: "ROULETTE_SPINNING" });
    expect(startSpin(s, spinInput({ now: 1000 + long - 1 }))._unsafeUnwrapErr()).toEqual({ code: "ROULETTE_SPINNING" });
    expect(startSpin(s, spinInput({ now: 1000 + long })).isOk()).toBe(true);
  });

  it("速い回転は短く止まる。短い間は回転中、過ぎたら回せる", () => {
    // Given
    const fast = startSpin(INITIAL_ROULETTE_STATE, spinInput({ randomMotion: hitting(null, 2) }))._unsafeUnwrap();
    const short = SPIN_DURATION_MS + SPIN_MOTION_EXTRA_MS.fast;
    // When / Then
    expect(toView(fast, 1000).spin?.durationMs).toBe(short);
    expect(startSpin(fast, spinInput({ now: 1000 + short - 1 }))._unsafeUnwrapErr()).toEqual({ code: "ROULETTE_SPINNING" });
    expect(startSpin(fast, spinInput({ now: 1000 + short })).isOk()).toBe(true);
  });

  it("全員が同じ表を読む: wire の durationMs は pickStopsMs の最後（同じ入力なら全画面が同じ時刻に止まる）", () => {
    // Given
    const s = startSpin(INITIAL_ROULETTE_STATE, spinInput({ randomStyle: (n) => n - 1, randomMotion: hitting(2, 1) }))._unsafeUnwrap();
    // When
    const v = toView(s, 1000).spin;
    // Then
    expect(v?.durationMs).toBe(pickStopsMs(1, "swing", { launch: "stumble", spin: "turnback" }).at(-1));
    expect(v?.durationMs).toBe(spinDurationMs(1, "swing", { launch: "stumble", spin: "turnback" }));
  });
});
