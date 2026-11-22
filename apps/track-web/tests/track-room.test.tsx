/**
 * うちわけの画面の振る舞い（#476・設計 §5・§7）。サーバーは立てず、台本つきの偽の WebSocket で写しを届ける。
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { LONG_RUNNING_NOTICE_MS, toMarkdown, type TrackView } from '@tasuki/track-core';
import { App } from '../src/App';
import {
  ANNOUNCE_AUTO_STOPPED,
  ANNOUNCE_STOPPED,
  AUTO_CLOSED_MARK,
  BACK_FIELD,
  BREAK_BUTTON,
  BREAK_NAME,
  CLEAR_BUTTON,
  CLEAR_CONFIRM_NO,
  CLEAR_CONFIRM_YES,
  COPY_BUTTON,
  COPY_DONE,
  COPY_FAILED,
  COPY_MANUAL_FIELD,
  DISMISS_BUTTON,
  EDGE_END,
  EDGE_START,
  EDIT_APPLY_BUTTON,
  EDIT_KIND_FIELD,
  EDIT_NAME_FIELD,
  FOOTNOTE,
  INSERT_BUTTON,
  INSERT_END_FIELD,
  INSERT_ERROR_ORDER,
  INSERT_ERROR_TIME,
  INSERT_LENGTH_FIELD,
  INSERT_MODE_FIELD,
  INSERT_START_FIELD,
  INSERT_SUBMIT,
  INTRO_TEXT,
  LABEL_FIELD,
  NOW_HEADING,
  NOW_IDLE,
  PAGE_HEADING,
  REMOVE_BUTTON,
  RESUME_BUTTON,
  SPLIT_BUTTON,
  SPLIT_NAME_FIELD,
  SPLIT_OUT_OF_RANGE,
  SPLIT_TIME_FIELD,
  START_BUTTON,
  STOP_BUTTON,
  SWITCH_BUTTON,
  TIMELINE_HEADING,
  TOPIC_MARK,
  TOTALS_HEADING,
  UNDO_BUTTON,
  UNNAMED_NAME,
  announceStarted,
  backOption,
  editLabel,
  longRunningText,
  pinLabel,
  resumeOfferText,
  stepLabel,
  stepText,
  tabTitle,
  undoRemaining,
} from '../src/copy';
import { localTzOffsetMin } from '../src/platform/timezone';
import { clockOf } from '../src/track-view';
import { EMPTY_TRACK, JOINED, MIN, RESUME, ROSTER_FRAME, ScriptedWebSocket, latestSocket, runningTrack, seg, stoppedTrack, trackFrame, trackView } from './support/track-states';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

/** 偽の `performance.now()`（受け取ってからの経過を試験が進める） */
let nowMs = 0;

beforeEach(() => {
  nowMs = 50_000;
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
  localStorage.clear();
  window.history.replaceState(null, '', '/track/?room=R1');
  document.title = PAGE_HEADING;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** 入室して、写しを 1 つ届けた画面を用意する。 */
function renderRoom(state: TrackView | null = EMPTY_TRACK) {
  saveResumeIdentity(RESUME);
  const utils = render(<App />);
  act(() => {
    latestSocket().open();
    latestSocket().deliver(JOINED);
    latestSocket().deliver(ROSTER_FRAME);
    if (state !== null) latestSocket().deliver(trackFrame(state));
  });
  return utils;
}

const deliver = (state: TrackView): void => act(() => latestSocket().deliver(trackFrame(state)));

/** `room.join` より後に送ったコマンド */
const sentCommands = (): Record<string, unknown>[] => latestSocket().sentJson().slice(1);

const tz = localTzOffsetMin();
const clock = (view: TrackView, posMs: number): string => clockOf(view, posMs, tz);
const region = (name: string): HTMLElement => screen.getByRole('region', { name });
const button = (name: string | RegExp): HTMLElement => screen.getByRole('button', { name });

/**
 * @requirements #476 FR-1・FR-20
 */
describe('始まる前', () => {
  it('Given 空の記録 / When 画面を描く / Then 見出し・使い方の 1 行・開始のボタン 1 つ・下の 1 行が出る', () => {
    renderRoom();
    expect(screen.getByRole('heading', { level: 1, name: PAGE_HEADING })).toBeInTheDocument();
    expect(within(region(NOW_HEADING)).getByText(NOW_IDLE)).toBeInTheDocument();
    expect(screen.getByText(INTRO_TEXT)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: START_BUTTON })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: STOP_BUTTON })).toBeNull();
    expect(screen.getByText(FOOTNOTE)).toBeInTheDocument();
  });

  it('Given 作業名が空 / When 開始を押す / Then 名前なしの作業として始める', () => {
    renderRoom();
    fireEvent.click(button(START_BUTTON));
    expect(sentCommands()).toEqual([{ command: 'track.start', label: '', kind: 'work' }]);
  });

  it('Given 作業名を入れた / When 開始を押す / Then その名前で始め、欄を空に戻す', () => {
    renderRoom();
    const field = screen.getByRole('textbox', { name: LABEL_FIELD });
    fireEvent.change(field, { target: { value: 'Build' } });
    fireEvent.click(button(START_BUTTON));
    expect(sentCommands()).toEqual([{ command: 'track.start', label: 'Build', kind: 'work' }]);
    expect(field).toHaveValue('');
  });

  it('Given 参加の途中（写しがまだ無い） / When 画面を描く / Then 入室の門を出し、操作は描かない', () => {
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    expect(screen.queryByRole('button', { name: START_BUTTON })).toBeNull();
  });
});

