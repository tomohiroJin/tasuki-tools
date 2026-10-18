import { describe, expect, it } from "vitest";
import {
  SPIN_DURATION_MS,
  STOP_HOLD_MS,
  NEXT_MOVE_MS,
  STOP_STYLES,
  STOP_STYLE_EXTRA_MS,
  STOP_STYLE_ODDS,
  pickStopsMs,
  spinDurationMs,
  stopStyleExtraMs,
} from "../src/limits.js";
import { drawStopStyle } from "../src/stop-style.js";
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

/** 止まり方を引く乱数。1 回目（出るか）と 2 回目（どれか）に返す値を決める */
function styleRandom(roll: number, which = 0): { random: (n: number) => number; calls: number[] } {
  const calls: number[] = [];
  return {
    calls,
    random: (n) => {
      calls.push(n);
      return calls.length === 1 ? roll : which;
    },
  };
}

/** 出る目（`[0, STOP_STYLE_ODDS)` の最後の値） */
const HIT = STOP_STYLE_ODDS - 1;

function modeState(mode: "once" | "order" | "press", patch: Partial<RouletteState> = {}): RouletteState {
  return { ...setMode(INITIAL_ROULETTE_STATE, mode, 0)._unsafeUnwrap(), ...patch };
}

/**
 * @requirements #420 振る舞い 1・spec S2（止まり方の表と長さ）
 */
describe("止まり方の表と回転の長さ", () => {
  it("止まり方は 8 種で、名前は重ならない。確率は 1/24（1 日の時間の数）", () => {
    // Given / When / Then
    expect(STOP_STYLES).toHaveLength(8);
    expect(new Set(STOP_STYLES).size).toBe(STOP_STYLES.length);
    expect(STOP_STYLE_ODDS).toBe(24);
  });

  it("どの止まり方も、延びる長さは 1〜3 秒", () => {
    // Given / When / Then
    for (const style of STOP_STYLES) {
      expect(STOP_STYLE_EXTRA_MS[style]).toBeGreaterThanOrEqual(1000);
      expect(STOP_STYLE_EXTRA_MS[style]).toBeLessThanOrEqual(3000);
    }
  });

  it("止まり方が無い・知らない名前なら延ばさない（新しいサーバーの知らない止まり方は普通の長さで描く）", () => {
    // Given / When / Then
    expect(stopStyleExtraMs(undefined)).toBe(0);
    expect(stopStyleExtraMs(null)).toBe(0);
    expect(stopStyleExtraMs("toString")).toBe(0);
    expect(stopStyleExtraMs("unknown")).toBe(0);
    expect(stopStyleExtraMs("double")).toBe(STOP_STYLE_EXTRA_MS.double);
  });

  it("1 人目が止まる時刻だけが延び、2 人目からはその分だけ後ろへずれる", () => {
    // Given
    const extra = STOP_STYLE_EXTRA_MS.overshoot;
    // When / Then
    expect(pickStopsMs(1, "overshoot")).toEqual([SPIN_DURATION_MS + extra]);
    expect(pickStopsMs(3, "overshoot")).toEqual([
      SPIN_DURATION_MS + extra,
      SPIN_DURATION_MS + extra + STOP_HOLD_MS + NEXT_MOVE_MS,
      SPIN_DURATION_MS + extra + 2 * (STOP_HOLD_MS + NEXT_MOVE_MS),
    ]);
    expect(spinDurationMs(3, "overshoot")).toBe(spinDurationMs(3) + extra);
    // 止まり方が無ければ #401 の表のまま
    expect(pickStopsMs(2, undefined)).toEqual(pickStopsMs(2));
  });
});

/**
 * @requirements #420 振る舞い 1・spec S3（確率と乱数の注入）
 */
describe("drawStopStyle（止まり方を引く）", () => {
  it("1/24 の目（最後の値）のときだけ止まり方を選ぶ。2 回目は止まり方の数を渡す", () => {
    // Given
    const hit = styleRandom(HIT, 3);
    // When / Then
    expect(drawStopStyle(hit.random)._unsafeUnwrap()).toBe(STOP_STYLES[3]);
    expect(hit.calls).toEqual([STOP_STYLE_ODDS, STOP_STYLES.length]);
  });

  it("ほかの 23 の目では選ばず、2 回目を引かない", () => {
    for (let roll = 0; roll < HIT; roll++) {
      // Given
      const miss = styleRandom(roll);
      // When / Then
      expect(drawStopStyle(miss.random)._unsafeUnwrap()).toBeNull();
      expect(miss.calls).toEqual([STOP_STYLE_ODDS]);
    }
  });

  it("どの止まり方も選ばれうる", () => {
    // Given / When
    const got = STOP_STYLES.map((_, i) => drawStopStyle(styleRandom(HIT, i).random)._unsafeUnwrap());
    // Then
    expect(got).toEqual([...STOP_STYLES]);
  });

  it("乱数が契約（[0, n) の整数）を破ったら INVALID_RANDOM", () => {
    for (const r of [styleRandom(STOP_STYLE_ODDS), styleRandom(-1), styleRandom(0.5), styleRandom(HIT, STOP_STYLES.length)]) {
      // Given / When / Then
      expect(drawStopStyle(r.random)._unsafeUnwrapErr()).toEqual({ code: "INVALID_RANDOM" });
    }
  });
});

