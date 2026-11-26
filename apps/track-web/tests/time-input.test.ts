import { describe, expect, it } from 'vitest';
import { edgePositionOf, insertRangeOf, parseClock, positionBefore, splitPositionOf } from '../src/time-input';
import { MIN_SEGMENT_MS } from '@tasuki/track-core';
import { EPOCH_WALL_MS, MIN, seg } from './support/track-states';

const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** 日本時間（UTC+9）。基準（位置 0）は 10:00 */
const JST = 540;

describe('時刻の入力を読む', () => {
  it.each([
    ['00:00', 0],
    ['09:05', 9 * HOUR + 5 * MIN],
    ['23:59', 23 * HOUR + 59 * MIN],
    ['10:30:15', 10 * HOUR + 30 * MIN + 15_000],
  ])('Given %s / When 読む / Then 1 日の中の ms になる', (value, ms) => {
    expect(parseClock(value)).toBe(ms);
  });

  it.each(['', '1030', '24:00', '10:60', 'ab:cd', '10:30:99', ' 10:30'])('Given 時刻でない %j / When 読む / Then 読めない', (value) => {
    expect(parseClock(value)).toBeNull();
  });
});

/**
 * @requirements #476 FR-18（過去の範囲に区切りを後から足す）
 */
describe('時刻を時刻軸の位置へ直す', () => {
  // いまは 11:20:30（位置 80 分 30 秒）
  const now = 80 * MIN + 30_000;

  it('Given いまより前の時刻 / When 直す / Then 今日のその時刻の位置になる', () => {
    expect(positionBefore(parseClock('10:20')!, now, EPOCH_WALL_MS, JST)).toBe(20 * MIN);
    expect(positionBefore(parseClock('09:00')!, now, EPOCH_WALL_MS, JST)).toBe(-HOUR);
  });

  it('Given いまと同じ分の時刻 / When 直す / Then 今日のその分の頭になる（いまより先へは置かない）', () => {
    expect(positionBefore(parseClock('11:20')!, now, EPOCH_WALL_MS, JST)).toBe(80 * MIN);
  });

  it('Given いまより後に見える時刻 / When 直す / Then 前日として読む', () => {
    expect(positionBefore(parseClock('11:21')!, now, EPOCH_WALL_MS, JST)).toBe(81 * MIN - DAY);
    expect(positionBefore(parseClock('23:50')!, now, EPOCH_WALL_MS, JST)).toBe(13 * HOUR + 50 * MIN - DAY);
  });

  it('Given 時間帯が違う / When 直す / Then その時間帯の時刻として読む', () => {
    // UTC では基準が 01:00。01:20 は位置 20 分
    expect(positionBefore(parseClock('01:20')!, now, EPOCH_WALL_MS, 0)).toBe(20 * MIN);
  });

  it('Given 日付をまたいだ直後（いまが 00:10） / When 23:50 を直す / Then 20 分前の位置になる', () => {
    const afterMidnight = 14 * HOUR + 10 * MIN;
    expect(positionBefore(parseClock('23:50')!, afterMidnight, EPOCH_WALL_MS, JST)).toBe(13 * HOUR + 50 * MIN);
  });
});

