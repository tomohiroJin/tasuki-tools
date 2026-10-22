/**
 * 盤の幾何（#429 spec §7.2）。
 *
 * 性質テストの操作の生成器は agenda-core の `tests/agenda-invariant.test.ts` を**写したもの**（import しない。
 * あちらのテストの内部に依存すると、片方の書き換えがもう片方の検出力を黙って変える）。
 */
import { describe, expect, it } from 'vitest';
import {
  INITIAL_AGENDA_STATE,
  advanceIfDue,
  extend,
  next,
  pause,
  replaceScenario,
  resume,
  setSkipped,
  start,
  toView,
  type AgendaState,
  type ScenarioInput,
} from '@tasuki/agenda-core';
import {
  angleOfMs,
  innerSegments,
  lateRimDeg,
  needleDeg,
  MIN_NUMBER_SPAN,
  outerSegments,
  overrunTrackDeg,
  planLabels,
  projectedMarkerDeg,
  smallSecondsDeg,
} from '../src/dial-geometry';
import { Driver, MIN, idleView } from './support/agenda-states';

const RUNS = 300;

function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 0x1_0000_0000;
  };
}

const int = (rnd: () => number, lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1));

function scenario(rnd: () => number): ScenarioInput {
  const n = int(rnd, 1, 6);
  return {
    title: '乱数',
    steps: Array.from({ length: n }, (_, i) => ({
      name: `S${i + 1}`,
      durationSec: int(rnd, 1, 10) * 60,
      onTimeout: rnd() < 0.5 ? ('wait' as const) : ('advance' as const),
    })),
  };
}

const okOr = (s: AgendaState, r: { isOk(): boolean; _unsafeUnwrap(): AgendaState }): AgendaState => (r.isOk() ? r._unsafeUnwrap() : s);

/** 1 回の実行で、各操作のあとの写しに `check` を当てる。一時停止が効いた局面の数を返す（検出力の確認用） */
function run(seed: number, check: (v: ReturnType<typeof toView>) => void): number {
  const rnd = lcg(seed);
  let s = okOr(INITIAL_AGENDA_STATE, replaceScenario(INITIAL_AGENDA_STATE, scenario(rnd)));
  let now = int(rnd, 0, 100_000);
  s = okOr(s, start(s, now));
  let pausedChecks = 0;
  for (let i = 0; i < 40 && s.phase !== 'finished'; i++) {
    const op = rnd();
    const cur = s.currentId;
    if (op < 0.3) {
      now += int(rnd, 0, 900_000);
      s = advanceIfDue(s, now);
    } else if (op < 0.55 && cur !== null) {
      now += int(rnd, 0, 300_000);
      s = okOr(s, next(s, { stepId: cur, now }));
    } else if (op < 0.7) {
      now += int(rnd, 0, 300_000);
      s = okOr(s, pause(s, now));
    } else if (op < 0.85) {
      now += int(rnd, 0, 300_000);
      s = okOr(s, resume(s, now));
    } else if (op < 0.92 && cur !== null) {
      s = okOr(s, extend(s, { stepId: cur, minutes: [1, 3, 5][int(rnd, 0, 2)]! }));
    } else {
      const target = s.steps[int(rnd, 0, s.steps.length - 1)]!;
      s = okOr(s, setSkipped(s, { stepId: target.id, skipped: rnd() < 0.5 }));
    }
    // 一時停止の間に時間が過ぎた局面（計時と所要が分かれる）を数える
    const v = toView(s, now + int(rnd, 0, 60_000));
    if (v.stepSpentMs !== v.stepTimerMs) pausedChecks++;
    check(v);
  }
  return pausedChecks;
}

/**
 * @requirements #429 spec §7.2（盤の文法）
 */