/**
 * @requirements #476 FR-2・FR-3・FR-16・FR-23
 */
describe('計測中', () => {
  it('Given Build を計測中 / When 画面を描く / Then 作業名と経過（h:mm:ss）と、止める・休憩にするが出る', () => {
    renderRoom(runningTrack(45 * MIN + 42 * MIN + 15_000));
    const now = region(NOW_HEADING);
    expect(within(now).getByText('Build')).toBeInTheDocument();
    expect(within(now).getByText('0:42:15')).toBeInTheDocument();
    expect(within(now).getByRole('button', { name: STOP_BUTTON })).toBeEnabled();
    expect(within(now).getByRole('button', { name: BREAK_BUTTON })).toBeEnabled();
    expect(screen.queryByRole('button', { name: START_BUTTON })).toBeNull();
    expect(button(SWITCH_BUTTON)).toBeInTheDocument();
  });

  it('Given 写しを受け取ってから 5 秒 / When 描き直す / Then 経過は受け取ってからの時間ぶん進む', () => {
    renderRoom(runningTrack(45 * MIN + 10_000));
    nowMs += 5000;
    deliver(runningTrack(45 * MIN + 10_000, { pinned: ['Build'] }));
    nowMs += 5000;
    // 新しい写しの基準で数え直す（古い基準に足さない）: 10 秒 + 5 秒
    deliver(runningTrack(45 * MIN + 10_000, { pinned: [] }));
    expect(within(region(NOW_HEADING)).getByText('0:00:10')).toBeInTheDocument();
  });

  it('Given 計測中 / When 止める・休憩にするを押す / Then 停止・休憩の区切りの開始を送る', () => {
    renderRoom(runningTrack());
    fireEvent.click(button(STOP_BUTTON));
    fireEvent.click(button(BREAK_BUTTON));
    expect(sentCommands()).toEqual([{ command: 'track.stop' }, { command: 'track.start', label: '', kind: 'break' }]);
  });

  it('Given 休憩を計測中 / When 画面を描く / Then 名前は「休憩」で、休憩にするは出さない', () => {
    renderRoom(trackView({ nowMs: 5 * MIN, segments: [seg('g-1', 'break', '', 0, null)] }));
    const now = region(NOW_HEADING);
    expect(within(now).getByText(BREAK_NAME)).toBeInTheDocument();
    expect(within(now).queryByRole('button', { name: BREAK_BUTTON })).toBeNull();
  });

  it('Given 名前なしを計測中 / When 画面を描く / Then 「（名前なし）」と出す', () => {
    renderRoom(trackView({ nowMs: 5 * MIN, segments: [seg('g-1', 'work', '', 0, null)] }));
    expect(within(region(NOW_HEADING)).getByText(UNNAMED_NAME)).toBeInTheDocument();
  });

  it('Given 「5 分前から」を選んだ / When 切り替える / Then backMin: 5 を載せ、選択は「いまから」へ戻る', () => {
    renderRoom(runningTrack());
    const back = screen.getByRole('combobox', { name: BACK_FIELD });
    fireEvent.change(back, { target: { value: '5' } });
    expect(within(back).getByRole('option', { name: backOption(5) })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: LABEL_FIELD }), { target: { value: 'Test' } });
    fireEvent.click(button(SWITCH_BUTTON));
    expect(sentCommands()).toEqual([{ command: 'track.start', label: 'Test', kind: 'work', backMin: 5 }]);
    expect(back).toHaveValue('0');
  });

  it('Given 「10 分前から」を選んだ / When 止める / Then backMin: 10 を載せる', () => {
    renderRoom(runningTrack());
    fireEvent.change(screen.getByRole('combobox', { name: BACK_FIELD }), { target: { value: '10' } });
    fireEvent.click(button(STOP_BUTTON));
    expect(sentCommands()).toEqual([{ command: 'track.stop', backMin: 10 }]);
  });
});

/**
 * @requirements #476 FR-4・FR-15
 */
