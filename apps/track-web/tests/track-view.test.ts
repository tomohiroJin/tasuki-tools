import { describe, expect, it } from 'vitest';
import { LONG_RUNNING_NOTICE_MS, MAX_LOOKBACK_MS } from '@tasuki/track-core';
import { AWAY_PROMPT_MIN_HIDDEN_MS } from '../src/limits';
import { ANNOUNCE_AUTO_STOPPED, ANNOUNCE_STOPPED, BREAK_NAME, UNNAMED_NAME, announceStarted, tabTitle } from '../src/copy';
import {
  announcementFor,
  awayPromptOf,
  isAwayPromptStillValid,
  type AwayReturn,
  clockOf,
  formatElapsed,
  nameOf,
  rangeTextOf,
  secondPhasesOf,
  shownSecondsKey,
  steppedEdge,
  tabTitleOf,
  undoSecondsOf,
} from '../src/track-view';
import { EPOCH_WALL_MS, MIN, runningTrack, seg, stoppedTrack, trackView } from './support/track-states';

/**
 * @requirements #476 設計 §5（画面の表示の規則）
 */
describe('区切りの名前', () => {
  it('Given 名前のある作業・名前なし・休憩 / When 名前を求める / Then 作業名・（名前なし）・休憩になる', () => {
    expect(nameOf({ kind: 'work', label: 'Build' })).toBe('Build');
    expect(nameOf({ kind: 'work', label: '' })).toBe(UNNAMED_NAME);
    expect(nameOf({ kind: 'break', label: '' })).toBe(BREAK_NAME);
  });
});

describe('経過の表示', () => {
  it.each([
    [0, '0:00:00'],
    [999, '0:00:00'],
    [1000, '0:00:01'],
    [59_999, '0:00:59'],
    [42 * MIN + 15_000, '0:42:15'],
    [72 * MIN + 40_000, '1:12:40'],
    [25 * 60 * MIN, '25:00:00'],
    [-5, '0:00:00'],
  ])('Given %i ms / When 整える / Then %s（秒未満は切り捨て）', (ms, text) => {
    expect(formatElapsed(ms)).toBe(text);
  });
});

describe('時刻の表示', () => {
  it('Given 時刻軸の位置 / When 時間帯を指定して時刻にする / Then 基準の壁時計に位置を足した HH:MM になる', () => {
    const view = trackView();
    // 基準は 01:00 UTC。日本時間（+540 分）では 10:00
    expect(clockOf(view, 0, 540)).toBe('10:00');
    expect(clockOf(view, 31 * MIN + 59_000, 540)).toBe('10:31');
    expect(clockOf(view, -MIN, 0)).toBe('00:59');
  });

  it('Given 閉じた区切りと計測中の区切り / When 範囲の文にする / Then 閉じた区切りは両端、計測中は始まりだけになる', () => {
    const view = runningTrack();
    expect(rangeTextOf(view, view.segments[0]!, 540)).toBe('10:00–10:30');
    expect(rangeTextOf(view, view.segments[2]!, 540)).toBe('10:45–');
  });
});

/**
 * 描き直しは表示する秒が変わるときだけ（設計 §7 非機能）。経過の秒と、合計の秒は位相が違う。
 */
describe('表示する秒の組', () => {
  it('Given 止まっている写し / When 位相を求める / Then 空（動くものが無い）', () => {
    expect(secondPhasesOf(stoppedTrack())).toEqual([]);
  });

  it('Given 計測中で、閉じた区切りの長さが秒の端数を持つ / When 位相を求める / Then 経過の 0 と、合計の端数を重複なく持つ', () => {
    const view = trackView({
      segments: [seg('g-1', 'work', 'Build', 0, 1300), seg('g-2', 'break', '', 1300, 2000), seg('g-3', 'work', 'Build', 2000, null)],
    });
    // 経過 0・同じ名前の閉じた分 300・作業の合計 300・全体 2000 → 0 と 300
    expect(secondPhasesOf(view)).toEqual([0, 300]);
  });

  it('Given 位相 0 と 300 / When 経過が 699ms → 700ms へ進む / Then 合計の秒が変わるので組が変わる', () => {
    expect(shownSecondsKey([0, 300], 699)).toBe(shownSecondsKey([0, 300], 0));
    expect(shownSecondsKey([0, 300], 700)).not.toBe(shownSecondsKey([0, 300], 699));
    expect(shownSecondsKey([0, 300], 1000)).not.toBe(shownSecondsKey([0, 300], 999));
  });
});

/**
 * @requirements #476 FR-21（取り消しは 10 秒間）
 */
