/**
 * 変わった動き（#640）の角度。動き出し（震える・溜める・つまずく）と回転（逆回転・途中で向きを変える・速い）。
 *
 * **オラクルは実装と別の計算で組む**（`stop-style-motion.test.ts` と同じ）。指し針の先を回転子の座標へ戻し、`atan2` で席を引く。
 */
import { describe, expect, it } from 'vitest';
import {
  LAUNCH_MOTIONS,
  LAUNCH_MOTION_EXTRA_MS,
  MOTION_EXTRA_CAP_MS,
  SPIN_MOTIONS,
  SPIN_MOTION_EXTRA_MS,
  STOP_STYLES,
  launchMotionMs,
  pickStopsMs,
} from '@tasuki/roulette-core';
import { launchLegsMs, turnbackLegsMs } from '../src/spin-motion';
import { angleAtPicks, finalAngle } from '../src/wheel-motion';

const POINTERS = [180, 90] as const;
const STYLES: (string | null)[] = [null, ...STOP_STYLES];
const LAUNCHES: (string | null)[] = [null, ...LAUNCH_MOTIONS];
const SPINS: (string | null)[] = [null, ...SPIN_MOTIONS];

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

/** 360° の巡りを無視した 2 つの角度の差（0〜180） */
const wrapDiff = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

const stopOf = (style: string | null, launch: string | null, spin: string | null): number => pickStopsMs(1, style, { launch, spin })[0]!;

/** 1 人目の回転の角度（1 人・席 `index`・`settle`）。動きの名前は wire の文字列のまま渡す */
function angle(t: number, style: string | null, launch: string | null, spin: string | null, n = 6, index = 2, settle = 0.5, pointerDeg = 180, startDeg = 0): number {
  return angleAtPicks(t, [{ index, settle }], n, pointerDeg, startDeg, style, { launchMotion: launch, spinMotion: spin });
}

describe('動きの長さは core の表と同じ', () => {
  it('動き出しの区間の合計は core の表（詰めない長さ）・途中で向きを変えるの差し込みは core の表と同じ', () => {
    for (const m of LAUNCH_MOTIONS) expect(launchLegsMs(m), m).toBe(LAUNCH_MOTION_EXTRA_MS[m]);
    expect(turnbackLegsMs()).toBe(SPIN_MOTION_EXTRA_MS.turnback);
  });
});