describe('候補', () => {
  const TOPIC = { type: 'topic', state: { topic: { title: 'FizzBuzz', body: '', source: 'manual' }, generating: false, degraded: false, aiUnlocked: false } };

  it('Given お題・定番・最近の作業 / When 画面を描く / Then お題 → 定番 → 最近の順に番号つきで並び、お題には印が付く', () => {
    renderRoom(runningTrack(60 * MIN, { pinned: ['Plan'] }));
    act(() => latestSocket().deliver(TOPIC));
    const items = within(screen.getByRole('list', { name: '候補' })).getAllByRole('listitem');
    expect(items.map((li) => li.querySelector('.track-candidate-label')?.textContent)).toEqual(['FizzBuzz', 'Plan', 'Build', 'Review']);
    expect(items.map((li) => li.querySelector('.track-candidate-number')?.textContent)).toEqual(['1', '2', '3', '4']);
    expect(within(items[0]!).getByText(TOPIC_MARK)).toBeInTheDocument();
    expect(within(items[1]!).queryByText(TOPIC_MARK)).toBeNull();
  });

  it('Given 候補 / When 押す / Then その名前へ切り替える', () => {
    renderRoom(runningTrack());
    fireEvent.click(button(/^2\s*Review$/));
    expect(sentCommands()).toEqual([{ command: 'track.start', label: 'Review', kind: 'work' }]);
  });

  it('Given 定番とそうでない候補 / When 星を押す / Then 固定・解除を送り、押した状態を aria-pressed で示す', () => {
    renderRoom(runningTrack(60 * MIN, { pinned: ['Review'] }));
    const pinned = button(pinLabel('Review'));
    const unpinned = button(pinLabel('Build'));
    expect(pinned).toHaveAttribute('aria-pressed', 'true');
    expect(unpinned).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(pinned);
    fireEvent.click(unpinned);
    expect(sentCommands()).toEqual([
      { command: 'track.pin', label: 'Review', pinned: false },
      { command: 'track.pin', label: 'Build', pinned: true },
    ]);
  });
});

/**
 * @requirements #476 FR-21
 */
describe('取り消し', () => {
  it('Given 取り消せる操作がある / When 画面を描く / Then 残り秒つきで取り消すを出し、押すとその操作の番号で送る', () => {
    renderRoom(stoppedTrack(60 * MIN, { rev: 9, undo: { rev: 8, kind: 'stop', remainingMs: 7200 } }));
    expect(screen.getByText(undoRemaining(8))).toBeInTheDocument();
    fireEvent.click(button(UNDO_BUTTON));
    expect(sentCommands()).toEqual([{ command: 'track.undo', rev: 8 }]);
  });

  it('Given 取り消しの残り 2 秒 / When 2 秒が過ぎる / Then 取り消すを下ろす', () => {
    vi.useFakeTimers();
    renderRoom(stoppedTrack(60 * MIN, { undo: { rev: 8, kind: 'stop', remainingMs: 2000 } }));
    expect(button(UNDO_BUTTON)).toBeInTheDocument();
    nowMs += 1001;
    act(() => vi.advanceTimersByTime(1001));
    expect(screen.getByText(undoRemaining(1))).toBeInTheDocument();
    nowMs += 1000;
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('button', { name: UNDO_BUTTON })).toBeNull();
  });

  it('Given 取り消しが無い / When 画面を描く / Then 取り消すは出さない', () => {
    renderRoom(runningTrack());
    expect(screen.queryByRole('button', { name: UNDO_BUTTON })).toBeNull();
  });
});

/**
 * @requirements #476 FR-3・FR-19・FR-23
 */
describe('ここまでのうちわけ', () => {
  it('Given 作業 2 つと休憩 / When 画面を描く / Then 作業名ごとの時間と割合、作業の合計・休憩・全体が表に出る（休憩は割合に入らない）', () => {
    // Review 30 分・休憩 15 分・Build 15 分（計測中）
    renderRoom(runningTrack(60 * MIN));
    const rows = within(region(TOTALS_HEADING)).getAllByRole('row').map((row) => [...row.querySelectorAll('th, td')].map((c) => c.textContent));
    expect(rows).toEqual([
      ['作業', '時間', '割合'],
      ['Review', '0:30:00', '67%'],
      ['Build', '0:15:00', '33%'],
      ['作業の合計', '0:45:00', ''],
      ['休憩', '0:15:00', ''],
      ['全体', '1:00:00', ''],
    ]);
  });

  it('Given 割合の帯 / When 画面を描く / Then 帯は飾りで（読み上げから隠す）、作業の数だけ部分を持つ', () => {
    const { container } = renderRoom(runningTrack(60 * MIN));
    const bar = container.querySelector('.track-bar');
    expect(bar).toHaveAttribute('aria-hidden', 'true');
    expect(bar?.querySelectorAll('.track-bar-part')).toHaveLength(2);
  });
});

