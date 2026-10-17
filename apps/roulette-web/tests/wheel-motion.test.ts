/**
 * 円盤の幾何（#94 PR 3・spec §6.3・§6.4）。
 *
 * **オラクルは実装と別の計算で組む。** 止まった角度 θ の回転子に対し、指し針の先（画面の座標）を
 * 回転子の座標へ戻し（−θ 回す）、`atan2` で席を引く。`finalAngle` を逆算して比べない
 * （実装と同じ前提を共有して、同じ誤りを正解と見なすため）。
 */
import { describe, expect, it } from 'vitest';
import { pickStopsMs, STOP_HOLD_MS } from '@tasuki/roulette-core';
import { TURNS, angleAt, angleAtPicks, easeOutCubic, finalAngle, pointerDegFor, segmentBoundaryIndex, stageLayoutFor } from '../src/wheel-motion';
import { fitLabel, labelKindOf, labelPlacement, radialTiltLimit, toneOf } from '../src/wheel-geometry';

const DURATION = 4000;
const SETTLES = [0.2, 0.5, 0.8];
const STARTS = [0, 37.5, 123, 359];
const POINTERS = [180, 90] as const;

/** 画面（SVG・y が下）の点を、回転子（θ だけ時計回り）の座標へ戻し、「真上 0°・時計回り」の角度で返す。 */
function seatAngleUnderPointer(theta: number, pointerDeg: number): number {
  // 指し針の先: 下（180°）なら (0, 60)・右（90°）なら (60, 0)
  const [px, py] = pointerDeg === 180 ? [0, 60] : [60, 0];
  const rad = (-theta * Math.PI) / 180;
  const x = px * Math.cos(rad) - py * Math.sin(rad);
  const y = px * Math.sin(rad) + py * Math.cos(rad);
  const deg = (Math.atan2(x, -y) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

describe('finalAngle: どの画面も同じ席で止まる', () => {
  it('指し針の下にあるのは当たりの席の中で、境目から 0.2 席ぶん以上離れている（n=2〜24・全席・settle・指し針・開始角）', () => {
    const bad: string[] = [];
    for (let n = 2; n <= 24; n++) {
      const s = 360 / n;
      for (let w = 0; w < n; w++) {
        for (const settle of SETTLES) {
          for (const pointerDeg of POINTERS) {
            for (const startDeg of STARTS) {
              const theta = finalAngle(n, w, settle, pointerDeg, startDeg);
              const a = seatAngleUnderPointer(theta, pointerDeg);
              const inSeat = a - w * s;
              // 1 組ごとに expect を呼ばない（CI で遅い）。外れた組だけ集める
              if (inSeat < 0.2 * s - 1e-6 || inSeat > 0.8 * s + 1e-6) {
                bad.push(`n=${n} w=${w} settle=${settle} p=${pointerDeg} start=${startDeg}: 席の中の位置 ${inSeat.toFixed(2)}`);
              }
            }
          }
        }
      }
    }
    expect(bad.slice(0, 5), `外れた組 ${bad.length} 件`).toEqual([]);
  });

  it('余分に TURNS 周以上は回る', () => {
    for (const startDeg of STARTS) {
      for (const n of [2, 5, 24]) {
        expect(finalAngle(n, 1, 0.5, 180, startDeg) - startDeg).toBeGreaterThanOrEqual(360 * TURNS);
      }
    }
  });
});

describe('angleAt', () => {
  const args = [7, 3, 0.4, 90, 123] as const;
  it('始まりは開始角・終わりは finalAngle', () => {
    expect(angleAt(0, DURATION, ...args)).toBe(123);
    expect(angleAt(DURATION, DURATION, ...args)).toBe(finalAngle(...args));
    expect(angleAt(DURATION * 3, DURATION, ...args)).toBe(finalAngle(...args));
    expect(angleAt(-50, DURATION, ...args)).toBe(123);
  });
  it('単調に増える（100 点）', () => {
    let prev = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const a = angleAt((DURATION * i) / 100, DURATION, ...args);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });
  it('減速は 3 次（半分の時間で 7/8 まで進む）', () => {
    const total = finalAngle(...args) - 123;
    expect(angleAt(DURATION / 2, DURATION, ...args) - 123).toBeCloseTo(total * 0.875, 6);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 9);
  });
});

describe('segmentBoundaryIndex: 指し針の下の席の番号', () => {
  it('atan2 で引いた席と一致する（境目を避けた角度）', () => {
    for (const n of [2, 5, 13, 24]) {
      const s = 360 / n;
      for (const pointerDeg of POINTERS) {
        for (let k = 0; k < 90; k++) {
          const theta = k * 13.7 + 0.3;
          const a = seatAngleUnderPointer(theta, pointerDeg);
          if ((a % s) < 0.01 || (a % s) > s - 0.01) continue;
          expect(segmentBoundaryIndex(theta, n, pointerDeg)).toBe(Math.floor(a / s));
        }
      }
    }
  });
});

describe('toneOf', () => {
  it('隣り合う席（最後と最初を含む）が同じ色にならない（n=2〜24）', () => {
    for (let n = 2; n <= 24; n++) {
      for (let i = 0; i < n; i++) {
        expect(toneOf(i, n), `n=${n} i=${i}`).not.toBe(toneOf((i + 1) % n, n));
      }
    }
  });
  it('偶数は a/b の交互・奇数の最後だけ c', () => {
    expect(toneOf(0, 4)).toBe('a');
    expect(toneOf(1, 4)).toBe('b');
    expect(toneOf(4, 5)).toBe('c');
    expect(toneOf(3, 5)).toBe('b');
  });
});

/** 角度を −180〜180 に畳む */
const fold = (x: number): number => ((((x + 180) % 360) + 360) % 360) - 180;

describe('labelPlacement（4 版）', () => {
  it.each(['latin', 'short', 'long'] as const)(
    '%s: 回転子の角度 0〜359 と席の位置の全組で、字の傾きが上限以内・行（または行に直交する向き）が半径に沿う',
    (kind) => {
      // 全組（48 × 360）の 1 組ごとに expect を呼ぶと CI で時間切れになった（手元 0.5 秒・CI 8 秒超）。
      // 判定は素の比較で数え、最後に 1 度だけ比べる（網羅の組は減らさない）
      const bad: string[] = [];
      const fail = (msg: string, what: string): void => {
        if (bad.length < 5) bad.push(`${msg}: ${what}`);
      };
      let count = 0;
      for (let mid = 0; mid < 360; mid += 7.5) {
        for (let rotor = 0; rotor < 360; rotor += 1) {
          count += 1;
          const p = labelPlacement(mid, rotor, kind);
          const tilt = fold(p.rotate + rotor);
          const msg = `mid=${mid} rotor=${rotor}`;
          // 半径に沿う横書きは上限（長い名前 45°・ほか 60°）、縦書きと半径を横切る横書きは 30° まで
          const limit = p.mode === 'radial' ? radialTiltLimit(kind) : 90 - radialTiltLimit(kind);
          if (Math.abs(tilt) > limit + 1e-6) fail(msg, `字の傾き ${tilt} > ${limit}`);
          // 欧文は縦書きにしない・全角主体は半径を横切らない
          if (p.mode === (kind === 'latin' ? 'vertical' : 'across')) fail(msg, `書き方 ${p.mode}`);
          // 行の向き（SVG の角度: 右 0・下 90）。横書きは傾きそのもの・縦書きは 90° + 傾き
          const lineDir = p.mode === 'vertical' ? 90 + tilt : tilt;
          const out = mid + rotor - 90;
          const diff = ((fold(out - lineDir) % 180) + 180) % 180;
          const off = Math.min(diff, 180 - diff);
          if (Math.abs(off - (p.mode === 'across' ? 90 : 0)) > 1e-6) fail(msg, `行と半径の角 ${off}`);
          // 横切るなら中央揃え。ほかは、行が外へ進むなら終わりを縁に（end）・内へ進むなら始まりを縁に（start）
          const anchor = p.mode === 'across' ? 'middle' : Math.abs(fold(out - lineDir)) < 1 ? 'end' : 'start';
          if (p.anchor !== anchor) fail(msg, `揃え ${p.anchor}（期待 ${anchor}）`);
        }
      }
      expect(count).toBe(48 * 360);
      expect(bad).toEqual([]);
    },
  );

  it('書き方の切り替えの具体値（画面上の角度 = mid + rotor）', () => {
    // 真下の席: 長い名前は縦書き・欧文は半径を横切る横書き
    expect(labelPlacement(180, 0, 'long')).toMatchObject({ mode: 'vertical', rotate: 0 });
    expect(labelPlacement(180, 0, 'latin')).toMatchObject({ mode: 'across', rotate: 0, anchor: 'middle' });
    // 半径が縦から 40° の席（画面 140°）: 長い名前は縦書き（字 −40°）・短い名前は横書き（字 −50°・左から右へ読む）
    expect(labelPlacement(140, 0, 'long')).toMatchObject({ mode: 'vertical', tilt: -40 });
    expect(labelPlacement(140, 0, 'short')).toMatchObject({ mode: 'radial', tilt: 50 });
    // 縦から 25° の席: 短い名前も縦書き
    expect(labelPlacement(155, 0, 'short')).toMatchObject({ mode: 'vertical', tilt: -25 });
    // 右の席はどれも横書き。回転子だけ違っても同じ向き（rotate は回転子の回転ぶんを打ち消す）
    expect(labelPlacement(90, 0, 'latin')).toMatchObject({ mode: 'radial', rotate: 0 });
    expect(labelPlacement(30, 120, 'long')).toMatchObject({ mode: 'vertical', rotate: -30 - 120 });
  });

  it('labelKindOf: 欧文（半角が半分以上）・短い（全角 3 字まで）・長い', () => {
    expect(labelKindOf('Mika')).toBe('latin');
    expect(labelKindOf('e2e-roulette-a')).toBe('latin');
    expect(labelKindOf('Ken Lee')).toBe('latin');
    expect(labelKindOf('山田')).toBe('short');
    expect(labelKindOf('あおい')).toBe('short');
    expect(labelKindOf('佐藤 花子')).toBe('long');
    expect(labelKindOf('山田B')).toBe('short');
  });

  it('半角カナ（U+FF61〜FF9F）は欧文と同じに数え、同じ書き方・同じ切り方になる', () => {
    // 「ﾔﾏﾀﾞ」は 5 字（ﾀ と濁点の ﾞ は別の字）。全角と数えると「長い名前」になり、真下の席で縦に積まれる
    expect(labelKindOf('ﾔﾏﾀﾞ')).toBe(labelKindOf('Mika'));
    expect(labelPlacement(180, 0, labelKindOf('ﾔﾏﾀﾞ'))).toEqual(labelPlacement(180, 0, labelKindOf('Mika')));
    // 境目の字（U+FF61「｡」・U+FF9F「ﾟ」）も半角。その外（U+FF60「｠」・U+FFA0）は全角
    expect(labelKindOf('\uFF61\uFF9F')).toBe('latin');
    expect(labelKindOf('\uFF60\uFFA0')).not.toBe('latin');
    // 切り方も 0.6 で数える（10 字は欧文と同じく 9 字で切れる。全角と数えると 5 字で切れる）
    expect(fitLabel('ﾔﾏﾀﾞｶｽﾞｵﾐｷ', 5.5)).toBe('ﾔﾏﾀﾞｶｽﾞｵﾐ…');
    expect(fitLabel('abcdefghij', 5.5)).toBe('abcdefghi…');
  });
});

describe('stageLayoutFor / pointerDegFor', () => {
  it('720px 以上で横並び', () => {
    expect(stageLayoutFor(719)).toBe('stack');
    expect(stageLayoutFor(720)).toBe('row');
  });
  it('指し針は縦積みで下（180°）・横並びで右（90°）', () => {
    expect(pointerDegFor('stack')).toBe(180);
    expect(pointerDegFor('row')).toBe(90);
  });
});

describe('fitLabel', () => {
  it('全角は 1・半角は 0.6 で数え、溢れたら … で切る', () => {
    expect(fitLabel('あいうえおかき', 5.5)).toBe('あいうえお…');
    expect(fitLabel('abcdefghijk', 5.5)).toBe('abcdefghi…');
  });
  it('ちょうど収まる名前は切らない', () => {
    expect(fitLabel('あいうえお', 5)).toBe('あいうえお');
    expect(fitLabel('abcde', 3)).toBe('abcde');
  });
  it('1 字ぶん溢れると切る', () => {
    expect(fitLabel('あいうえおか', 5)).toBe('あいうえお…');
  });
  it('縦書き（欧文も立てて積む）では半角も 1 で数える', () => {
    expect(fitLabel('abcdefghijk', 5.5, true)).toBe('abcde…');
    expect(fitLabel('Mika', 5.5, true)).toBe('Mika');
    expect(fitLabel('あいうえおかき', 5.5, true)).toBe('あいうえお…');
  });
});

/**
 * k 人を続けて止める角度（#401 spec §6.2）。オラクルは上と同じ「指し針の先を回転子の座標へ戻して atan2 で席を引く」。
 *
 * @requirements #401 E7 E8
 */
describe('angleAtPicks: 1 人ずつ続けて止まる', () => {
  const pick = (index: number, settle: number) => ({ index, settle });

  it('1 人のときは #94 の angleAt と全経過で同じ値で、終わった後は finalAngle', () => {
    for (const startDeg of STARTS) {
      for (const pointerDeg of POINTERS) {
        for (let t = 0; t <= DURATION; t += 50) {
          expect(angleAtPicks(t, [pick(3, 0.4)], 7, pointerDeg, startDeg)).toBe(angleAt(t, DURATION, 7, 3, 0.4, pointerDeg, startDeg));
        }
        expect(angleAtPicks(DURATION + 999, [pick(3, 0.4)], 7, pointerDeg, startDeg)).toBe(finalAngle(7, 3, 0.4, pointerDeg, startDeg));
      }
    }
  });

  it('i 人目が止まる時刻に、指し針の下はその人の席の settle の位置（n・人数・指し針・開始角を変えて）', () => {
    const bad: string[] = [];
    for (const n of [3, 5, 8, 24]) {
      for (const k of [2, 3, 4]) {
        const picks = Array.from({ length: k }, (_, i) => pick((i * 5 + 1) % n, SETTLES[i % 3]!));
        const stops = pickStopsMs(k);
        for (const pointerDeg of POINTERS) {
          for (const startDeg of STARTS) {
            picks.forEach((p, i) => {
              const theta = angleAtPicks(stops[i]!, picks, n, pointerDeg, startDeg);
              const a = seatAngleUnderPointer(theta, pointerDeg);
              const at = a / (360 / n);
              if (Math.abs(at - (p.index + p.settle)) > 1e-6) bad.push(`n=${n} k=${k} i=${i} p=${pointerDeg} start=${startDeg}: ${at.toFixed(3)}`);
            });
          }
        }
      }
    }
    expect(bad.slice(0, 5), `外れた組 ${bad.length} 件`).toEqual([]);
  });

  it('止まっている間（置く時間）は動かず、送るときは 1 周以上回る', () => {
    const picks = [pick(0, 0.5), pick(3, 0.5), pick(1, 0.5)];
    const stops = pickStopsMs(3);
    const atStop = angleAtPicks(stops[0]!, picks, 6, 180, 0);
    expect(angleAtPicks(stops[0]! + STOP_HOLD_MS, picks, 6, 180, 0)).toBe(atStop);
    expect(angleAtPicks(stops[1]!, picks, 6, 180, 0) - atStop).toBeGreaterThanOrEqual(360);
  });

  it('どの経過でも 1ms で跳ばない（区間の境目を含む）', () => {
    const picks = [pick(2, 0.3), pick(5, 0.7), pick(0, 0.5), pick(4, 0.2)];
    const end = pickStopsMs(4).at(-1)!;
    let prev = angleAtPicks(0, picks, 6, 90, 123);
    let worst = 0;
    for (let t = 1; t <= end + 10; t++) {
      const a = angleAtPicks(t, picks, 6, 90, 123);
      worst = Math.max(worst, Math.abs(a - prev));
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
    // 1 人目の回し始めが最も速い（約 1.2°/ms）。区間の境目で跳ぶとこれを大きく超える
    expect(worst).toBeLessThan(2);
  });
});