describe('取り消しの残り秒', () => {
  it.each([
    [10_000, 0, 10],
    [10_000, 1, 10],
    [10_000, 1000, 9],
    [7_200, 0, 8],
    [500, 499, 1],
    [500, 500, 0],
    [500, 9000, 0],
  ])('Given 残り %i ms を受けてから %i ms / When 秒にする / Then %i（切り上げ・0 で下ろす）', (remainingMs, since, seconds) => {
    expect(undoSecondsOf(remainingMs, since)).toBe(seconds);
  });
});

/**
 * @requirements #476 FR-7・設計 §4.3（± のボタンは動かせる範囲に収め、使い切った所で止める）
 */
describe('± のボタンの行き先', () => {
  const range = { minMs: 10 * MIN, maxMs: 20 * MIN };

  it('Given 範囲の中へ動く / When 行き先を求める / Then そのまま動く', () => {
    expect(steppedEdge(15 * MIN, MIN, range)).toBe(16 * MIN);
    expect(steppedEdge(15 * MIN, -5 * MIN, range)).toBe(10 * MIN);
  });

  it('Given 範囲の外へ出る / When 行き先を求める / Then 範囲の端で止まる', () => {
    expect(steppedEdge(18 * MIN, 5 * MIN, range)).toBe(20 * MIN);
    expect(steppedEdge(11 * MIN, -5 * MIN, range)).toBe(10 * MIN);
  });

  it('Given もう端にいる・範囲が無い / When 行き先を求める / Then 動かせない（null）', () => {
    expect(steppedEdge(20 * MIN, MIN, range)).toBeNull();
    expect(steppedEdge(10 * MIN, -MIN, range)).toBeNull();
    expect(steppedEdge(15 * MIN, MIN, null)).toBeNull();
  });

  it('Given 端数のある範囲 / When 行き先を求める / Then 整数の位置に収める（境界のスキーマは整数だけを受ける）', () => {
    expect(steppedEdge(0, MIN, { minMs: -10.5, maxMs: 30_000.7 })).toBe(30_000);
    expect(steppedEdge(0, -MIN, { minMs: -10.5, maxMs: 30_000.7 })).toBe(-10);
  });

  it('Given いまの位置に端数がある / When 範囲の中で動かす / Then 送る位置は整数になる', () => {
    expect(steppedEdge(15 * MIN + 0.912, -MIN, range)).toBe(14 * MIN + 1);
    expect(steppedEdge(15 * MIN + 0.4, MIN, range)).toBe(16 * MIN);
  });
});

/**
 * 読み上げは切り替え・停止・自動の停止のときだけ（設計 §5）。
 */
describe('読み上げの文', () => {
  it('Given 最初の写し / When 文を求める / Then 読まない', () => {
    expect(announcementFor(null, runningTrack())).toBeNull();
  });

  it('Given 止まっている / When 計測が始まる / Then 始めた作業を読む', () => {
    expect(announcementFor(stoppedTrack(), runningTrack())).toBe(announceStarted('Build'));
  });

  it('Given 計測中 / When 別の区切りへ切り替わる / Then 新しい作業を読む（休憩・名前なしも）', () => {
    const toBreak = trackView({ segments: [seg('g-1', 'work', 'Build', 0, MIN), seg('g-2', 'break', '', MIN, null)] });
    const toUnnamed = trackView({ segments: [seg('g-1', 'work', 'Build', 0, MIN), seg('g-2', 'work', '', MIN, null)] });
    const before = trackView({ segments: [seg('g-1', 'work', 'Build', 0, null)] });
    expect(announcementFor(before, toBreak)).toBe(announceStarted(BREAK_NAME));
    expect(announcementFor(before, toUnnamed)).toBe(announceStarted(UNNAMED_NAME));
  });

  it('Given 計測中 / When 同じ区切りのまま写しが届く（経過・定番・名前の付け替え） / Then 読まない', () => {
    expect(announcementFor(runningTrack(1000), runningTrack(2000))).toBeNull();
  });

  it('Given 計測中 / When 止まる / Then 止めたと読む', () => {
    expect(announcementFor(runningTrack(), stoppedTrack())).toBe(ANNOUNCE_STOPPED);
  });

  it('Given 計測中 / When 全員の切断で止まる / Then 自動で止めたと読む', () => {
    const auto = trackView({ segments: [seg('g-1', 'work', 'Build', 0, MIN, true)], resumeOffer: true });
    expect(announcementFor(runningTrack(), auto)).toBe(ANNOUNCE_AUTO_STOPPED);
  });

  it('Given 止まっている / When 止まったままの写しが届く / Then 読まない', () => {
    expect(announcementFor(stoppedTrack(), stoppedTrack(70 * MIN))).toBeNull();
  });
});