describe('抜けを足す範囲', () => {
  const now = 80 * MIN + 30_000;
  const range = (input: Partial<Parameters<typeof insertRangeOf>[0]>, nowMs = now) =>
    insertRangeOf({ start: '', mode: 'end', end: '', lengthMin: '', ...input }, nowMs, EPOCH_WALL_MS, JST);
  const AFTER_MIDNIGHT = 14 * HOUR + 10 * MIN;

  it('Given 始まりと終わり / When 範囲を求める / Then 2 つの時刻の位置になる', () => {
    expect(range({ start: '10:20', end: '10:40' })).toEqual({ ok: true, startMs: 20 * MIN, endMs: 40 * MIN });
  });

  it('Given 始まりと長さ / When 範囲を求める / Then 終わりは始まりに長さを足した位置になる', () => {
    expect(range({ start: '10:20', mode: 'length', lengthMin: '25' })).toEqual({ ok: true, startMs: 20 * MIN, endMs: 45 * MIN });
  });

  it('Given 日付をまたぐ範囲（いまは 00:10） / When 範囲を求める / Then 前日の始まりから今日の終わりまでになる', () => {
    expect(range({ start: '23:50', end: '00:05' }, AFTER_MIDNIGHT)).toEqual({ ok: true, startMs: 13 * HOUR + 50 * MIN, endMs: 14 * HOUR + 5 * MIN });
  });

  it('Given 時刻が空・読めない / When 範囲を求める / Then 時刻の誤りになる（前日の読みは添えない）', () => {
    expect(range({ start: '', end: '10:40' })).toEqual({ ok: false, error: 'time', yesterday: false });
    expect(range({ start: '10:20', end: '' })).toEqual({ ok: false, error: 'time', yesterday: false });
  });

  it.each(['', '0', '-3', '1.5', 'abc', '1441'])('Given 長さが %j / When 範囲を求める / Then 長さの誤りになる', (lengthMin) => {
    expect(range({ start: '10:20', mode: 'length', lengthMin })).toEqual({ ok: false, error: 'length', yesterday: false });
  });

  it('Given 終わりが始まり以前（前日の読みなし） / When 範囲を求める / Then 順の誤りで、前日の読みは添えない', () => {
    expect(range({ start: '10:40', end: '10:20' })).toEqual({ ok: false, error: 'order', yesterday: false });
    expect(range({ start: '10:40', end: '10:40' })).toEqual({ ok: false, error: 'order', yesterday: false });
  });

  it('Given 終わりがいまより後（前日の読みになり、始まりより前） / When 範囲を求める / Then 順の誤りに前日の読みを添える', () => {
    // いまは 11:20:30。11:21 は前日の 11:21 として読まれ、今日の 10:20 の始まりより前になる
    expect(range({ start: '10:20', end: '11:21' })).toEqual({ ok: false, error: 'order', yesterday: true });
    expect(range({ start: '09:00', end: '23:50' })).toEqual({ ok: false, error: 'order', yesterday: true });
  });

  it('Given 前日の読みで成り立つ / When 範囲を求める / Then 前日の範囲になる（0:10 に 23:00〜23:30 を足せる）', () => {
    expect(range({ start: '23:00', end: '23:30' })).toEqual({ ok: true, startMs: 13 * HOUR - DAY, endMs: 13 * HOUR + 30 * MIN - DAY });
    expect(range({ start: '23:00', end: '23:30' }, AFTER_MIDNIGHT)).toEqual({ ok: true, startMs: 13 * HOUR, endMs: 13 * HOUR + 30 * MIN });
    // いまと同じ分の頭までは今日の時刻のまま
    expect(range({ start: '10:20', end: '11:20' })).toEqual({ ok: true, startMs: 20 * MIN, endMs: 80 * MIN });
  });

  it('Given 始まりも終わりも前日に読み替わり、順が逆 / When 範囲を求める / Then 順の誤りになる', () => {
    expect(range({ start: '23:30', end: '23:00' })).toEqual({ ok: false, error: 'order', yesterday: true });
  });

  it('Given 始まりだけが前日に読み替わり、12 時間より長い / When 範囲を求める / Then 順の誤りで拒む（23.5 時間の抜けを黙って足さない）', () => {
    // いまは 11:20:30。11:30 は前日の 11:30。終わりの今日の 11:00 まで 23.5 時間
    expect(range({ start: '11:30', end: '11:00' })).toEqual({ ok: false, error: 'order', yesterday: true });
  });

  it('Given 始まりだけが前日に読み替わる / When 長さがちょうど 12 時間・12 時間 1 分 / Then 12 時間までは受ける', () => {
    expect(range({ start: '23:00', end: '11:00' })).toEqual({ ok: true, startMs: 13 * HOUR - DAY, endMs: 60 * MIN });
    expect(range({ start: '22:59', end: '11:00' })).toEqual({ ok: false, error: 'order', yesterday: true });
  });

  it('Given 始まりを前日に読み替えた長さが、いまを越える / When 範囲を求める / Then いまより先の誤りに前日の読みを添える', () => {
    // いまは 00:10。23:30 は前日の 23:30。60 分の長さの終わりは 00:30 でいまより先
    expect(range({ start: '23:30', mode: 'length', lengthMin: '60' }, AFTER_MIDNIGHT)).toEqual({ ok: false, error: 'future', yesterday: true });
  });

  it('Given 長さを足すといまを越える（前日の読みなし） / When 範囲を求める / Then いまより先の誤りで、前日の読みは添えない', () => {
    expect(range({ start: '11:00', mode: 'length', lengthMin: '30' })).toEqual({ ok: false, error: 'future', yesterday: false });
    // いまと同じ分の頭までは置ける
    expect(range({ start: '11:00', mode: 'length', lengthMin: '20' })).toEqual({ ok: true, startMs: 60 * MIN, endMs: 80 * MIN });
  });
});