/**
 * @requirements #476 FR-7・FR-17
 */
describe('時系列と手直し', () => {
  it('Given 区切りが 3 つ / When 画面を描く / Then 始まりの順に、端末の時間帯の時刻と名前が並ぶ（計測中は終わりを出さない）', () => {
    const view = runningTrack();
    const { container } = renderRoom(view);
    const lines = [...container.querySelectorAll('.track-segment')].map((li) => [
      li.querySelector('.track-segment-range')?.textContent,
      li.querySelector('.track-segment-name')?.textContent,
    ]);
    expect(lines).toEqual([
      [`${clock(view, 0)}–${clock(view, 30 * MIN)}`, 'Review'],
      [`${clock(view, 30 * MIN)}–${clock(view, 45 * MIN)}`, BREAK_NAME],
      [`${clock(view, 45 * MIN)}–`, 'Build'],
    ]);
  });

  it('Given 名前なしと、全員の切断で閉じた区切り / When 画面を描く / Then 目立たせ、自動で止まった印を付ける', () => {
    const view = trackView({ nowMs: 60 * MIN, segments: [seg('g-1', 'work', '', 0, 10 * MIN), seg('g-2', 'work', 'Build', 10 * MIN, 20 * MIN, true), seg('g-3', 'work', 'Test', 20 * MIN, 30 * MIN)] });
    const { container } = renderRoom(view);
    const flagged = [...container.querySelectorAll('.track-segment')].map((li) => li.classList.contains('track-segment--flagged'));
    expect(flagged).toEqual([true, true, false]);
    expect(within(container.querySelector('[data-segment="g-2"]') as HTMLElement).getByText(AUTO_CLOSED_MARK)).toBeInTheDocument();
  });

  /** Review（0〜30 分）の行を開く。 */
  function openReview(view = stoppedTrack()) {
    renderRoom(view);
    fireEvent.click(button(editLabel(`${clock(view, 0)}–${clock(view, 30 * MIN)}`, 'Review')));
    return within(region(TIMELINE_HEADING));
  }

  it('Given 閉じた区切りを開いた / When 名前と種類を変える / Then 付け替えを送る（休憩は名前を空にする）', () => {
    const timeline = openReview();
    fireEvent.change(timeline.getByRole('textbox', { name: EDIT_NAME_FIELD }), { target: { value: 'Plan' } });
    fireEvent.click(timeline.getByRole('button', { name: EDIT_APPLY_BUTTON }));
    fireEvent.change(timeline.getByRole('combobox', { name: EDIT_KIND_FIELD }), { target: { value: 'break' } });
    fireEvent.click(timeline.getByRole('button', { name: EDIT_APPLY_BUTTON }));
    expect(sentCommands()).toEqual([
      { command: 'track.segment.set', id: 'g-1', label: 'Plan', kind: 'work' },
      { command: 'track.segment.set', id: 'g-1', label: '', kind: 'break' },
    ]);
  });

  it('Given 閉じた区切りを開いた / When 終わりを −5 分する / Then 終わりを 5 分前の位置へ動かす', () => {
    const timeline = openReview();
    fireEvent.click(timeline.getByRole('button', { name: stepLabel(EDGE_END, stepText('−', 5)) }));
    expect(sentCommands()).toEqual([{ command: 'track.segment.adjust', id: 'g-1', edge: 'end', atMs: 25 * MIN }]);
  });

  it('Given 接している隣が 15 分ある / When 画面を描く / Then 境界を隣ごと動かせるので、終わりの + も始まりの + も押せる', () => {
    // Review 0〜30 分・Build 30〜45 分（接している）
    const timeline = openReview();
    expect(timeline.getByRole('button', { name: stepLabel(EDGE_END, stepText('+', 5)) })).toBeEnabled();
    expect(timeline.getByRole('button', { name: stepLabel(EDGE_START, stepText('+', 1)) })).toBeEnabled();
  });

  it('Given 隙間を使い切る移動 / When +5 分を押す / Then 動かせる範囲の端で止める', () => {
    // Review 0〜30 分、2 分の隙間、Build 32〜45 分。終わりは隙間の端（32 分）まで
    const view = trackView({ nowMs: 60 * MIN, segments: [seg('g-1', 'work', 'Review', 0, 30 * MIN), seg('g-2', 'work', 'Build', 32 * MIN, 45 * MIN)] });
    const timeline = openReview(view);
    fireEvent.click(timeline.getByRole('button', { name: stepLabel(EDGE_END, stepText('+', 5)) }));
    expect(sentCommands()).toEqual([{ command: 'track.segment.adjust', id: 'g-1', edge: 'end', atMs: 32 * MIN }]);
  });

  it('Given 終わりが「いま」と同じ位置の区切り / When 画面を描く / Then 終わりを後ろへ動かすボタンは押せない（いまより先へは置けない）', () => {
    const view = trackView({ nowMs: 45 * MIN, segments: [seg('g-1', 'work', 'Review', 0, 30 * MIN), seg('g-2', 'work', 'Build', 30 * MIN, 45 * MIN)] });
    renderRoom(view);
    fireEvent.click(button(editLabel(`${clock(view, 30 * MIN)}–${clock(view, 45 * MIN)}`, 'Build')));
    const timeline = within(region(TIMELINE_HEADING));
    expect(timeline.getByRole('button', { name: stepLabel(EDGE_END, stepText('+', 1)) })).toBeDisabled();
    expect(timeline.getByRole('button', { name: stepLabel(EDGE_END, stepText('+', 5)) })).toBeDisabled();
    expect(timeline.getByRole('button', { name: stepLabel(EDGE_END, stepText('−', 1)) })).toBeEnabled();
  });

  it('Given 計測中の区切りを開いた / When 画面を描く / Then 終わりの調整と消すは出さず、始まりの調整は出す', () => {
    const view = runningTrack();
    renderRoom(view);
    fireEvent.click(button(editLabel(`${clock(view, 45 * MIN)}–`, 'Build')));
    const timeline = within(region(TIMELINE_HEADING));
    expect(timeline.getByRole('group', { name: EDGE_START })).toBeInTheDocument();
    expect(timeline.queryByRole('group', { name: EDGE_END })).toBeNull();
    expect(timeline.queryByRole('button', { name: REMOVE_BUTTON })).toBeNull();
  });

  it('Given 閉じた区切りを開いた / When 消すを押す / Then その区切りの削除を送る', () => {
    const timeline = openReview();
    fireEvent.click(timeline.getByRole('button', { name: REMOVE_BUTTON }));
    expect(sentCommands()).toEqual([{ command: 'track.segment.remove', id: 'g-1' }]);
  });

  it('Given 閉じた区切りを開いた / When 区切りの中の時刻と後半の名前を入れて分ける / Then その位置で分割を送る', () => {
    const view = stoppedTrack();
    const timeline = openReview(view);
    fireEvent.change(timeline.getByLabelText(SPLIT_TIME_FIELD), { target: { value: clock(view, 10 * MIN) } });
    fireEvent.change(timeline.getByRole('textbox', { name: SPLIT_NAME_FIELD }), { target: { value: 'Plan' } });
    fireEvent.click(timeline.getByRole('button', { name: SPLIT_BUTTON }));
    expect(sentCommands()).toEqual([{ command: 'track.segment.split', id: 'g-1', atMs: 10 * MIN, label: 'Plan', kind: 'work' }]);
  });

  it('Given 閉じた区切りを開いた / When 区切りの外の時刻で分ける / Then 送らずに、入れ直しを求める', () => {
    const view = stoppedTrack();
    const timeline = openReview(view);
    fireEvent.change(timeline.getByLabelText(SPLIT_TIME_FIELD), { target: { value: clock(view, 40 * MIN) } });
    fireEvent.click(timeline.getByRole('button', { name: SPLIT_BUTTON }));
    expect(sentCommands()).toEqual([]);
    expect(timeline.getByRole('alert')).toHaveTextContent(SPLIT_OUT_OF_RANGE);
  });
});

