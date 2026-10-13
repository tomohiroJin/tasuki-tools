/**
 * 円盤の幾何（#94 PR 3・spec §6.3・§6.4）。
 *
 * **オラクルは実装と別の計算で組む。** 止まった角度 θ の回転子に対し、指し針の先（画面の座標）を
 * 回転子の座標へ戻し（−θ 回す）、`atan2` で席を引く。`finalAngle` を逆算して比べない
 * （実装と同じ前提を共有して、同じ誤りを正解と見なすため）。
 */
import { describe, expect, it } from 'vitest';
import { TURNS, angleAt, easeOutCubic, finalAngle, pointerDegFor, segmentBoundaryIndex, stageLayoutFor } from '../src/wheel-motion';
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
    for (let n = 2; n <= 24; n++) {
      const s = 360 / n;
      for (let w = 0; w < n; w++) {
        for (const settle of SETTLES) {
          for (const pointerDeg of POINTERS) {
            for (const startDeg of STARTS) {
              const theta = finalAngle(n, w, settle, pointerDeg, startDeg);
              const a = seatAngleUnderPointer(theta, pointerDeg);
              const inSeat = a - w * s;
              const msg = `n=${n} w=${w} settle=${settle} p=${pointerDeg} start=${startDeg}`;
              expect(inSeat, msg).toBeGreaterThanOrEqual(0.2 * s - 1e-6);
              expect(inSeat, msg).toBeLessThanOrEqual(0.8 * s + 1e-6);
            }
          }
        }
      }
    }
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
      for (let mid = 0; mid < 360; mid += 7.5) {
        for (let rotor = 0; rotor < 360; rotor += 1) {
          const p = labelPlacement(mid, rotor, kind);
          const tilt = fold(p.rotate + rotor);
          const msg = `mid=${mid} rotor=${rotor}`;
          // 半径に沿う横書きは上限（長い名前 45°・ほか 60°）、縦書きと半径を横切る横書きは 30° まで
          const limit = p.mode === 'radial' ? radialTiltLimit(kind) : 90 - radialTiltLimit(kind);
          expect(Math.abs(tilt), msg).toBeLessThanOrEqual(limit + 1e-6);
          // 欧文は縦書きにしない・全角主体は半径を横切らない
          expect(p.mode, msg).not.toBe(kind === 'latin' ? 'vertical' : 'across');
          // 行の向き（SVG の角度: 右 0・下 90）。横書きは傾きそのもの・縦書きは 90° + 傾き
          const lineDir = p.mode === 'vertical' ? 90 + tilt : tilt;
          const out = mid + rotor - 90;
          const diff = ((fold(out - lineDir) % 180) + 180) % 180;
          expect(Math.min(diff, 180 - diff), msg).toBeCloseTo(p.mode === 'across' ? 90 : 0, 6);
          if (p.mode === 'across') {
            expect(p.anchor, msg).toBe('middle');
          } else {
            // 行が外へ進むなら終わりを縁に（end）・内へ進むなら始まりを縁に（start）
            const outward = Math.abs(fold(out - lineDir)) < 1;
            expect(p.anchor, msg).toBe(outward ? 'end' : 'start');
          }
        }
      }
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