/**
 * @requirements #476 FR-22
 */
describe('タブの題', () => {
  it('Given 計測中 / When 題を求める / Then 「作業名 h:mm｜うちわけ」（1 分未満は切り捨て）', () => {
    const view = runningTrack();
    expect(tabTitleOf(view, 45 * MIN + 59_000)).toBe(tabTitle('Build', '0:00'));
    expect(tabTitleOf(view, 45 * MIN + 62 * MIN)).toBe(tabTitle('Build', '1:02'));
  });

  it('Given 休憩・名前なしを計測中 / When 題を求める / Then 休憩・（名前なし）と出す', () => {
    const onBreak = trackView({ segments: [seg('g-1', 'break', '', 0, null)] });
    const unnamed = trackView({ segments: [seg('g-1', 'work', '', 0, null)] });
    expect(tabTitleOf(onBreak, 5 * MIN)).toBe(tabTitle(BREAK_NAME, '0:05'));
    expect(tabTitleOf(unnamed, 5 * MIN)).toBe(tabTitle(UNNAMED_NAME, '0:05'));
  });

  it('Given 止まっている / When 題を求める / Then 無い（元の題に戻す）', () => {
    expect(tabTitleOf(stoppedTrack(), 60 * MIN)).toBeNull();
  });
});

describe('試験の固定データ', () => {
  it('Given 基準の壁時計 / When 読む / Then 2026-11-23 01:00 UTC（時刻の期待値の前提）', () => {
    expect(new Date(EPOCH_WALL_MS).toISOString()).toBe('2026-11-23T01:00:00.000Z');
    expect(LONG_RUNNING_NOTICE_MS).toBeGreaterThan(MIN);
  });
});

/**
 * @requirements #476 FR-27・設計 §4 C1・C1b・C2
 */
describe('離れていたときの問いかけ', () => {
  // Build（g-3）は 45 分から計測中。いまが 135 分なら、ちょうど 90 分続いている
  const NOW = 45 * MIN + LONG_RUNNING_NOTICE_MS;
  const view = runningTrack(NOW);
  const RECEIVED = 1000;
  /** 10 分前（NOW - 10 分）に非表示になった記録 */
  const away = (over: Partial<AwayReturn> = {}): AwayReturn => ({ fromMs: NOW - AWAY_PROMPT_MIN_HIDDEN_MS, runningId: 'g-3', returnedAt: RECEIVED, ...over });

  it('Given 10 分離れ・同じ区切りが 90 分続く・戻った後の写し / When 判定する / Then 問いかけを出し、位置と離れた分を返す', () => {
    expect(awayPromptOf(view, NOW + 2 * MIN, RECEIVED, away())).toEqual({ fromMs: NOW - 10 * MIN, runningId: 'g-3', awayMin: 12 });
  });

  it('Given 非表示が 10 分に 1ms 足りない / When 判定する / Then 出さない（ちょうどなら出す）', () => {
    expect(awayPromptOf(view, NOW - 1, RECEIVED, away({ fromMs: NOW - AWAY_PROMPT_MIN_HIDDEN_MS }))).toBeNull();
    expect(awayPromptOf(view, NOW, RECEIVED, away({ fromMs: NOW - AWAY_PROMPT_MIN_HIDDEN_MS }))).not.toBeNull();
  });

  it('Given 区切りが 90 分に 1ms 足りない / When 判定する / Then 出さない（ちょうどなら出す）', () => {
    expect(awayPromptOf(runningTrack(NOW - 1), NOW - 1, RECEIVED, away({ fromMs: NOW - 11 * MIN }))).toBeNull();
    expect(awayPromptOf(view, NOW, RECEIVED, away({ fromMs: NOW - 11 * MIN }))).not.toBeNull();
  });

  it('Given 計測していない / When 判定する / Then 出さない', () => {
    expect(awayPromptOf(stoppedTrack(NOW), NOW, RECEIVED, away())).toBeNull();
  });

  it('Given 離れた記録が無い / When 判定する / Then 出さない', () => {
    expect(awayPromptOf(view, NOW, RECEIVED, null)).toBeNull();
  });

  it('Given 戻る前に届いた古い写し / When 判定する / Then 出さない（戻った時刻と同時以後の写しで決める）', () => {
    expect(awayPromptOf(view, NOW, RECEIVED - 1, away())).toBeNull();
    expect(awayPromptOf(view, NOW, RECEIVED, away())).not.toBeNull();
  });

  it('Given 非表示になった時と区切りが違う（離れている間に切り替わった・止まって始まった） / When 判定する / Then 出さない', () => {
    expect(awayPromptOf(view, NOW, RECEIVED, away({ runningId: 'g-2' }))).toBeNull();
    expect(awayPromptOf(view, NOW, RECEIVED, away({ runningId: null }))).toBeNull();
  });

  it('Given 計測中の区切りが休憩 / When 判定する / Then 出さない（休憩が長く続いても尋ねない）', () => {
    const resting = trackView({ nowMs: NOW, segments: [seg('g-3', 'break', '', 45 * MIN, null)] });
    expect(awayPromptOf(resting, NOW, RECEIVED, away())).toBeNull();
  });

  it('Given 非表示になった位置が手直しで置ける範囲（24 時間）の外 / When 判定する / Then 出さない（サーバーが拒む）', () => {
    const long = trackView({ nowMs: 30 * 60 * MIN, segments: [seg('g-3', 'work', 'Build', 0, null)] });
    const at = 30 * 60 * MIN;
    expect(awayPromptOf(long, at, RECEIVED, away({ fromMs: at - MAX_LOOKBACK_MS }))).not.toBeNull();
    expect(awayPromptOf(long, at, RECEIVED, away({ fromMs: at - MAX_LOOKBACK_MS - 1 }))).toBeNull();
  });

  it('Given 非表示になった位置が区切りの始まり以前 / When 判定する / Then 出さない（始まりより後ならよい）', () => {
    const late = trackView({ nowMs: NOW, segments: [seg('g-3', 'work', 'Build', NOW - 91 * MIN, null)] });
    expect(awayPromptOf(late, NOW, RECEIVED, away({ fromMs: NOW - 91 * MIN }))).toBeNull();
    expect(awayPromptOf(late, NOW, RECEIVED, away({ fromMs: NOW - 91 * MIN + 1 }))).not.toBeNull();
  });
});