/**
 * @requirements #476 FR-18
 */
describe('抜けを足す', () => {
  function openInsert(view = stoppedTrack()) {
    renderRoom(view);
    fireEvent.click(button(INSERT_BUTTON));
    return within(region(TIMELINE_HEADING));
  }

  it('Given 始まりと終わり / When 足す / Then その範囲の区切りの追加を送り、欄を閉じる', () => {
    const view = stoppedTrack();
    const timeline = openInsert(view);
    fireEvent.change(timeline.getByRole('textbox', { name: EDIT_NAME_FIELD }), { target: { value: 'Call' } });
    fireEvent.change(timeline.getByLabelText(INSERT_START_FIELD), { target: { value: clock(view, 10 * MIN) } });
    fireEvent.change(timeline.getByLabelText(INSERT_END_FIELD), { target: { value: clock(view, 20 * MIN) } });
    fireEvent.click(timeline.getByRole('button', { name: INSERT_SUBMIT }));
    expect(sentCommands()).toEqual([{ command: 'track.segment.insert', startMs: 10 * MIN, endMs: 20 * MIN, label: 'Call', kind: 'work' }]);
    expect(timeline.queryByRole('button', { name: INSERT_SUBMIT })).toBeNull();
  });

  it('Given 始まりと長さ・種類は休憩 / When 足す / Then 終わりは始まりに長さを足した位置で、名前は空になる', () => {
    const view = stoppedTrack();
    const timeline = openInsert(view);
    fireEvent.change(timeline.getByRole('combobox', { name: EDIT_KIND_FIELD }), { target: { value: 'break' } });
    fireEvent.change(timeline.getByRole('combobox', { name: INSERT_MODE_FIELD }), { target: { value: 'length' } });
    fireEvent.change(timeline.getByLabelText(INSERT_START_FIELD), { target: { value: clock(view, 10 * MIN) } });
    fireEvent.change(timeline.getByRole('textbox', { name: INSERT_LENGTH_FIELD }), { target: { value: '25' } });
    fireEvent.click(timeline.getByRole('button', { name: INSERT_SUBMIT }));
    expect(sentCommands()).toEqual([{ command: 'track.segment.insert', startMs: 10 * MIN, endMs: 35 * MIN, label: '', kind: 'break' }]);
  });

  it('Given 時刻が空・終わりが始まりより前 / When 足す / Then 送らずに、誤りを示す', () => {
    const view = stoppedTrack();
    const timeline = openInsert(view);
    fireEvent.click(timeline.getByRole('button', { name: INSERT_SUBMIT }));
    expect(timeline.getByRole('alert')).toHaveTextContent(INSERT_ERROR_TIME);
    fireEvent.change(timeline.getByLabelText(INSERT_START_FIELD), { target: { value: clock(view, 20 * MIN) } });
    fireEvent.change(timeline.getByLabelText(INSERT_END_FIELD), { target: { value: clock(view, 10 * MIN) } });
    fireEvent.click(timeline.getByRole('button', { name: INSERT_SUBMIT }));
    expect(timeline.getByRole('alert')).toHaveTextContent(INSERT_ERROR_ORDER);
    expect(sentCommands()).toEqual([]);
  });

  it('Given 空の記録 / When 抜けを足すを押す / Then 記録が無くても足す欄を開ける', () => {
    const timeline = openInsert(EMPTY_TRACK);
    expect(timeline.getByRole('button', { name: INSERT_SUBMIT })).toBeInTheDocument();
  });
});