describe('盤の幾何', () => {
  it('角度は 12 時が 0°・時計回りで、予定の合計が 1 周（360°）', () => {
    expect(angleOfMs(0, 60 * MIN)).toBe(0);
    expect(angleOfMs(15 * MIN, 60 * MIN)).toBe(90);
    expect(angleOfMs(60 * MIN, 60 * MIN)).toBe(360);
    expect(angleOfMs(5 * MIN, 0)).toBe(0);
  });

  it(`任意の操作の列のあとで、1 周以内なら針は内の環の最後の区画の先端と一致する（${RUNS} 通り）（m447）`, () => {
    let pausedChecks = 0;
    let compared = 0;
    for (let seed = 1; seed <= RUNS; seed++) {
      pausedChecks += run(seed, (v) => {
        const segs = innerSegments(v);
        const last = segs.at(-1);
        if (last === undefined || angleOfMs(v.runElapsedMs, v.steps.reduce((a, x) => a + x.durationSec * 1000, 0)) > 360) return;
        compared++;
        expect(needleDeg(v)).toBe(last.endDeg);
      });
    }
    // 空振りしていない: 比べた局面があり、そのうち一時停止で計時と所要が分かれた局面がある
    expect(compared).toBeGreaterThan(500);
    expect(pausedChecks).toBeGreaterThan(100);
  });

  it('一時停止を挟むと、針は止めていた間も進む（計時ではなく実時間）（m447）', () => {
    // 10 分の盤で 1 つ目の 5 分。1 分で止めて 2 分止め、3 分の時点
    const v = new Driver([5, 5]).pause(1 * MIN).view(3 * MIN);
    expect(needleDeg(v)).toBe(108); // 3 / 10 周
    expect(innerSegments(v).at(-1)?.endDeg).toBe(108);
  });

  it('延長しても外の環は変わらない', () => {
    const d = new Driver([5, 6, 1]);
    const before = outerSegments(d.view(1 * MIN));
    const after = outerSegments(d.extend(3).extend(5).view(1 * MIN));
    expect(after).toEqual(before);
    expect(before.map((x) => [x.startDeg, x.endDeg])).toEqual([
      [0, 150],
      [150, 330],
      [330, 360],
    ]);
  });

  it('飛ばしたステップの区画は外の環に skipped: true で残り、内の環には出ない', () => {
    const v = new Driver([5, 7, 1]).skip('s-2').next(4 * MIN).view(5 * MIN);
    expect(outerSegments(v).map((x) => [x.id, x.skipped])).toEqual([
      ['s-1', false],
      ['s-2', true],
      ['s-3', false],
    ]);
    expect(innerSegments(v).map((x) => x.id)).toEqual(['s-1', 's-3']);
  });

  it('内の環は所要で伸び、1 周で頭打ちになる', () => {
    const v = new Driver([5, 5]).next(4 * MIN).view(13 * MIN);
    expect(innerSegments(v).map((x) => [x.startDeg, x.endDeg])).toEqual([
      [0, 144],
      [144, 360],
    ]);
    expect(needleDeg(v)).toBe(360);
  });

  it('延長したいまのステップは、持ち時間の先に足しの区画の始まりを持つ', () => {
    const v = new Driver([5, 5]).next(4 * MIN).extend(1).view(5 * MIN);
    const [done, cur] = innerSegments(v);
    expect(done?.extensionStartDeg).toBeNull();
    // 2 つ目は 144° から始まり、長さ 5 分（180°）の先 = 324° から 1 分（36°）の足し
    expect(cur?.extensionStartDeg).toBe(324);
    expect(cur?.extensionEndDeg).toBe(360);
  });

  it('実時間が予定の合計の 1.25 倍なら、オーバーの軌道は 90°', () => {
    const v = new Driver([20, 20]).next(10 * MIN).view(50 * MIN);
    expect(overrunTrackDeg(v)).toBe(90);
    // 1 周以内なら 0、2 周を超えたら 360 で満ちたまま
    expect(overrunTrackDeg(new Driver([20, 20]).view(30 * MIN))).toBe(0);
    expect(overrunTrackDeg(new Driver([20, 20]).view(200 * MIN))).toBe(360);
  });

  it('終了見込みの印: 押せば 12 時を過ぎ、その分だけ縁を塗る。巻けば手前に来る', () => {
    // 10 分の盤。1 つ目を 2 分延長 → 見込み 12 分 = 432°（12 時を 72° 過ぎる）
    const late = new Driver([5, 5]).extend(2).view(1 * MIN);
    expect(projectedMarkerDeg(late)).toBe(432);
    expect(lateRimDeg(late)).toBe(72);
    // 1 つ目を 1 分で終える → 見込み 6 分 = 216°
    const early = new Driver([5, 5]).next(1 * MIN).view(1 * MIN);
    expect(projectedMarkerDeg(early)).toBe(216);
    expect(lateRimDeg(early)).toBe(0);
  });

  it('開始前は針が 12 時・内の環は空・印は 12 時', () => {
    const v = idleView([5, 7]);
    expect(needleDeg(v)).toBe(0);
    expect(innerSegments(v)).toEqual([]);
    expect(projectedMarkerDeg(v)).toBe(360);
  });

  it('スモールセコンドは計時で回り、一時停止の間は止まる', () => {
    const d = new Driver([5]);
    expect(smallSecondsDeg(d.view(15_000))).toBe(90);
    d.pause(15_000);
    expect(smallSecondsDeg(d.view(50_000))).toBe(90);
  });
});