describe('出している問いかけを下ろす条件', () => {
  // Build（g-3）は 45 分から計測中。NOW で 90 分続いている。問いかけは NOW - 10 分の位置から
  const NOW = 45 * MIN + LONG_RUNNING_NOTICE_MS;
  const prompt = { fromMs: NOW - 10 * MIN, runningId: 'g-3', awayMin: 12 };
  const valid = (view = runningTrack(NOW), nowMs = NOW, p = prompt): boolean => isAwayPromptStillValid(view, nowMs, p);

  it('Given 対象の区切りが計測中のまま / When 見直す / Then まだ出してよい', () => {
    expect(valid()).toBe(true);
  });
  it('Given 他の人が止めた・別の区切りに切り替えた / When 見直す / Then 下ろす', () => {
    expect(valid(stoppedTrack(NOW))).toBe(false);
    expect(valid(runningTrack(NOW), NOW, { ...prompt, runningId: 'g-2' })).toBe(false);
  });
  it('Given 区切りの始まりが問いかけの位置以後に動いた / When 見直す / Then 下ろす', () => {
    const moved = trackView({ nowMs: NOW, segments: [seg('g-3', 'work', 'Build', prompt.fromMs, null)] });
    expect(valid(moved)).toBe(false);
  });
  it('Given 区切りが休憩へ付け替えられた / When 見直す / Then 下ろす', () => {
    const resting = trackView({ nowMs: NOW, segments: [seg('g-3', 'break', '', 45 * MIN, null)] });
    expect(valid(resting)).toBe(false);
  });
  it('Given 区切りが 90 分に満たなくなった（始まりが後ろへ動いた） / When 見直す / Then 下ろす', () => {
    const shorter = trackView({ nowMs: NOW, segments: [seg('g-3', 'work', 'Build', 50 * MIN, null)] });
    expect(valid(shorter)).toBe(false);
  });
  it('Given 位置が 24 時間より前になった / When 見直す / Then 下ろす（ちょうど 24 時間ならまだ）', () => {
    const later = NOW + MAX_LOOKBACK_MS;
    expect(valid(runningTrack(later), later, { ...prompt, fromMs: later - MAX_LOOKBACK_MS })).toBe(true);
    expect(valid(runningTrack(later), later, { ...prompt, fromMs: later - MAX_LOOKBACK_MS - 1 })).toBe(false);
  });
  it('Given 位置がいまに近すぎる（10 分に満たない） / When 見直す / Then 下ろす', () => {
    expect(valid(runningTrack(NOW), NOW, { ...prompt, fromMs: NOW - MIN })).toBe(false);
  });
});
