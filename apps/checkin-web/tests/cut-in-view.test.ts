/**
 * 札が開いたときのカットインの純粋関数（#670・設計 `2026-11-27-cutin-design.md` §4）。
 */
import type { PileView } from '@tasuki/checkin-core';
import { describe, expect, it } from 'vitest';
import { CUTIN_ALL_SAME, CUTIN_CHECKIN, CUTIN_CHECKOUT } from '../src/copy';
import { cutInDelayMs, cutInOf, revealedLiveAfter, seenRoundOf } from '../src/cut-in-view';
import { REVEAL_FLIP_MS, revealSchedule } from '../src/reveal-view';

const weather = (sunny: number, cloudy: number, rain: number, thunder: number): PileView[] => [
  { card: 'sunny', count: sunny },
  { card: 'cloudy', count: cloudy },
  { card: 'rain', count: rain },
  { card: 'thunder', count: thunder },
];

describe('cutInOf（題・色・添え書き）', () => {
  it('Given チェックインの側で割れた / Then 題「チェックイン」・jade・kicker CHECK-IN・添え書きは要約', () => {
    expect(cutInOf('weather', weather(2, 0, 1, 0))).toEqual({
      title: CUTIN_CHECKIN,
      sub: '晴れが 2 人',
      tone: 'jade',
      kicker: 'CHECK-IN',
    });
    expect(CUTIN_CHECKIN).toBe('チェックイン');
  });

  it('Given チェックアウトの側で割れた / Then 題「おつかれさまでした」・rose・kicker CHECK-OUT', () => {
    const cue = cutInOf('roti', [
      { card: '1', count: 1 },
      { card: '2', count: 1 },
    ] as PileView[]);
    expect(cue.title).toBe(CUTIN_CHECKOUT);
    expect(cue.title).toBe('おつかれさまでした');
    expect(cue.tone).toBe('rose');
    expect(cue.kicker).toBe('CHECK-OUT');
  });

  it('Given 2 人が同じ札（チェックイン）/ Then 題「全員同じ」・gold・添え書きは札の名前・kicker は側に従う', () => {
    expect(cutInOf('weather', weather(2, 0, 0, 0))).toEqual({
      title: CUTIN_ALL_SAME,
      sub: '晴れ',
      tone: 'gold',
      kicker: 'CHECK-IN',
    });
    expect(CUTIN_ALL_SAME).toBe('全員同じ');
  });

  it('Given 3 人が同じ札（チェックアウト）/ Then 全員同じで kicker は CHECK-OUT', () => {
    const cue = cutInOf('roti', [
      { card: '1', count: 0 },
      { card: '2', count: 3 },
    ] as PileView[]);
    expect(cue.title).toBe(CUTIN_ALL_SAME);
    expect(cue.tone).toBe('gold');
    expect(cue.kicker).toBe('CHECK-OUT');
  });

  it('Given 1 人だけが出した / Then 「全員同じ」にしない（下限は 2 人）', () => {
    const cue = cutInOf('weather', weather(1, 0, 0, 0));
    expect(cue.title).toBe(CUTIN_CHECKIN);
    expect(cue.tone).toBe('jade');
  });

  it('Given 誰も出していない / Then 側の題で、添え書きは「出した人はいません」', () => {
    const cue = cutInOf('weather', weather(0, 0, 0, 0));
    expect(cue.title).toBe(CUTIN_CHECKIN);
    expect(cue.sub).toBe('出した人はいません');
  });

  it('Given 0 枚の山が混ざる / Then 山の並びに依らず全員同じを判定する', () => {
    expect(cutInOf('weather', weather(0, 0, 3, 0)).title).toBe(CUTIN_ALL_SAME);
    expect(cutInOf('weather', weather(0, 2, 1, 0)).title).toBe(CUTIN_CHECKIN);
  });
});

describe('cutInDelayMs（札が裏返り終わるまでの待ち）', () => {
  it('Given 3 枚 / Then 最後の札の遅れ ＋ 配って裏返る時間', () => {
    const last = revealSchedule(3, false).delaysMs[2] ?? -1;
    expect(last).toBe(180);
    expect(cutInDelayMs(weather(2, 0, 1, 0))).toBe(last + REVEAL_FLIP_MS);
  });

  it('Given 1 枚 / Then 配って裏返る時間そのまま', () => {
    expect(cutInDelayMs(weather(1, 0, 0, 0))).toBe(REVEAL_FLIP_MS);
  });

  it('Given 札が多くて間隔が縮む / Then 縮んだ最後の遅れを使う', () => {
    const last = revealSchedule(40, false).delaysMs[39] ?? -1;
    expect(last).toBeLessThan(39 * 90);
    expect(cutInDelayMs(weather(40, 0, 0, 0))).toBe(last + REVEAL_FLIP_MS);
  });

  it('Given 札が 0 枚 / Then 裏返すものが無いので待たない', () => {
    expect(cutInDelayMs(weather(0, 0, 0, 0))).toBe(0);
  });
});

describe('seenRoundOf（この画面が「見た」ことにする回）', () => {
  const view = { round: { seq: 2, status: 'open' as const } };

  it('Given 接続中で、控えた古い状態とは別の状態 / Then 見た回を返す', () => {
    expect(seenRoundOf(true, view, null)).toEqual({ seq: 2, status: 'open' });
  });

  it('Given 接続していない / Then 見ていない', () => {
    expect(seenRoundOf(false, view, null)).toBeNull();
  });

  it('Given 再接続の直後で、控えた古い状態と同じ実体 / Then 見ていない', () => {
    expect(seenRoundOf(true, view, view)).toBeNull();
  });

  it('Given 状態も回も無い / Then 見ていない', () => {
    expect(seenRoundOf(true, null, null)).toBeNull();
    expect(seenRoundOf(true, { round: null }, null)).toBeNull();
  });
});

describe('revealedLiveAfter（開くのを見届けたか）', () => {
  const open = (seq: number) => ({ seq, status: 'open' as const });
  const revealed = (seq: number) => ({ seq, status: 'revealed' as const });

  it('Given 同じ回が open → revealed / Then 見届けた', () => {
    expect(revealedLiveAfter(open(1), revealed(1))).toBe(true);
  });

  it('Given 最初から revealed（再読み込み・途中入室・再接続の直後）/ Then 見届けていない', () => {
    expect(revealedLiveAfter(null, revealed(1))).toBe(false);
  });

  it('Given revealed のまま（同じ seq の描き直し）/ Then 出し直さない', () => {
    expect(revealedLiveAfter(revealed(1), revealed(1))).toBe(false);
  });

  it('Given open のまま / Then 見届けていない', () => {
    expect(revealedLiveAfter(open(1), open(1))).toBe(false);
  });

  it('Given 回が違う（open の seq 1 から revealed の seq 2）/ Then 見届けていない', () => {
    expect(revealedLiveAfter(open(1), revealed(2))).toBe(false);
  });

  it('Given 次の回で open → revealed / Then また見届けた', () => {
    expect(revealedLiveAfter(open(2), revealed(2))).toBe(true);
  });

  it('Given 開いた後に見ていない状態へ / Then 見届けていない', () => {
    expect(revealedLiveAfter(open(1), null)).toBe(false);
  });
});
