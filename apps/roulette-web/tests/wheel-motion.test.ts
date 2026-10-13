/**
 * 円盤の幾何（#94 PR 3・spec §6.3・§6.4）。
 *
 * **オラクルは実装と別の計算で組む。** 止まった角度 θ の回転子に対し、指し針の先（画面の座標）を
 * 回転子の座標へ戻し（−θ 回す）、`atan2` で席を引く。`finalAngle` を逆算して比べない
 * （実装と同じ前提を共有して、同じ誤りを正解と見なすため）。
 */
import { describe, expect, it } from 'vitest';
import { TURNS, angleAt, easeOutCubic, finalAngle, pointerDegFor, segmentBoundaryIndex, stageLayoutFor } from '../src/wheel-motion';
import { fitLabel, labelPlacement, toneOf } from '../src/wheel-geometry';

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

describe('labelPlacement（3 版）', () => {
  it('回転子の角度 0〜359 と席の位置の全組で、画面上の字の傾きが ±45° 以内・行が半径に沿う', () => {
    for (let mid = 0; mid < 360; mid += 7.5) {
      for (let rotor = 0; rotor < 360; rotor += 1) {
        const p = labelPlacement(mid, rotor);
        const tilt = fold(p.rotate + rotor);
        const msg = `mid=${mid} rotor=${rotor}`;
        expect(Math.abs(tilt), msg).toBeLessThanOrEqual(45 + 1e-6);
        // 行の向き（SVG の角度: 右 0・下 90）。横書きは傾きそのもの・縦書きは 90° + 傾き
        const lineDir = p.vertical ? 90 + tilt : tilt;
        // 外向きの半径の向き（画面上）
        const out = mid + rotor - 90;
        const diff = ((fold(out - lineDir) % 180) + 180) % 180;
        expect(Math.min(diff, 180 - diff), msg).toBeLessThan(1e-6);
        // 行が外へ進むなら終わりを縁に（end）・内へ進むなら始まりを縁に（start）
        const outward = Math.abs(fold(out - lineDir)) < 1;
        expect(p.anchor, msg).toBe(outward ? 'end' : 'start');
      }
    }
  });

  it('横書きと縦書きの切り替えの具体値', () => {
    // 画面上の角度 = mid + rotor（rotor 0 で mid をそのまま画面の角度にする）
    expect(labelPlacement(150, 0)).toMatchObject({ vertical: true, rotate: -30 });
    expect(labelPlacement(90, 0)).toMatchObject({ vertical: false, rotate: 0 });
    expect(labelPlacement(270, 0)).toMatchObject({ vertical: false, rotate: 0 });
    expect(labelPlacement(180, 0)).toMatchObject({ vertical: true, rotate: 0 });
    // 画面の位置は同じで回転子だけ違っても、同じ向きになる（rotate は回転子の回転ぶんを打ち消す）
    expect(labelPlacement(30, 120)).toMatchObject({ vertical: true, rotate: -30 - 120 });
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
