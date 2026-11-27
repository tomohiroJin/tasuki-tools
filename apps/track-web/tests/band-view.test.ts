import { describe, expect, it } from 'vitest';
import { bandOf } from '@tasuki/track-core';
import { axisLabelsOf, bandSummaryOf } from '../src/track-view';
import { EPOCH_WALL_MS, MIN, seg, trackView } from './support/track-states';

const JST = 540;

/**
 * @requirements #476 設計 §5 D4（帯の両端の時刻）
 */
describe('帯の両端の時刻', () => {
  it('Given 計測中 / When 端の時刻を求める / Then 右端は切り下げた位置でなく「いま」の時刻', () => {
    const view = trackView({ nowMs: 25 * MIN + 40_000, segments: [seg('g-1', 'work', 'A', 0, null)] });
    const band = bandOf(view, view.nowMs)!;
    expect(band.endMs).toBe(25 * MIN);
    // 2026-11-23 01:00 UTC = 10:00 JST。いまは 10:25:40 → 10:25
    expect(axisLabelsOf(view, band, view.nowMs, JST)).toEqual({ start: '10:00', end: '10:25' });
  });

  it('Given 時刻軸の 0 が分の途中（壁時計は 10:00:30） / When 端の時刻を求める / Then 右端は切り下げた位置でなく、いまの壁時計の分（10:26）', () => {
    const view = trackView({ epochWallMs: EPOCH_WALL_MS + 30_000, nowMs: 25 * MIN + 40_000, segments: [seg('g-1', 'work', 'A', 0, null)] });
    // 切り下げた位置（25 分）の壁時計は 10:25:30（10:25）。いま（25 分 40 秒）は 10:26:10
    expect(axisLabelsOf(view, bandOf(view, view.nowMs)!, view.nowMs, JST).end).toBe('10:26');
  });

  it('Given 計測中で、いまが次の分に入った / When 端の時刻を求める / Then 右端の時刻が進む', () => {
    const view = trackView({ nowMs: 26 * MIN + 1_000, segments: [seg('g-1', 'work', 'A', 0, null)] });
    expect(axisLabelsOf(view, bandOf(view, view.nowMs)!, view.nowMs, JST).end).toBe('10:26');
  });

  it('Given 止まっている / When 端の時刻を求める / Then 右端は最後の終わりの時刻', () => {
    const view = trackView({ nowMs: 99 * MIN, segments: [seg('g-1', 'work', 'A', 0, 20 * MIN)] });
    expect(axisLabelsOf(view, bandOf(view, view.nowMs)!, view.nowMs, JST).end).toBe('10:20');
  });

  it('Given 両端の日付が違う / When 端の時刻を求める / Then 月/日を添える', () => {
    const view = trackView({ nowMs: 15 * 60 * MIN, segments: [seg('g-1', 'work', 'A', 0, 15 * 60 * MIN)] });
    // 10:00 JST（11/23）〜 翌 01:00 JST（11/24）
    expect(axisLabelsOf(view, bandOf(view, view.nowMs)!, view.nowMs, JST)).toEqual({ start: '11/23 10:00', end: '11/24 01:00' });
  });
});

describe('帯の読み上げ向けの要約', () => {
  it('Given 作業 2 つと休憩 1 つ / When 要約を求める / Then 始まりと終わりの時刻と、作業・休憩の区切りの数を文にする', () => {
    const view = trackView({
      nowMs: 40 * MIN,
      segments: [seg('g-1', 'work', 'A', 0, 10 * MIN), seg('g-2', 'break', '', 10 * MIN, 20 * MIN), seg('g-3', 'work', 'B', 20 * MIN, 30 * MIN)],
    });
    expect(bandSummaryOf(view, bandOf(view, view.nowMs)!, view.nowMs, JST)).toBe('10:00 から 10:30 まで。作業 2 件、休憩 1 件。');
  });
});