/**
 * @requirements #476 FR-8・FR-11・FR-25
 */
describe('持ち帰り', () => {
  it('Given クリップボードが使える / When コピーを押す / Then うちわけの Markdown を書き込み、できたと伝える', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const view = stoppedTrack();
    renderRoom(view);
    await act(async () => {
      fireEvent.click(button(COPY_BUTTON));
    });
    expect(writeText).toHaveBeenCalledWith(toMarkdown(view, 60 * MIN, tz));
    expect(screen.getByRole('status')).toHaveTextContent(COPY_DONE);
    expect(screen.queryByRole('textbox', { name: COPY_MANUAL_FIELD })).toBeNull();
  });

  it('Given クリップボードへ書けない / When コピーを押す / Then 同じ文を選べる欄に出す', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    const view = stoppedTrack();
    renderRoom(view);
    await act(async () => {
      fireEvent.click(button(COPY_BUTTON));
    });
    expect(screen.getByRole('status')).toHaveTextContent(COPY_FAILED);
    const manual = screen.getByRole('textbox', { name: COPY_MANUAL_FIELD });
    expect(manual).toHaveValue(toMarkdown(view, 60 * MIN, tz));
    expect(manual).toHaveAttribute('readonly');
  });

  it('Given 記録がある / When 記録を消すを押す / Then すぐには送らず確かめ、安全な側（やめる）にフォーカスを置く', () => {
    renderRoom(stoppedTrack());
    fireEvent.click(button(CLEAR_BUTTON));
    expect(sentCommands()).toEqual([]);
    expect(button(CLEAR_CONFIRM_NO)).toHaveFocus();
  });

  it('Given 確かめを開いた / When やめる / Then 送らずに閉じ、元のボタンへフォーカスを返す', () => {
    renderRoom(stoppedTrack());
    fireEvent.click(button(CLEAR_BUTTON));
    fireEvent.click(button(CLEAR_CONFIRM_NO));
    expect(sentCommands()).toEqual([]);
    expect(button(CLEAR_BUTTON)).toHaveFocus();
  });

  it('Given 確かめを開いた / When 消すを押す / Then 記録を消すコマンドを送る', () => {
    renderRoom(stoppedTrack());
    fireEvent.click(button(CLEAR_BUTTON));
    fireEvent.click(button(CLEAR_CONFIRM_YES));
    expect(sentCommands()).toEqual([{ command: 'track.clear' }]);
  });

  it('Given 空の記録 / When 画面を描く / Then 記録を消すは押せない', () => {
    renderRoom();
    expect(button(CLEAR_BUTTON)).toBeDisabled();
  });
});

