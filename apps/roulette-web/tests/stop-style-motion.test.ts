/**
 * 変わった止まり方の角度（#420 spec S1・S2・S6）。
 *
 * **オラクルは実装と別の計算で組む**（`wheel-motion.test.ts` と同じ）。指し針の先を回転子の座標へ戻し、`atan2` で席を引く。
 */
import { describe, expect, it } from 'vitest';
import { STOP_STYLES, pickStopsMs, type StopStyle } from '@tasuki/roulette-core';
import { stopStyleLegsMs } from '../src/stop-style-motion';
import { angleAtPicks, finalAngle, styledAngleAt } from '../src/wheel-motion';

const SETTLES = [0.2, 0.5, 0.8];
const STARTS = [0, 123, 359];
const POINTERS = [180, 90] as const;

function seatAngleUnderPointer(theta: number, pointerDeg: number): number {
  const [px, py] = pointerDeg === 180 ? [0, 60] : [60, 0];
  const rad = (-theta * Math.PI) / 180;
  const x = px * Math.cos(rad) - py * Math.sin(rad);
  const y = px * Math.sin(rad) + py * Math.cos(rad);
  const deg = (Math.atan2(x, -y) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

/** 回転子が `theta` のとき、指し針が指している位置（席の単位・席の番号 + 席の中の位置） */
const positionAt = (theta: number, n: number, pointerDeg: number): number => seatAngleUnderPointer(theta, pointerDeg) / (360 / n);
const seatAt = (theta: number, n: number, pointerDeg: number): number => Math.floor(positionAt(theta, n, pointerDeg) + 1e-9) % n;

/** 1 人目が止まる時刻（core の表） */
const stopOf = (style: StopStyle): number => pickStopsMs(1, style)[0]!;

/** 経過ごとの角度（1ms 刻み） */
function trace(style: StopStyle, n: number, index: number, settle: number, pointerDeg = 180, startDeg = 0): number[] {
  return Array.from({ length: stopOf(style) + 1 }, (_, t) => styledAngleAt(style, t, n, index, settle, pointerDeg, startDeg));
}

/** 向きが変わった回数（止まっている間は数えない） */
function reversals(angles: readonly number[]): number {
  let count = 0;
  let dir = 0;
  for (let i = 1; i < angles.length; i++) {
    const d = angles[i]! - angles[i - 1]!;
    if (Math.abs(d) < 1e-9) continue;
    const next = Math.sign(d);
    if (dir !== 0 && next !== dir) count++;
    dir = next;
  }
  return count;
}

/** 止まっている（角度が変わらない）区間の長さ（ms）の一覧 */
function holds(angles: readonly number[]): number[] {
  const out: number[] = [];
  let run = 0;
  for (let i = 1; i < angles.length; i++) {
    if (angles[i] === angles[i - 1]) run++;
    else {
      if (run > 0) out.push(run);
      run = 0;
    }
  }
  if (run > 0) out.push(run);
  return out;
}

describe('止まり方の動き: 共通の約束', () => {
  it('動きの長さは core の表（1 人目が止まる時刻）と同じ', () => {
    for (const style of STOP_STYLES) expect(stopStyleLegsMs(style), style).toBe(stopOf(style));
  });

  it('回し始めは開始角で、止まる時刻からは普通の止まり方と同じ角度（どの画面も同じ席・同じ位置で止まる）', () => {
    const bad: string[] = [];
    for (const style of STOP_STYLES) {
      for (const n of [2, 3, 6, 24]) {
        for (const settle of SETTLES) {
          for (const pointerDeg of POINTERS) {
            for (const startDeg of STARTS) {
              const w = n - 1;
              const final = finalAngle(n, w, settle, pointerDeg, startDeg);
              if (styledAngleAt(style, 0, n, w, settle, pointerDeg, startDeg) !== startDeg) bad.push(`${style} start`);
              for (const t of [stopOf(style), stopOf(style) + 1, 99_999]) {
                if (styledAngleAt(style, t, n, w, settle, pointerDeg, startDeg) !== final) bad.push(`${style} n=${n} t=${t}`);
              }
              const at = positionAt(final, n, pointerDeg);
              if (Math.abs(at - (w + settle)) > 1e-6) bad.push(`${style} n=${n} seat ${at}`);
            }
          }
        }
      }
    }
    expect(bad.slice(0, 5), `外れた組 ${bad.length} 件`).toEqual([]);
  });

  it('どの経過でも 1ms で跳ばない（区間の境目を含む）', () => {
    for (const style of STOP_STYLES) {
      for (const n of [2, 6, 24]) {
        const angles = trace(style, n, 1, 0.5, 90, 123);
        let worst = 0;
        for (let i = 1; i < angles.length; i++) worst = Math.max(worst, Math.abs(angles[i]! - angles[i - 1]!));
        // 回し始めが最も速い（約 1.2°/ms）
        expect(worst, `${style} n=${n}`).toBeLessThan(2);
      }
    }
  });

  it('向きの切り返しは 1 秒に 3 回まで（速い行き来で点滅に見えない・WCAG 2.3.1）', () => {
    for (const style of STOP_STYLES) {
      const angles = trace(style, 6, 2, 0.5);
      const times: number[] = [];
      let dir = 0;
      for (let i = 1; i < angles.length; i++) {
        const d = angles[i]! - angles[i - 1]!;
        if (Math.abs(d) < 1e-9) continue;
        if (dir !== 0 && Math.sign(d) !== dir) times.push(i);
        dir = Math.sign(d);
      }
      for (let i = 3; i < times.length; i++) expect(times[i]! - times[i - 3]!, style).toBeGreaterThanOrEqual(1000);
    }
  });
});

describe('止まり方の動き: それぞれの見え方', () => {
  const n = 6;
  const w = 2;
  const settle = 0.5;

  it('もう一押し: ほぼ止まりかけてから再び 1 周以上回る（逆には回らない）', () => {
    const angles = trace('nudge', n, w, settle);
    expect(reversals(angles)).toBe(0);
    // 最も遅くなる瞬間の後に、1 周以上進む
    let slowest = 1;
    let slowSpeed = Number.POSITIVE_INFINITY;
    for (let t = 1000; t < angles.length - 1000; t++) {
      const v = angles[t + 1]! - angles[t]!;
      if (v < slowSpeed) [slowest, slowSpeed] = [t, v];
    }
    expect(slowSpeed).toBeLessThan(0.02);
    expect(angles.at(-1)! - angles[slowest]!).toBeGreaterThanOrEqual(360);
  });

  it('行き過ぎて戻る: 当たりの次の席で止まってから、逆に戻って当たりで止まる', () => {
    const angles = trace('overshoot', n, w, settle);
    const peak = angles.indexOf(Math.max(...angles));
    expect(seatAt(angles[peak]!, n, 180)).not.toBe(w);
    expect(reversals(angles)).toBe(1);
    expect(holds(angles).some((ms) => ms >= 200)).toBe(true);
  });

  it('じりじり: 当たりの 1 席手前で止まって間を置き、1 席進む', () => {
    const angles = trace('creep', n, w, settle);
    const longest = Math.max(...holds(angles));
    expect(longest).toBeGreaterThanOrEqual(800);
    const holdAt = angles.findIndex((a, i) => i > 0 && a === angles[i - 1]);
    expect(seatAt(angles[holdAt]!, n, 180)).toBe((w + 1) % n);
    expect(angles.at(-1)! - angles[holdAt]!).toBeCloseTo(360 / n, 6);
    expect(reversals(angles)).toBe(0);
  });

  it('境目でぐらつく: 当たりの手前の境目をまたいで 3 回以上揺れてから止まる', () => {
    const angles = trace('wobble', n, w, settle);
    expect(reversals(angles)).toBeGreaterThanOrEqual(3);
    // 揺れている間、指し針は当たりの席と 1 つ手前の席を行き来する
    const late = angles.slice(3800, 4800).map((a) => seatAt(a, n, 180));
    expect(new Set(late)).toEqual(new Set([w, (w + 1) % n]));
  });

  it('一瞬の逆回り: 止まる 1 秒以上前に、一瞬だけ逆に回る', () => {
    const angles = trace('reverse', n, w, settle);
    expect(reversals(angles)).toBe(2);
    const back = angles.findIndex((a, i) => i > 0 && a < angles[i - 1]!);
    expect(back).toBeLessThan(angles.length - 1000);
  });

  it('ため: 最後の 2 秒は、1 秒に 1 席より遅いまま進み続ける', () => {
    const angles = trace('linger', n, w, settle);
    const seat = 360 / n;
    for (let t = angles.length - 2000; t < angles.length - 300; t += 100) {
      const v = angles[t + 100]! - angles[t]!;
      expect(v).toBeGreaterThan(0);
      expect(v * 10).toBeLessThan(seat);
    }
    expect(reversals(angles)).toBe(0);
  });

  it('二度止め: ほかの席で一度止まって間を置き、もう 1 周以上回って当たりで止まる（n=2 でもほかの席で止まる）', () => {
    for (const k of [2, 6, 24]) {
      const angles = trace('double', k, k - 1, settle);
      const holdAt = angles.findIndex((a, i) => i > 0 && a === angles[i - 1]);
      expect(Math.max(...holds(angles))).toBeGreaterThanOrEqual(600);
      expect(seatAt(angles[holdAt]!, k, 180), `n=${k}`).not.toBe(k - 1);
      expect(angles.at(-1)! - angles[holdAt]!).toBeGreaterThanOrEqual(360);
    }
  });

  it('揺り戻し: 当たりを越えたところで止まり、振り子のように前後に揺れて小さくなる', () => {
    const angles = trace('swing', n, w, settle);
    const final = angles.at(-1)!;
    expect(Math.max(...angles)).toBeGreaterThan(final);
    expect(reversals(angles)).toBeGreaterThanOrEqual(3);
    // 揺れは小さくなっていく
    const tail = angles.slice(SWING_FROM);
    const firstHalf = Math.max(...tail.slice(0, 800).map((a) => Math.abs(a - final)));
    const secondHalf = Math.max(...tail.slice(800).map((a) => Math.abs(a - final)));
    expect(secondHalf).toBeLessThan(firstHalf);
  });
});

/** 揺り戻しの揺れが始まる時刻（普通の回転の長さ） */
const SWING_FROM = pickStopsMs(1)[0]!;

describe('angleAtPicks: 変わった止まり方を 1 人目に掛ける', () => {
  const pick = (index: number, settle: number) => ({ index, settle });

  it('1 人なら止まり方の角度そのもの', () => {
    for (const style of STOP_STYLES) {
      for (const t of [0, 1500, 4100, 5000, stopOf(style), 99_999]) {
        expect(angleAtPicks(t, [pick(3, 0.4)], 7, 180, 37, style)).toBe(styledAngleAt(style, t, 7, 3, 0.4, 180, 37));
      }
    }
  });

  it('2 人以上: i 人目が止まる時刻（延びた表）に、指し針の下はその人の席の settle の位置', () => {
    const picks = [pick(1, 0.3), pick(4, 0.6), pick(2, 0.5)];
    for (const style of STOP_STYLES) {
      const stops = pickStopsMs(3, style);
      picks.forEach((p, i) => {
        const at = positionAt(angleAtPicks(stops[i]!, picks, 6, 90, 10, style), 6, 90);
        expect(at, `${style} i=${i}`).toBeCloseTo(p.index + p.settle, 6);
      });
    }
  });

  it('知らない止まり方・止まり方が無いときは普通の止まり方', () => {
    for (const t of [0, 1000, 3999, 4000, 6000]) {
      expect(angleAtPicks(t, [pick(1, 0.5)], 5, 180, 0, 'spiral')).toBe(angleAtPicks(t, [pick(1, 0.5)], 5, 180, 0));
      expect(angleAtPicks(t, [pick(1, 0.5)], 5, 180, 0, undefined)).toBe(angleAtPicks(t, [pick(1, 0.5)], 5, 180, 0));
    }
  });
});