/**
 * @requirements #420 振る舞い 2・3・spec S1・S4（サーバーが選んで回転に載せる）
 */
describe("startSpin（変わった止まり方）", () => {
  it("1 回で決める: 出た止まり方を回転に載せ、当たりは変えない", () => {
    // Given: 止まり方を引かない回転と、引いた回転
    const plain = startSpin(INITIAL_ROULETTE_STATE, spinInput())._unsafeUnwrap();
    // When
    const styled = startSpin(INITIAL_ROULETTE_STATE, spinInput({ randomStyle: styleRandom(HIT, 1).random }))._unsafeUnwrap();
    // Then: 止まり方だけが違う
    expect(styled.lastSpin?.stopStyle).toBe(STOP_STYLES[1]);
    expect({ ...styled.lastSpin, stopStyle: undefined }).toEqual({ ...plain.lastSpin, stopStyle: undefined });
    expect(styled.drawn).toEqual(plain.drawn);
  });

  it("出なければ止まり方を持たない（wire にも載せない）", () => {
    // Given / When
    const s = startSpin(INITIAL_ROULETTE_STATE, spinInput({ randomStyle: styleRandom(0).random }))._unsafeUnwrap();
    // Then
    expect(s.lastSpin).not.toHaveProperty("stopStyle");
    expect(toView(s, 1000).spin).not.toHaveProperty("stopStyle");
  });

  it("止まり方の乱数を渡さなければ引かない", () => {
    // Given / When
    const s = startSpin(INITIAL_ROULETTE_STATE, spinInput())._unsafeUnwrap();
    // Then
    expect(s.lastSpin).not.toHaveProperty("stopStyle");
  });

  it("2 人以上を選ぶときも掛ける（1 人目の大きな回転に）", () => {
    // Given
    const state = setPickCount(INITIAL_ROULETTE_STATE, 2)._unsafeUnwrap();
    // When
    const s = startSpin(state, spinInput({ randomStyle: styleRandom(HIT, 0).random }))._unsafeUnwrap();
    // Then
    expect(s.lastSpin?.stopStyle).toBe(STOP_STYLES[0]);
    expect(s.lastSpin?.picks).toHaveLength(2);
  });

  it("順番に回すときも掛ける", () => {
    // Given / When
    const s = startSpin(modeState("order"), spinInput({ randomStyle: styleRandom(HIT, 2).random }))._unsafeUnwrap();
    // Then
    expect(s.lastSpin?.stopStyle).toBe(STOP_STYLES[2]);
    expect(s.lastSpin?.turn).toBe(1);
  });

  it("押して止めるときは掛けない（止まり方の乱数を引きもしない）", () => {
    // Given
    const r = styleRandom(HIT, 0);
    // When
    const s = startSpin(modeState("press"), spinInput({ randomInt: () => 1, randomStyle: r.random }))._unsafeUnwrap();
    // Then
    expect(s.lastSpin).not.toHaveProperty("stopStyle");
    expect(r.calls).toEqual([]);
  });

  it("止まり方の乱数が契約を破ったら INVALID_RANDOM（回さない）", () => {
    // Given / When / Then
    expect(startSpin(INITIAL_ROULETTE_STATE, spinInput({ randomStyle: () => 99 }))._unsafeUnwrapErr()).toEqual({ code: "INVALID_RANDOM" });
    expect(startSpin(modeState("order"), spinInput({ randomStyle: () => 99 }))._unsafeUnwrapErr()).toEqual({ code: "INVALID_RANDOM" });
  });
});

/**
 * @requirements #420 振る舞い 4・spec S2・S5（止まるまで回転中・wire の長さ）
 */
describe("変わった止まり方の回転の長さ", () => {
  const style = STOP_STYLES[6]!;
  const long = SPIN_DURATION_MS + STOP_STYLE_EXTRA_MS[style];

  function styled(state: RouletteState = INITIAL_ROULETTE_STATE): RouletteState {
    return startSpin(state, spinInput({ randomStyle: styleRandom(HIT, 6).random }))._unsafeUnwrap();
  }

  it("wire の durationMs は延びた長さで、止まり方の名前を載せる", () => {
    // Given / When
    const v = toView(styled(), 1000).spin;
    // Then
    expect(v?.durationMs).toBe(long);
    expect(v?.stopStyle).toBe(style);
    expect(toView(styled(), 1000 + 99_999).spin?.elapsedMs).toBe(long);
  });

  it("延びた長さが過ぎるまでは回転中として次の回転を拒み、過ぎたら回せる", () => {
    // Given
    const s = styled();
    // When / Then
    expect(startSpin(s, spinInput({ now: 1000 + SPIN_DURATION_MS }))._unsafeUnwrapErr()).toEqual({ code: "ROULETTE_SPINNING" });
    expect(startSpin(s, spinInput({ now: 1000 + long - 1 }))._unsafeUnwrapErr()).toEqual({ code: "ROULETTE_SPINNING" });
    expect(startSpin(s, spinInput({ now: 1000 + long })).isOk()).toBe(true);
  });

  it("延びた長さが過ぎるまでは決め方を変えられない", () => {
    // Given
    const s = styled();
    // When / Then
    expect(setMode(s, "order", 1000 + long - 1)._unsafeUnwrapErr()).toEqual({ code: "ROULETTE_SPINNING" });
    expect(setMode(s, "order", 1000 + long).isOk()).toBe(true);
  });
});