/**
 * @requirements #476 FR-6・FR-24
 */
describe('知らせ', () => {
  const AUTO = trackView({ nowMs: 60 * MIN, segments: [seg('g-1', 'work', 'Build', 0, 20 * MIN, true)], resumeOffer: true });

  it('Given 全員の切断で止まった / When 画面を描く / Then 止めた作業と時刻を伝え、再開する・このままを出す', () => {
    renderRoom(AUTO);
    expect(screen.getByText(resumeOfferText('Build', clock(AUTO, 20 * MIN)))).toBeInTheDocument();
    expect(button(RESUME_BUTTON)).toBeEnabled();
    expect(button(DISMISS_BUTTON)).toBeEnabled();
  });

  it('Given 再開の問いかけ / When 再開する / Then 最後の区切りと同じ名前・種類で、いまから始める', () => {
    renderRoom(AUTO);
    fireEvent.click(button(RESUME_BUTTON));
    expect(sentCommands()).toEqual([{ command: 'track.start', label: 'Build', kind: 'work' }]);
  });

  it('Given 休憩が自動で止まった / When 再開する / Then 休憩として始める', () => {
    renderRoom(trackView({ nowMs: 60 * MIN, segments: [seg('g-1', 'break', '', 0, 20 * MIN, true)], resumeOffer: true }));
    fireEvent.click(button(RESUME_BUTTON));
    expect(sentCommands()).toEqual([{ command: 'track.start', label: '', kind: 'break' }]);
  });

  it('Given 再開の問いかけ / When このまま / Then 問いかけを下ろすコマンドを送る', () => {
    renderRoom(AUTO);
    fireEvent.click(button(DISMISS_BUTTON));
    expect(sentCommands()).toEqual([{ command: 'track.offer.dismiss' }]);
  });

  it('Given 問いかけが無い / When 画面を描く / Then 再開するは出さない', () => {
    renderRoom(stoppedTrack());
    expect(screen.queryByRole('button', { name: RESUME_BUTTON })).toBeNull();
  });

  it('Given 同じ区切りが止め忘れの時間だけ続いた / When 画面を描く / Then 切り替え忘れを尋ねる知らせを出す（数は定数から）', () => {
    const text = longRunningText('Build', LONG_RUNNING_NOTICE_MS / MIN);
    renderRoom(runningTrack(45 * MIN + LONG_RUNNING_NOTICE_MS - 1000));
    expect(screen.queryAllByText(text)).toHaveLength(0);
    deliver(runningTrack(45 * MIN + LONG_RUNNING_NOTICE_MS));
    // 目に見える知らせと、読み上げの領域の 2 か所
    expect(screen.getAllByText(text)).toHaveLength(2);
  });
});

/**
 * 経過は毎秒読ませない。読み上げの領域は常に置き、切り替え・停止・自動の停止のときだけ文を差し替える。
 */
describe('読み上げ', () => {
  const live = (container: HTMLElement): HTMLElement => container.querySelector('.track-live[aria-live="polite"].ui-visually-hidden') as HTMLElement;

  it('Given 最初の写し / When 画面を描く / Then 読み上げの領域は空で置かれている', () => {
    const { container } = renderRoom(runningTrack());
    expect(live(container)).toBeInTheDocument();
    expect(live(container)).toHaveTextContent('');
  });

  it('Given 計測中 / When 経過だけが進んだ写しが届く / Then 読み上げの文は変わらない', () => {
    const { container } = renderRoom(runningTrack(50 * MIN));
    deliver(runningTrack(55 * MIN));
    expect(live(container)).toHaveTextContent('');
  });

  it('Given 計測中 / When 切り替わり、止まる / Then そのたびに文を差し替える', () => {
    const { container } = renderRoom(runningTrack());
    deliver(trackView({ nowMs: 61 * MIN, segments: [seg('g-3', 'work', 'Build', 45 * MIN, 61 * MIN), seg('g-4', 'work', 'Test', 61 * MIN, null)] }));
    expect(live(container)).toHaveTextContent(announceStarted('Test'));
    deliver(trackView({ nowMs: 62 * MIN, segments: [seg('g-3', 'work', 'Build', 45 * MIN, 61 * MIN), seg('g-4', 'work', 'Test', 61 * MIN, 62 * MIN)] }));
    expect(live(container)).toHaveTextContent(ANNOUNCE_STOPPED);
  });

  it('Given 計測中 / When 全員の切断で止まった写しが届く / Then 自動で止めたと読む', () => {
    const { container } = renderRoom(runningTrack());
    deliver(trackView({ nowMs: 70 * MIN, segments: [seg('g-3', 'work', 'Build', 45 * MIN, 60 * MIN, true)], resumeOffer: true }));
    expect(live(container)).toHaveTextContent(ANNOUNCE_AUTO_STOPPED);
  });
});