/**
 * @requirements #476 FR-17（区切りを途中の時点で分ける）
 */
describe('分ける時刻の位置', () => {
  const now = 80 * MIN + 30_000;
  const closed = seg('g-1', 'work', 'Build', 20 * MIN, 50 * MIN);
  const running = seg('g-2', 'work', 'Build', 50 * MIN, null);

  it('Given 区切りの中の時刻 / When 位置を求める / Then その位置になる', () => {
    expect(splitPositionOf('10:30', closed, now, EPOCH_WALL_MS, JST)).toBe(30 * MIN);
    expect(splitPositionOf('11:10', running, now, EPOCH_WALL_MS, JST)).toBe(70 * MIN);
  });

  it('Given 区切りの外・端ちょうど・読めない時刻 / When 位置を求める / Then 分けられない', () => {
    expect(splitPositionOf('10:55', closed, now, EPOCH_WALL_MS, JST)).toBeNull();
    expect(splitPositionOf('10:20', closed, now, EPOCH_WALL_MS, JST)).toBeNull();
    expect(splitPositionOf('10:50', closed, now, EPOCH_WALL_MS, JST)).toBeNull();
    expect(splitPositionOf('', closed, now, EPOCH_WALL_MS, JST)).toBeNull();
  });

  it('Given 日付をまたぐ閉じた区切り / When 前日の側の時刻を入れる / Then 区切りの終わりより前の直近として読む', () => {
    const overnight = seg('g-3', 'work', 'Build', 13 * HOUR + 30 * MIN, 14 * HOUR + 30 * MIN);
    expect(splitPositionOf('23:45', overnight, 20 * HOUR, EPOCH_WALL_MS, JST)).toBe(13 * HOUR + 45 * MIN);
  });
});

describe('分ける時刻は、いまから 24 時間より前に置けない', () => {
  it('Given 0〜2 時間の区切りで、いまが 25 時間 / When 下限（1 時間）の前後の時刻を入れる / Then 下限より前は分けられない', () => {
    const old = seg('g-9', 'work', 'Build', 0, 2 * HOUR);
    const now = 25 * HOUR;
    // 位置 0 は 10:00。下限は位置 1 時間（11:00）
    expect(splitPositionOf('10:59', old, now, EPOCH_WALL_MS, JST)).toBeNull();
    expect(splitPositionOf('11:00', old, now, EPOCH_WALL_MS, JST)).toBe(HOUR);
  });
});

/**
 * @requirements #476 FR-17（始まり・終わりを時刻で合わせる）
 */