/**
 * @requirements #429 spec §7.2（回数が多いときの札）
 */
describe('外の環の札', () => {
  const gaps = (degs: readonly number[]): number[] => degs.slice(1).map((d, i) => d - (degs[i] ?? 0));

  it('回数 1 は第 1 段と同じ。区画ごとの番号で、幅が MIN_NUMBER_SPAN を超える区画だけ（KPT は 3 の札が出ない）', () => {
    const labels = planLabels(idleView([5, 7, 1, 40, 7]));
    expect(labels.map((l) => l.text)).toEqual(['1', '2', '4', '5']);
    // 1 の札は最初の区画（5/60 周 ＝ 30°）の中央
    expect(labels[0]?.deg).toBeCloseTo(15, 6);
    expect(labels.every((l) => !l.skipped)).toBe(true);
  });

  it('回数 1 で飛ばした区画の札は skipped', () => {
    const d = new Driver([5, 7, 40]).skip('s-2');
    expect(planLabels(d.view(0)).map((l) => [l.text, l.skipped])).toEqual([
      ['1', false],
      ['2', true],
      ['3', false],
    ]);
  });

  it('回数 5 の LT 会（10 区画）は回ごとに 1 つ「1」〜「5」で、隣との差は MIN_NUMBER_SPAN より大きい', () => {
    const labels = planLabels(idleView([1, 1], 'LT', 5));
    expect(labels.map((l) => l.text)).toEqual(['1', '2', '3', '4', '5']);
    // 回の区画全体の中央（1 回 72°）
    expect(labels.map((l) => l.deg)).toEqual([36, 108, 180, 252, 324]);
    expect(gaps(labels.map((l) => l.deg)).every((g) => g > MIN_NUMBER_SPAN)).toBe(true);
  });

  it('回数 30・2 区切り（60 区画）でも、出る札は隣との差が MIN_NUMBER_SPAN を超えるものだけ（重ならない）', () => {
    const labels = planLabels(idleView([1, 1], 'LT', 30));
    expect(gaps(labels.map((l) => l.deg)).every((g) => g > MIN_NUMBER_SPAN)).toBe(true);
    // 1 回 12° ＜ 14° なので 1 つも出ない（60 区画の番号が重ならない）
    expect(labels).toEqual([]);
  });

  it('回数 20（1 回 18°）は 20 個すべて出て、隣との差は 18°', () => {
    const labels = planLabels(idleView([1], 'LT', 20));
    expect(labels).toHaveLength(20);
    expect(gaps(labels.map((l) => l.deg)).every((g) => g > MIN_NUMBER_SPAN)).toBe(true);
  });

  it('回数 2 以上で、ある回の全区切りを飛ばすとその回の札だけ skipped', () => {
    const d = new Driver([1, 1], 'LT', 'wait', 3).skip('s-3').skip('s-4');
    expect(planLabels(d.view(0)).map((l) => [l.text, l.skipped])).toEqual([
      ['1', false],
      ['2', true],
      ['3', false],
    ]);
    // 1 区切りだけでは飛ばした回にならない
    const one = new Driver([1, 1], 'LT', 'wait', 3).skip('s-3');
    expect(planLabels(one.view(0)).map((l) => l.skipped)).toEqual([false, false, false]);
  });
});