/**
 * @requirements #476 FR-26
 */
describe('キーボード', () => {
  const press = (key: string, init: KeyboardEventInit = {}): void => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init });
  };

  it('Given 入力欄にフォーカスが無い / When 2 を押す / Then 2 番目の候補へ切り替える', () => {
    // 候補: 1 Build・2 Review
    renderRoom(runningTrack());
    press('2');
    expect(sentCommands()).toEqual([{ command: 'track.start', label: 'Review', kind: 'work' }]);
  });

  it('Given 候補が 2 件 / When 9 を押す / Then 何もしない', () => {
    renderRoom(runningTrack());
    press('9');
    expect(sentCommands()).toEqual([]);
  });

  it('Given 計測中 / When S を押す / Then 止める', () => {
    renderRoom(runningTrack());
    press('s');
    expect(sentCommands()).toEqual([{ command: 'track.stop' }]);
  });

  it('Given 止まっている / When S を押す / Then 何もしない', () => {
    renderRoom(stoppedTrack());
    press('s');
    expect(sentCommands()).toEqual([]);
  });

  it('Given Build を計測中で、その前は Review / When C を押す / Then 直前の作業（Review）を再開する', () => {
    renderRoom(runningTrack());
    press('c');
    expect(sentCommands()).toEqual([{ command: 'track.start', label: 'Review', kind: 'work' }]);
  });

  it('Given 直前の作業が無い / When C を押す / Then 何もしない', () => {
    renderRoom(EMPTY_TRACK);
    press('c');
    expect(sentCommands()).toEqual([]);
  });

  it('Given 作業名の欄にフォーカスがある / When 数字や S を打つ / Then 操作として拾わない', () => {
    renderRoom(runningTrack());
    screen.getByRole('textbox', { name: LABEL_FIELD }).focus();
    press('1');
    press('s');
    expect(sentCommands()).toEqual([]);
  });

  it.each([
    ['Ctrl つき', { ctrlKey: true }],
    ['Meta つき', { metaKey: true }],
    ['Alt つき', { altKey: true }],
    ['IME の変換中', { isComposing: true }],
    ['変換の確定（keyCode 229）', { keyCode: 229 }],
  ])('Given %s / When S を押す / Then 拾わない', (_label, init) => {
    renderRoom(runningTrack());
    press('s', init);
    expect(sentCommands()).toEqual([]);
  });

  it('Given 消す確かめが開いている / When S を押す / Then 拾わない', () => {
    renderRoom(runningTrack());
    fireEvent.click(button(CLEAR_BUTTON));
    press('s');
    expect(sentCommands()).toEqual([]);
  });
});

/**
 * @requirements #476 FR-22
 */
describe('タブの題', () => {
  it('Given 計測中 / When 画面を描く / Then 「作業名 h:mm｜うちわけ」になり、止まると元の題に戻る', () => {
    renderRoom(runningTrack(45 * MIN + 62 * MIN));
    expect(document.title).toBe(tabTitle('Build', '1:02'));
    deliver(stoppedTrack());
    expect(document.title).toBe(PAGE_HEADING);
  });

  it('Given 計測中 / When 画面を外す / Then 元の題に戻す', () => {
    const { unmount } = renderRoom(runningTrack());
    expect(document.title).not.toBe(PAGE_HEADING);
    unmount();
    expect(document.title).toBe(PAGE_HEADING);
  });
});

/**
 * 切断中に押された操作は入り直しより先に届いて失敗するので、押させない（設計 §7 非機能）。
 */
describe('切断中', () => {
  it('Given 計測中の画面 / When 接続が切れる / Then 操作のボタンは押せず、キーも拾わない', () => {
    renderRoom(runningTrack());
    act(() => latestSocket().drop());
    expect(button(STOP_BUTTON)).toBeDisabled();
    expect(button(BREAK_BUTTON)).toBeDisabled();
    expect(button(SWITCH_BUTTON)).toBeDisabled();
    expect(button(/^2\s*Review$/)).toBeDisabled();
    const sentBefore = latestSocket().sent.length;
    fireEvent.keyDown(document.body, { key: 's' });
    expect(latestSocket().sent.length).toBe(sentBefore);
  });
});

/**
 * @requirements #476 FR-12（上限はサーバーの文で示す）
 */
describe('操作の失敗', () => {
  it('Given 操作が拒まれた / When エラーが届く / Then サーバーの文を出し、閉じるで下ろせる', () => {
    renderRoom(runningTrack());
    act(() => latestSocket().deliver({ type: 'error', code: 'TRACK_INVALID_LABEL', message: '作業名は 80 字までです' }));
    expect(screen.getByRole('alert')).toHaveTextContent('作業名は 80 字までです');
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button'));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