describe('始まり・終わりを合わせる時刻', () => {
  // いまは 12:00（位置 2 時間）。動かせる範囲は 10:10:00〜10:40:20（位置 10 分〜40 分 20 秒）。動かす前の端は 10:25
  const now = 2 * HOUR;
  const current = 25 * MIN;
  const range = { minMs: 10 * MIN, maxMs: 40 * MIN + 20_000 };
  const at = (value: string, r: { minMs: number; maxMs: number } | null = range, cur = current, nowMs = now) => edgePositionOf(value, r, cur, nowMs, EPOCH_WALL_MS, JST);

  it('Given 範囲の中の時刻 / When 位置を求める / Then その分ちょうどの位置になる', () => {
    expect(at('10:25')).toBe(25 * MIN);
    expect(at('10:10')).toBe(10 * MIN);
  });

  it('Given 範囲の外・読めない時刻・範囲が無い / When 位置を求める / Then 合わせられない', () => {
    expect(at('10:09')).toBeNull();
    expect(at('10:41')).toBeNull();
    expect(at('')).toBeNull();
    expect(at('10:25', null)).toBeNull();
  });

  it('Given 上限と同じ分（秒の欄なし） / When 位置を求める / Then 秒の端数つきの上限へ寄せて受ける', () => {
    expect(at('10:40')).toBe(40 * MIN + 20_000);
  });

  it('Given 下限と同じ分（秒の欄なし） / When 位置を求める / Then 秒の端数つきの下限へ寄せて受ける', () => {
    expect(at('10:10', { minMs: 10 * MIN + 30_000, maxMs: 40 * MIN + 20_000 })).toBe(10 * MIN + 30_000);
  });

  it('Given 端の 1 分外 / When 位置を求める / Then 合わせられない', () => {
    const r = { minMs: 10 * MIN + 30_000, maxMs: 40 * MIN + 20_000 };
    expect(at('10:09', r)).toBeNull();
    expect(at('10:41', r)).toBeNull();
  });

  it('Given 秒の欄のある入力（10:10:00） / When 下限と同じ分に入れる / Then 寄せずに範囲で判断する', () => {
    const r = { minMs: 10 * MIN + 30_000, maxMs: 40 * MIN + 20_000 };
    expect(at('10:10:00', r)).toBeNull();
    expect(at('10:10:40', r)).toBe(10 * MIN + 40_000);
    // 上限側も、秒の欄のある入力は寄せない
    expect(at('10:40:00')).toBe(40 * MIN);
  });

  it('Given 下限が「いまから 24 時間前」で決まっている / When 下限と同じ分を入れる / Then 寄せずに拒む（その端は動く）', () => {
    // いまは 25 時間 + 30 秒。24 時間前は 1 時間 + 30 秒（11:00:30）
    const lookback = { minMs: HOUR + 30_000, maxMs: 3 * HOUR };
    expect(at('11:00', lookback, 2 * HOUR, 25 * HOUR + 30_000)).toBeNull();
    // 下限が前の区切りで決まっている（24 時間前より新しい）ときは寄せる
    expect(at('11:00', lookback, 2 * HOUR, 25 * HOUR)).toBe(HOUR + 30_000);
  });
});

/**
 * @requirements #476 FR-17（日をまたぐ区切りの端を、動かす前の端に近い日の時刻で読む）
 */
describe('始まり・終わりを合わせる時刻は、動かす前の端に近い日で読む', () => {
  // 最初の区切りが前日 23:50〜00:30、いまは 00:40。始まりの動かせる範囲は「いまから 24 時間前」〜終わりの 1 つ前
  const start = 13 * HOUR + 50 * MIN;
  const end = 14 * HOUR + 30 * MIN;
  const now = 14 * HOUR + 40 * MIN;
  const range = { minMs: now - DAY, maxMs: end - MIN_SEGMENT_MS };
  const at = (value: string) => edgePositionOf(value, range, start, now, EPOCH_WALL_MS, JST);

  it('Given 始まりの前日側の時刻 / When 23:40・23:55 を入れる / Then 始まりの近くのその時刻で受ける', () => {
    expect(at('23:40')).toBe(49_200_000);
    expect(at('23:55')).toBe(50_100_000);
  });

  it('Given 始まりの翌日側の時刻 / When 00:10 を入れる / Then 区切りの中のその時刻で受ける', () => {
    expect(at('00:10')).toBe(14 * HOUR + 10 * MIN);
  });

  it('Given 終わりより後の時刻 / When 00:35 を入れる / Then 前日の時刻として受けず拒む（23 時間の区切りにならない）', () => {
    expect(at('00:35')).toBeNull();
  });
});