describe('動き: 共通の約束（全組み合わせ）', () => {
  it('回し始めは開始角で、止まる時刻からは当たりの席・席の中の位置で止まる（どの画面も同じ席・同じ位置）', () => {
    const bad: string[] = [];
    for (const style of STYLES) {
      for (const launch of LAUNCHES) {
        for (const spin of SPINS) {
          for (const n of [2, 6, 24]) {
            for (const settle of [0.2, 0.8]) {
              for (const pointerDeg of POINTERS) {
                for (const startDeg of [0, 123, 359]) {
                  const w = n - 1;
                  const stop = stopOf(style, launch, spin);
                  const first = angle(0, style, launch, spin, n, w, settle, pointerDeg, startDeg);
                  if (first !== startDeg) bad.push(`start ${String(style)}/${String(launch)}/${String(spin)}`);
                  for (const t of [stop, stop + 1, 99_999]) {
                    const at = positionAt(angle(t, style, launch, spin, n, w, settle, pointerDeg, startDeg), n, pointerDeg);
                    if (Math.abs(at - (w + settle)) > 1e-6) bad.push(`stop ${String(style)}/${String(launch)}/${String(spin)} n=${n} t=${t} ${at}`);
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(bad.slice(0, 5), `外れた組 ${bad.length} 件`).toEqual([]);
  });

  it('止まる直前の角度が、止まった後の角度（360° の巡りを除いて）と同じで、跳ばない', () => {
    for (const style of STYLES) {
      for (const launch of LAUNCHES) {
        for (const spin of SPINS) {
          const stop = stopOf(style, launch, spin);
          const done = angle(stop, style, launch, spin, 6, 2, 0.5, 180, 123);
          expect(wrapDiff(angle(stop - 1, style, launch, spin, 6, 2, 0.5, 180, 123), done), `${String(style)}/${String(launch)}/${String(spin)}`).toBeLessThan(3);
        }
      }
    }
  });

  it('どの経過でも 1ms で跳ばない（動き出しと本体・差し込みの境目を含む）', () => {
    const bad: string[] = [];
    for (const style of STYLES) {
      for (const launch of LAUNCHES) {
        for (const spin of SPINS) {
          for (const n of [2, 24]) {
            const stop = stopOf(style, launch, spin);
            let prev = angle(0, style, launch, spin, n, 1, 0.5, 90, 123);
            for (let t = 1; t <= stop; t++) {
              const a = angle(t, style, launch, spin, n, 1, 0.5, 90, 123);
              // 回し始めが最も速い（普通でも約 1.2°/ms・速いで 1.6°/ms）。360° の巡りの跳びは wrapDiff では見えるので、そのまま比べる
              if (wrapDiff(a, prev) > 3) bad.push(`${String(style)}/${String(launch)}/${String(spin)} n=${n} t=${t} ${wrapDiff(a, prev).toFixed(2)}`);
              prev = a;
            }
          }
        }
      }
    }
    expect(bad.slice(0, 5), `跳んだ ${bad.length} 件`).toEqual([]);
    // 全組み合わせ（約 570 組）を 1ms 刻みで数える（約 2〜6 秒。混んだ機械で既定の 5 秒を超えた）。刻みは粗くせず、上限を明示する
  }, 60_000);

  it('向きの切り返しは 1 秒に 3 回まで（速い行き来で点滅に見えない・WCAG 2.3.1）', () => {
    for (const style of STYLES) {
      for (const launch of LAUNCHES) {
        for (const spin of SPINS) {
          const stop = stopOf(style, launch, spin);
          const times: number[] = [];
          let dir = 0;
          let prev = angle(0, style, launch, spin);
          for (let t = 1; t <= stop; t++) {
            const a = angle(t, style, launch, spin);
            const d = a - prev;
            prev = a;
            if (Math.abs(d) < 1e-9) continue;
            if (dir !== 0 && Math.sign(d) !== dir) times.push(t);
            dir = Math.sign(d);
          }
          for (let i = 3; i < times.length; i++) {
            expect(times[i]! - times[i - 3]!, `${String(style)}/${String(launch)}/${String(spin)}`).toBeGreaterThanOrEqual(1000);
          }
        }
      }
    }
  });

  it('延びる合計は上限（+4 秒）に収まり、詰めた動き出しでも、止まる時刻は core の表と同じ', () => {
    for (const style of STYLES) {
      for (const launch of LAUNCHES) {
        for (const spin of SPINS) {
          expect(stopOf(style, launch, spin) - 4000, `${String(style)}/${String(launch)}/${String(spin)}`).toBeLessThanOrEqual(MOTION_EXTRA_CAP_MS);
        }
      }
    }
    // linger（+2500）・途中で向きを変える（+1000）に、つまずく（表は +1300）を重ねる: 動き出しは 500 に詰まる
    expect(launchMotionMs('stumble', 'linger', 'turnback')).toBe(500);
  });
});

describe('動き出し: それぞれの見え方', () => {
  const start = 0;

  it('震える: 動き出しの間は開始角のまわりで小さく震え、戻ってから本体が始まる（4° 以内）', () => {
    // Given
    const ms = launchMotionMs('shake', null, null);
    let min = 0;
    let max = 0;
    // When
    for (let t = 0; t <= ms; t++) {
      const a = angle(t, null, 'shake', null) - start;
      min = Math.min(min, a);
      max = Math.max(max, a);
    }
    // Then: 両側に振れ、大きくは動かない・動き出しの終わりは開始角
    expect(min).toBeLessThan(-1);
    expect(max).toBeGreaterThan(1);
    expect(Math.max(-min, max)).toBeLessThanOrEqual(5);
    expect(angle(ms, null, 'shake', null)).toBeCloseTo(start, 6);
  });

  it('溜める: 逆へ引いてから回り出す（動き出しの間は負の向きに動き、その後は正の向きに大きく回る）', () => {
    // Given
    const ms = launchMotionMs('windup', null, null);
    // When
    const pulled = angle(ms, null, 'windup', null);
    // Then
    expect(pulled).toBeLessThan(start - 10);
    expect(angle(ms + 500, null, 'windup', null)).toBeGreaterThan(pulled + 300);
  });

  it('つまずく: 少し回って止まりかけ（動かない間がある）、もう一度回り出す', () => {
    // Given
    const ms = launchMotionMs('stumble', null, null);
    // When
    const stumbled = angle(ms, null, 'stumble', null);
    const before = angle(ms - 100, null, 'stumble', null);
    // Then: 動き出しの終わりで止まって見え（直前と同じ角度）、その後に回り出す
    expect(stumbled).toBeGreaterThan(start + 20);
    expect(stumbled).toBe(before);
    expect(angle(ms + 500, null, 'stumble', null)).toBeGreaterThan(stumbled + 300);
  });

  it('詰めた動き出しは、詰めた長さで終わる（延びた合計が上限に収まる）', () => {
    // Given: つまずく（表は 1300）が 500 に詰まる組
    const ms = launchMotionMs('stumble', 'linger', 'turnback');
    // When / Then: 詰めた長さの終わりで、表と同じ角度（つまずいた位置）に着く
    expect(ms).toBe(500);
    const full = angle(launchMotionMs('stumble', null, null), null, 'stumble', null);
    expect(angle(ms, 'linger', 'stumble', 'turnback')).toBeCloseTo(full, 6);
  });
});

describe('回転: それぞれの見え方', () => {
  it('逆回転: 回転の向きがはじめから逆（負の向きに動き続け）、同じ席で止まる', () => {
    // Given
    const stop = stopOf(null, null, 'backward');
    // When
    const mid = angle(stop / 2, null, null, 'backward');
    // Then: 開始角より小さい向きへ大きく回り、途中で逆戻りしない
    expect(mid).toBeLessThan(-300);
    let dir = 0;
    let prev = angle(0, null, null, 'backward');
    // 止まる時刻の 1 つ前まで（止まる時刻からは止まった後の角度。360° の巡りだけ違う）
    for (let t = 1; t < stop; t++) {
      const a = angle(t, null, null, 'backward');
      if (a !== prev) dir = Math.max(dir, Math.sign(a - prev));
      prev = a;
    }
    expect(dir).toBeLessThanOrEqual(0);
    expect(positionAt(angle(stop, null, null, 'backward'), 6, 180)).toBeCloseTo(2.5, 6);
  });

  it('逆回転 + 止まり方: 止まり方の動きも逆向きになる（当たりの席の手前・向こうが入れ替わる）', () => {
    // Given: 行き過ぎて戻る（overshoot）は普通なら当たりの次の席まで進んで戻る
    const stop = stopOf('overshoot', null, 'backward');
    const normal = (a: number, start: number): number => a - start;
    const finalNormal = finalAngle(6, 2, 0.5, 180, 0);
    // When: 普通の overshoot の最大の行き過ぎ（正の向き）と、逆回転の行き過ぎ（負の向き）
    let maxNormal = 0;
    let minBack = 0;
    for (let t = 0; t <= stop; t++) {
      maxNormal = Math.max(maxNormal, normal(angleAtPicks(t, [{ index: 2, settle: 0.5 }], 6, 180, 0, 'overshoot'), finalNormal));
      minBack = Math.min(minBack, angle(t, 'overshoot', null, 'backward') - (finalNormal - 360 * 9));
    }
    // Then
    expect(maxNormal).toBeGreaterThan(30);
    expect(minBack).toBeLessThan(-30);
  });

  it('途中で向きを変える: 半ばで減速し、逆向きに回り直してから、また元の向きで回って止まる（向きの切り返しは 2 回）', () => {
    // Given
    const stop = stopOf(null, null, 'turnback');
    let reversals = 0;
    let dir = 0;
    let prev = angle(0, null, null, 'turnback');
    let backward = 0;
    // When
    for (let t = 1; t <= stop; t++) {
      const a = angle(t, null, null, 'turnback');
      const d = a - prev;
      prev = a;
      if (Math.abs(d) < 1e-9) continue;
      if (d < 0) backward++;
      if (dir !== 0 && Math.sign(d) !== dir) reversals++;
      dir = Math.sign(d);
    }
    // Then: 逆向きに動いた時間がある（差し込みの一部）
    expect(reversals).toBe(2);
    expect(backward).toBeGreaterThan(200);
  });

  it('速い: いつもより 1 秒短く止まり、同じ区間はいつもより速く進む', () => {
    // Given / When / Then
    expect(stopOf(null, null, 'fast')).toBe(3000);
    // 開始から 1 秒の進みは、いつもより大きい
    expect(angle(1000, null, null, 'fast')).toBeGreaterThan(angle(1000, null, null, null));
    // 速い回転でも、止まる時刻から先は動かない
    expect(angle(3000, null, null, 'fast')).toBe(angle(99_999, null, null, 'fast'));
  });
});

describe('知らない名前・無いときは、いつもの動きで描く（新旧の混在）', () => {
  it('知らない・継承のキーの名前は、動きが無いときと同じ角度（止まり方があるときも）', () => {
    for (const style of [null, 'double']) {
      for (let t = 0; t <= 6500; t += 53) {
        const plain = angle(t, style, null, null);
        expect(angle(t, style, 'spiral', 'teleport'), `t=${t}`).toBe(plain);
        expect(angle(t, style, 'toString', 'constructor'), `t=${t}`).toBe(plain);
        // 回転の名前を動き出しの欄へ・その逆に入れても読まない
        expect(angle(t, style, 'fast', 'shake'), `t=${t}`).toBe(plain);
      }
    }
  });

  it('動きの引数そのものが無い（古い呼び出し）ときも、いつもの動き', () => {
    for (let t = 0; t <= 4500; t += 97) {
      expect(angleAtPicks(t, [{ index: 2, settle: 0.5 }], 6, 180, 0)).toBe(angle(t, null, null, null));
    }
  });
});

describe('2 人以上を選ぶ回転: 1 人目の大きな回転にだけ動きが掛かる', () => {
  it('動き出し・回転の動きで 1 人目が止まる時刻が延び、2 人目はその分だけ後ろで、同じ席へ送る', () => {
    // Given
    const picks = [
      { index: 2, settle: 0.5 },
      { index: 0, settle: 0.3 },
    ];
    const stops = pickStopsMs(2, null, { launch: 'windup', spin: 'turnback' });
    const at = (t: number): number => angleAtPicks(t, picks, 6, 180, 0, null, { launchMotion: 'windup', spinMotion: 'turnback' });
    // When / Then: 1 人目の席で止まり、2 人目の席で止まる
    expect(positionAt(at(stops[0]! + 50), 6, 180)).toBeCloseTo(2.5, 6);
    expect(positionAt(at(stops[1]! + 50), 6, 180)).toBeCloseTo(0.3, 6);
  });
});
