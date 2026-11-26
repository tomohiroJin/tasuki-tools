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
  AWAY_BREAK_BUTTON,
  AWAY_CUT_BUTTON,
  AWAY_KEEP_BUTTON,
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
  EDGE_OUT_OF_RANGE,
  EDGE_SET_BUTTON,
  EDGE_START,
  EDIT_APPLY_BUTTON,
  EDIT_KIND_FIELD,
  EDIT_NAME_FIELD,
  FOOTNOTE,
  INSERT_BUTTON,
  INSERT_CANCEL,
  INSERT_END_FIELD,
  INSERT_ERROR_ORDER,
  INSERT_ERROR_TIME,
  INSERT_LENGTH_FIELD,
  INSERT_MODE_FIELD,
  insertPreviewEdgeText,
  insertPreviewText,
  INSERT_START_FIELD,
  INSERT_SUBMIT,
  INSERT_YESTERDAY_NOTE,
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
  RUNNING_MARK,
  TOPIC_MARK,
  TOTALS_HEADING,
  NOTIFY_BUTTON,
  NOTIFY_DENIED_TEXT,
  UNDO_BUTTON,
  UNDO_NOTE_AWAY,
  UNNAMED_NAME,
  LONG_RUNNING_NOTIFY_BODY,
  announceStarted,
  awayPromptText,
  longRunningNotifyTitle,
  backOption,
  editLabel,
  edgeTimeLabel,
  longRunningText,
  pinLabel,
  resumeOfferText,
  stepLabel,
  unnamedPrompt,
  stepText,
  tabTitle,
  undoRemaining,
} from '../src/copy';
import { NOTIFY_PREFERENCE_KEY } from '../src/platform/notify';
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

  it('Given お題・定番・最近の作業 / When 画面を描く / Then お題 → 定番 → 最近の順に並び、番号は押せる候補だけに付き（計測中の Build は飛ばす）、お題には印が付く', () => {
    renderRoom(runningTrack(60 * MIN, { pinned: ['Plan'] }));
    act(() => latestSocket().deliver(TOPIC));
    const items = within(screen.getByRole('list', { name: '候補' })).getAllByRole('listitem');
    expect(items.map((li) => li.querySelector('.track-candidate-label')?.textContent)).toEqual(['FizzBuzz', 'Plan', 'Build', 'Review']);
    expect(items.map((li) => li.querySelector('.track-candidate-number')?.textContent)).toEqual(['1', '2', undefined, '3']);
    expect(within(items[0]!).getByText(TOPIC_MARK)).toBeInTheDocument();
    expect(within(items[1]!).queryByText(TOPIC_MARK)).toBeNull();
  });

  it('Given 候補 / When 押す / Then その名前へ切り替える', () => {
    renderRoom(runningTrack());
    fireEvent.click(button(/^1\s*Review$/));
    expect(sentCommands()).toEqual([{ command: 'track.start', label: 'Review', kind: 'work' }]);
  });

  it('Given 計測中の作業名が候補にもある / When 画面を描く / Then 一覧に残すが、計測中と示して押せず、番号は押せる候補だけに振る', () => {
    renderRoom(runningTrack(60 * MIN, { pinned: ['Build', 'Review'] }));
    const items = within(screen.getByRole('list', { name: '候補' })).getAllByRole('listitem');
    expect(items.map((li) => li.querySelector('.track-candidate-label')?.textContent)).toEqual(['Build', 'Review']);
    const running = items[0]!;
    expect(within(running).getByText(RUNNING_MARK)).toBeInTheDocument();
    expect(running.querySelector('.track-candidate-number')).toBeNull();
    expect(running.querySelector('.track-candidate-pick')).toBeDisabled();
    expect(items[1]!.querySelector('.track-candidate-number')?.textContent).toBe('1');
  });

  it('Given 計測中の作業名が候補にもある / When 星を押す / Then 計測中の名前でも固定・解除を送る', () => {
    renderRoom(runningTrack(60 * MIN, { pinned: ['Build'] }));
    fireEvent.click(button(pinLabel('Build')));
    expect(sentCommands()).toEqual([{ command: 'track.pin', label: 'Build', pinned: false }]);
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
    // 消した行の欄は外れるので、フォーカスは時系列の見出しへ移る（body に落とさない）
    expect(document.activeElement).toBe(timeline.getByRole('heading', { name: TIMELINE_HEADING }));
  });

  it('Given 止まっている画面を開いたまま 10 分経つ / When 最後の区切りを開く / Then 終わりを後ろへ動かすボタンが押せる（描いた時点の「いま」を使い回さない）', () => {
    // Build は 30〜45 分で止まり、写しの「いま」も 45 分。描き直しは起きない
    const view = trackView({ nowMs: 45 * MIN, segments: [seg('g-1', 'work', 'Review', 0, 30 * MIN), seg('g-2', 'work', 'Build', 30 * MIN, 45 * MIN)] });
    renderRoom(view);
    nowMs += 10 * MIN;
    fireEvent.click(button(editLabel(`${clock(view, 30 * MIN)}–${clock(view, 45 * MIN)}`, 'Build')));
    const timeline = within(region(TIMELINE_HEADING));
    expect(timeline.getByRole('button', { name: stepLabel(EDGE_END, stepText('+', 5)) })).toBeEnabled();
  });

  it('Given 終わりが「いま」と同じ区切りを開いている / When 開いたまま 1 分経つ / Then 終わりの +1 分が押せるようになる', () => {
    vi.useFakeTimers();
    const view = trackView({ nowMs: 45 * MIN, segments: [seg('g-1', 'work', 'Review', 0, 30 * MIN), seg('g-2', 'work', 'Build', 30 * MIN, 45 * MIN)] });
    renderRoom(view);
    fireEvent.click(button(editLabel(`${clock(view, 30 * MIN)}–${clock(view, 45 * MIN)}`, 'Build')));
    const plusOne = (): HTMLElement => within(region(TIMELINE_HEADING)).getByRole('button', { name: stepLabel(EDGE_END, stepText('+', 1)) });
    expect(plusOne()).toBeDisabled();
    nowMs += MIN;
    act(() => vi.advanceTimersByTime(1000));
    expect(plusOne()).toBeEnabled();
  });

  it('Given 閉じた区切りを開いた / When 終わりの時刻を入れて合わせる / Then その時刻の位置へ終わりを動かす', () => {
    const view = stoppedTrack();
    const timeline = openReview(view);
    fireEvent.change(timeline.getByLabelText(edgeTimeLabel(EDGE_END)), { target: { value: clock(view, 20 * MIN) } });
    fireEvent.click(within(timeline.getByRole('group', { name: EDGE_END })).getByRole('button', { name: EDGE_SET_BUTTON }));
    expect(sentCommands()).toEqual([{ command: 'track.segment.adjust', id: 'g-1', edge: 'end', atMs: 20 * MIN }]);
  });

  it('Given 閉じた区切りを開いた / When 動かせない時刻を入れて合わせる / Then 送らず、動かせないと知らせる', () => {
    // Review 0〜30 分。始まりを終わりより後の時刻（40 分）へは動かせない
    const view = stoppedTrack();
    const timeline = openReview(view);
    fireEvent.change(timeline.getByLabelText(edgeTimeLabel(EDGE_START)), { target: { value: clock(view, 40 * MIN) } });
    fireEvent.click(within(timeline.getByRole('group', { name: EDGE_START })).getByRole('button', { name: EDGE_SET_BUTTON }));
    expect(sentCommands()).toEqual([]);
    expect(timeline.getByRole('alert')).toHaveTextContent(EDGE_OUT_OF_RANGE);
  });

  it('Given 最初の区切りの始まり / When 終わりより後に見える時刻を入れる / Then 範囲に収まる読み方（前日）があれば受け、収まらなければ送らずに知らせる', () => {
    // Review 0〜30 分・いま 60 分。始まりの下限は前日の 60 分の位置（11:00）。61 分の時刻は今日では終わりより後だが、前日の読みは下限に収まる
    const view = stoppedTrack();
    const timeline = openReview(view);
    fireEvent.change(timeline.getByLabelText(edgeTimeLabel(EDGE_START)), { target: { value: clock(view, 61 * MIN) } });
    fireEvent.click(within(timeline.getByRole('group', { name: EDGE_START })).getByRole('button', { name: EDGE_SET_BUTTON }));
    expect(sentCommands()).toEqual([{ command: 'track.segment.adjust', id: 'g-1', edge: 'start', atMs: 61 * MIN - 24 * 60 * MIN }]);
  });

  it('Given 最初の区切りの始まり / When 前日として読む時刻を入れた（押す前） / Then 前日を添えた時刻と動かした後の長さを欄の中に出す', () => {
    // Review 0〜30 分・いま 60 分。61 分の時刻は前日として読まれ、区切りは 23:29 になる。押す前に見えて、読み上げの対象にはしない
    const view = stoppedTrack();
    const timeline = openReview(view);
    expect(timeline.queryByText(/^読み取った時間/)).toBeNull();
    fireEvent.change(timeline.getByLabelText(edgeTimeLabel(EDGE_START)), { target: { value: clock(view, 61 * MIN) } });
    const preview = timeline.getByText(insertPreviewText(insertPreviewEdgeText(clock(view, 61 * MIN), true), insertPreviewEdgeText(clock(view, 30 * MIN), false), '23:29'));
    expect(preview.closest('[aria-live]')).toBeNull();
    expect(sentCommands()).toEqual([]);
  });

  it('Given 終わりを合わせる時刻を入れた（押す前） / When 範囲に収まる時刻 / Then 同じ書き方で時刻と長さを出し、読み取れない入力では出さない', () => {
    const view = stoppedTrack();
    const timeline = openReview(view);
    fireEvent.change(timeline.getByLabelText(edgeTimeLabel(EDGE_END)), { target: { value: clock(view, 20 * MIN) } });
    expect(timeline.getByText(insertPreviewText(insertPreviewEdgeText(clock(view, 0), false), insertPreviewEdgeText(clock(view, 20 * MIN), false), '0:20'))).toBeInTheDocument();
    // 始まりより前に動かす時刻は範囲に収まらないので出さない
    fireEvent.change(timeline.getByLabelText(edgeTimeLabel(EDGE_START)), { target: { value: clock(view, 59 * MIN) } });
    fireEvent.change(timeline.getByLabelText(edgeTimeLabel(EDGE_END)), { target: { value: '' } });
    expect(timeline.queryByText(/^読み取った時間/)).toBeNull();
  });

  it('Given 最初の区切りの始まり / When どの読み方も範囲に収まらない時刻を入れる / Then 送らずに知らせる', () => {
    // 59 分の時刻は、今日では終わりより後・前日では下限（前日の 60 分の位置）より前
    const view = stoppedTrack();
    const timeline = openReview(view);
    fireEvent.change(timeline.getByLabelText(edgeTimeLabel(EDGE_START)), { target: { value: clock(view, 59 * MIN) } });
    fireEvent.click(within(timeline.getByRole('group', { name: EDGE_START })).getByRole('button', { name: EDGE_SET_BUTTON }));
    expect(sentCommands()).toEqual([]);
    expect(timeline.getByRole('alert')).toHaveTextContent(EDGE_OUT_OF_RANGE);
  });

  it('Given 名前のない区切りが 2 つ / When 画面を描く / Then 件数を添えて、名前を付けるよう促す', () => {
    const view = trackView({ nowMs: 60 * MIN, segments: [seg('g-1', 'work', '', 0, 10 * MIN), seg('g-2', 'work', 'Build', 10 * MIN, 20 * MIN), seg('g-3', 'work', '', 20 * MIN, 30 * MIN)] });
    renderRoom(view);
    expect(within(region(TIMELINE_HEADING)).getByText(unnamedPrompt(2))).toBeInTheDocument();
  });

  it('Given 名前のない区切りが無い（休憩はある） / When 画面を描く / Then 促しは出さない', () => {
    renderRoom(stoppedTrack());
    expect(document.querySelector('.track-unnamed-prompt')).toBeNull();
    expect(region(TIMELINE_HEADING)).toBeInTheDocument();
  });

  it('Given 抜けを足す欄を開いた / When やめる / Then 欄が閉じ、フォーカスは開いたボタンへ返る', () => {
    renderRoom(stoppedTrack());
    fireEvent.click(button(INSERT_BUTTON));
    fireEvent.click(button(INSERT_CANCEL));
    expect(document.activeElement).toBe(button(INSERT_BUTTON));
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

  it('Given 終わりがいまより後（前日として読むと始まりより後にならない） / When 足す / Then 送らずに、前日の時刻として読んだことと順の誤りを示す', () => {
    const view = stoppedTrack();
    const timeline = openInsert(view);
    fireEvent.change(timeline.getByLabelText(INSERT_START_FIELD), { target: { value: clock(view, 20 * MIN) } });
    fireEvent.change(timeline.getByLabelText(INSERT_END_FIELD), { target: { value: clock(view, 61 * MIN) } });
    fireEvent.click(timeline.getByRole('button', { name: INSERT_SUBMIT }));
    expect(timeline.getByRole('alert')).toHaveTextContent(`${INSERT_YESTERDAY_NOTE}${INSERT_ERROR_ORDER}`);
    expect(sentCommands()).toEqual([]);
  });

  it('Given 始まりと終わりを入れた / When 押す前 / Then 読み取った範囲と長さを出す（読み上げの対象にはしない）', () => {
    const view = stoppedTrack();
    const timeline = openInsert(view);
    expect(timeline.queryByText(/^読み取った時間/)).toBeNull();
    fireEvent.change(timeline.getByLabelText(INSERT_START_FIELD), { target: { value: clock(view, 10 * MIN) } });
    fireEvent.change(timeline.getByLabelText(INSERT_END_FIELD), { target: { value: clock(view, 25 * MIN) } });
    const preview = timeline.getByText(insertPreviewText(insertPreviewEdgeText(clock(view, 10 * MIN), false), insertPreviewEdgeText(clock(view, 25 * MIN), false), '0:15'));
    expect(preview.closest('[aria-live]')).toBeNull();
    expect(timeline.queryByRole('alert')).toBeNull();
    expect(timeline.queryByRole('status')).toBeNull();
  });

  it('Given 始まりが前日に読み替わる（23.5 時間） / When 押す前 / Then 前日を添えた範囲と長さを出し、終わりで指定しても長さで指定しても同じ', () => {
    const view = stoppedTrack();
    const timeline = openInsert(view);
    // いまは 60 分の位置。90 分の位置の時刻は前日、50 分の位置は今日
    fireEvent.change(timeline.getByLabelText(INSERT_START_FIELD), { target: { value: clock(view, 90 * MIN) } });
    fireEvent.change(timeline.getByLabelText(INSERT_END_FIELD), { target: { value: clock(view, 50 * MIN) } });
    const expected = insertPreviewText(insertPreviewEdgeText(clock(view, 90 * MIN), true), insertPreviewEdgeText(clock(view, 50 * MIN), false), '23:20');
    expect(timeline.getByText(expected)).toBeInTheDocument();
    fireEvent.change(timeline.getByRole('combobox', { name: INSERT_MODE_FIELD }), { target: { value: 'length' } });
    fireEvent.change(timeline.getByRole('textbox', { name: INSERT_LENGTH_FIELD }), { target: { value: String(23 * 60 + 20) } });
    expect(timeline.getByText(expected)).toBeInTheDocument();
  });

  it('Given 誤りを示した後 / When 入力を直す（始まり・終わり・指定のしかた・長さのどれでも） / Then 前の誤りは下ろし、新しい「読み取った時間」と並べない', () => {
    const view = stoppedTrack();
    const timeline = openInsert(view);
    const failOnce = (): void => {
      fireEvent.change(timeline.getByLabelText(INSERT_START_FIELD), { target: { value: clock(view, 20 * MIN) } });
      fireEvent.change(timeline.getByLabelText(INSERT_END_FIELD), { target: { value: clock(view, 10 * MIN) } });
      fireEvent.click(timeline.getByRole('button', { name: INSERT_SUBMIT }));
      expect(timeline.getByRole('alert')).toBeInTheDocument();
    };
    failOnce();
    fireEvent.change(timeline.getByLabelText(INSERT_END_FIELD), { target: { value: clock(view, 30 * MIN) } });
    expect(timeline.queryByRole('alert')).toBeNull();
    expect(timeline.getByText(/^読み取った時間/)).toBeInTheDocument();
    // 始まりを直した場合
    fireEvent.change(timeline.getByLabelText(INSERT_END_FIELD), { target: { value: clock(view, 10 * MIN) } });
    fireEvent.click(timeline.getByRole('button', { name: INSERT_SUBMIT }));
    expect(timeline.getByRole('alert')).toBeInTheDocument();
    fireEvent.change(timeline.getByLabelText(INSERT_START_FIELD), { target: { value: clock(view, 5 * MIN) } });
    expect(timeline.queryByRole('alert')).toBeNull();
    // 指定のしかたを変えた場合
    fireEvent.change(timeline.getByLabelText(INSERT_START_FIELD), { target: { value: '' } });
    fireEvent.click(timeline.getByRole('button', { name: INSERT_SUBMIT }));
    expect(timeline.getByRole('alert')).toBeInTheDocument();
    fireEvent.change(timeline.getByRole('combobox', { name: INSERT_MODE_FIELD }), { target: { value: 'length' } });
    expect(timeline.queryByRole('alert')).toBeNull();
    // 長さを直した場合
    fireEvent.click(timeline.getByRole('button', { name: INSERT_SUBMIT }));
    expect(timeline.getByRole('alert')).toBeInTheDocument();
    fireEvent.change(timeline.getByRole('textbox', { name: INSERT_LENGTH_FIELD }), { target: { value: '10' } });
    expect(timeline.queryByRole('alert')).toBeNull();
  });

  it('Given 前日に読んだ範囲を出している / When 開いたまま「いま」が進む / Then 前日の添えを描き直して外す', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const view = stoppedTrack();
    const timeline = openInsert(view);
    // いまは 60 分の位置。70・80 分の位置の時刻は前日
    fireEvent.change(timeline.getByLabelText(INSERT_START_FIELD), { target: { value: clock(view, 70 * MIN) } });
    fireEvent.change(timeline.getByLabelText(INSERT_END_FIELD), { target: { value: clock(view, 80 * MIN) } });
    expect(timeline.getByText(insertPreviewText(insertPreviewEdgeText(clock(view, 70 * MIN), true), insertPreviewEdgeText(clock(view, 80 * MIN), true), '0:10'))).toBeInTheDocument();
    nowMs += 30 * MIN;
    act(() => vi.advanceTimersByTime(1000));
    expect(timeline.getByText(insertPreviewText(insertPreviewEdgeText(clock(view, 70 * MIN), false), insertPreviewEdgeText(clock(view, 80 * MIN), false), '0:10'))).toBeInTheDocument();
  });

  it('Given 読み取れない入力（順が逆） / When 押す前 / Then 範囲は出さない', () => {
    const view = stoppedTrack();
    const timeline = openInsert(view);
    fireEvent.change(timeline.getByLabelText(INSERT_START_FIELD), { target: { value: clock(view, 20 * MIN) } });
    fireEvent.change(timeline.getByLabelText(INSERT_END_FIELD), { target: { value: clock(view, 10 * MIN) } });
    expect(timeline.queryByText(/^読み取った時間/)).toBeNull();
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

  it('Given 確かめを開いた / When 消すを押す / Then 空の写しが届くまでフォーカスを動かさず、届いたら開始のボタンへ移す', () => {
    renderRoom(stoppedTrack());
    fireEvent.click(button(CLEAR_BUTTON));
    fireEvent.click(button(CLEAR_CONFIRM_YES));
    expect(button(START_BUTTON)).not.toHaveFocus();
    deliver(trackView({ nowMs: 60 * MIN, rev: 9 }));
    expect(button(START_BUTTON)).toHaveFocus();
  });

  it('Given 計測中 / When 記録を消して空の写しが届く / Then フォーカスは開始のボタンへ移る', () => {
    renderRoom(trackView({ nowMs: 60 * MIN, segments: [seg('g-1', 'work', 'Build', 0, null)] }));
    fireEvent.click(button(CLEAR_BUTTON));
    fireEvent.click(button(CLEAR_CONFIRM_YES));
    deliver(trackView({ nowMs: 60 * MIN, rev: 9 }));
    expect(button(START_BUTTON)).toHaveFocus();
  });

  it('Given 確かめを開いた / When 消すが拒まれる / Then フォーカスは元の「記録を消す」へ戻る', () => {
    renderRoom(stoppedTrack());
    fireEvent.click(button(CLEAR_BUTTON));
    fireEvent.click(button(CLEAR_CONFIRM_YES));
    act(() => latestSocket().deliver({ type: 'error', code: 'TRACK_INVALID_LABEL', message: '拒まれました' }));
    expect(button(CLEAR_BUTTON)).toHaveFocus();
    expect(button(START_BUTTON)).not.toHaveFocus();
  });

  it('Given 前の操作の拒否の文が画面に出たまま / When 記録を消して空の写しが届く / Then 前の文を今回の拒否と取り違えず、フォーカスは開始のボタンへ移る', () => {
    renderRoom(stoppedTrack());
    act(() => latestSocket().deliver({ type: 'error', code: 'TRACK_INVALID_LABEL', message: '作業名は 80 字までです' }));
    expect(screen.getByRole('alert')).toHaveTextContent('作業名は 80 字までです');
    fireEvent.click(button(CLEAR_BUTTON));
    fireEvent.click(button(CLEAR_CONFIRM_YES));
    deliver(trackView({ nowMs: 60 * MIN, rev: 9 }));
    expect(button(START_BUTTON)).toHaveFocus();
  });

  it('Given 前の操作の拒否の文が出たまま / When 記録を消すが同じ文で拒まれる / Then フォーカスは元の「記録を消す」へ戻る', () => {
    renderRoom(stoppedTrack());
    act(() => latestSocket().deliver({ type: 'error', code: 'TRACK_INVALID_LABEL', message: '同じ拒否の文' }));
    fireEvent.click(button(CLEAR_BUTTON));
    fireEvent.click(button(CLEAR_CONFIRM_YES));
    act(() => latestSocket().deliver({ type: 'error', code: 'TRACK_INVALID_LABEL', message: '同じ拒否の文' }));
    expect(button(CLEAR_BUTTON)).toHaveFocus();
  });

  it('Given 消すを送った後に接続が切れた / When つながり直す / Then フォーカスは「記録を消す」へ飛ばない', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    renderRoom(stoppedTrack());
    fireEvent.click(button(CLEAR_BUTTON));
    fireEvent.click(button(CLEAR_CONFIRM_YES));
    act(() => latestSocket().drop());
    expect(button(CLEAR_BUTTON)).toBeDisabled();
    act(() => vi.advanceTimersByTime(30_000));
    act(() => {
      latestSocket().open();
      latestSocket().deliver(JOINED);
      latestSocket().deliver(ROSTER_FRAME);
      latestSocket().deliver(trackFrame(stoppedTrack()));
    });
    expect(button(CLEAR_BUTTON)).toBeEnabled();
    expect(button(CLEAR_BUTTON)).not.toHaveFocus();
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

  it('Given 入力欄にフォーカスが無い / When 1 を押す / Then 1 番目の候補へ切り替える', () => {
    // 候補: 1 Review（計測中の Build は外れる）
    renderRoom(runningTrack());
    press('1');
    expect(sentCommands()).toEqual([{ command: 'track.start', label: 'Review', kind: 'work' }]);
  });

  it('Given 候補が 1 件 / When 9 を押す / Then 何もしない', () => {
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
    expect(button(/^1\s*Review$/)).toBeDisabled();
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

/** `document.visibilityState` を差し替えて `visibilitychange` を起こす。 */
function setVisibility(state: 'visible' | 'hidden'): void {
  act(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

/**
 * @requirements #476 FR-27・設計 §4 C1〜C5
 */
describe('離れていたとき', () => {
  /** Build（g-3）が 45 分から計測中。135 分で、ちょうど 90 分続いている */
  const LONG_NOW = 45 * MIN + LONG_RUNNING_NOTICE_MS;

  afterEach(() => {
    Reflect.deleteProperty(document, 'visibilityState');
    Reflect.deleteProperty(window, 'documentPictureInPicture');
  });

  /** 隠れて、`awayMs` たって表に戻る（写しはまだ届かない）。 */
  function leaveAndReturn(awayMs: number): void {
    setVisibility('hidden');
    nowMs += awayMs;
    setVisibility('visible');
  }

  /** 戻った後に、サーバーの新しい写し（位置は非表示になった位置から `awayMs` 後）が届く。 */
  function leaveReturnAndSync(awayMs: number, after: TrackView = runningTrack(LONG_NOW + awayMs)): void {
    leaveAndReturn(awayMs);
    deliver(after);
  }

  it('Given 90 分続く計測中 / When 12 分離れて戻り写しが届く / Then 戻った本人の画面に問いかけが出て、離れたことは送らない', () => {
    renderRoom(runningTrack(LONG_NOW));
    const before = sentCommands().length;
    leaveReturnAndSync(12 * MIN);
    expect(screen.getByText(awayPromptText(12))).toBeInTheDocument();
    // 戻ったときに送るのは写しの取り直し（track.sync）だけ。離れたこと自体はサーバーへ送らない
    expect(sentCommands().slice(before).map((c) => c['command'])).toEqual(['track.sync']);
  });

  it('Given 戻った直後で写しがまだ届かない / When 判定する / Then 問いかけを出さず、写しが届いてから出す', () => {
    renderRoom(runningTrack(LONG_NOW));
    leaveAndReturn(12 * MIN);
    expect(screen.queryByText(/離れていました/)).toBeNull();
    deliver(runningTrack(LONG_NOW + 12 * MIN));
    expect(screen.getByText(awayPromptText(12))).toBeInTheDocument();
  });

  it('Given 問いかけが出ている / When 「離れた時刻で切る」 / Then 非表示になった位置で止める（track.stop の atMs）', () => {
    renderRoom(runningTrack(LONG_NOW));
    leaveReturnAndSync(12 * MIN);
    fireEvent.click(button(AWAY_CUT_BUTTON));
    expect(sentCommands().at(-1)).toEqual({ command: 'track.stop', atMs: LONG_NOW });
    expect(screen.queryByText(awayPromptText(12))).toBeNull();
  });

  it('Given 問いかけが出ている / When 「その間を休憩にする」 / Then 非表示になった位置からの track.away を送る', () => {
    renderRoom(runningTrack(LONG_NOW));
    leaveReturnAndSync(12 * MIN);
    fireEvent.click(button(AWAY_BREAK_BUTTON));
    expect(sentCommands().at(-1)).toEqual({ command: 'track.away', fromMs: LONG_NOW });
    expect(screen.queryByText(awayPromptText(12))).toBeNull();
  });

  it('Given 問いかけが出ている / When 「そのまま残す」 / Then 何も送らず、問いかけを下ろす', () => {
    renderRoom(runningTrack(LONG_NOW));
    leaveReturnAndSync(12 * MIN);
    const before = sentCommands().length;
    fireEvent.click(button(AWAY_KEEP_BUTTON));
    expect(sentCommands()).toHaveLength(before);
    expect(screen.queryByText(awayPromptText(12))).toBeNull();
  });

  it('Given 問いかけが出ている / When 何も押さずに写しが届き続ける / Then 何も送らず、問いかけは出たまま', () => {
    renderRoom(runningTrack(LONG_NOW));
    leaveReturnAndSync(12 * MIN);
    const before = sentCommands().length;
    nowMs += 30_000;
    deliver(runningTrack(LONG_NOW + 12 * MIN + 30_000));
    expect(screen.getByText(awayPromptText(12))).toBeInTheDocument();
    expect(sentCommands()).toHaveLength(before);
  });

  it('Given 離れたのが 10 分に満たない / When 戻る / Then 問いかけを出さない', () => {
    renderRoom(runningTrack(LONG_NOW));
    leaveReturnAndSync(10 * MIN - 1);
    expect(screen.queryByText(/離れていました/)).toBeNull();
  });

  it('Given 計測中の区切りが 90 分に満たない / When 12 分離れて戻る / Then 問いかけを出さない', () => {
    renderRoom(runningTrack(LONG_NOW - 13 * MIN));
    leaveReturnAndSync(12 * MIN, runningTrack(LONG_NOW - 13 * MIN + 12 * MIN));
    expect(screen.queryByText(/離れていました/)).toBeNull();
  });

  it('Given 離れている間に別の人が止めた / When 戻って新しい写しが届く / Then 問いかけは出ない', () => {
    renderRoom(runningTrack(LONG_NOW));
    leaveReturnAndSync(12 * MIN, stoppedTrack(LONG_NOW + 12 * MIN));
    expect(screen.queryByText(/離れていました/)).toBeNull();
  });

  it('Given 離れている間に別の区切りへ切り替わった / When 戻って新しい写しが届く / Then 問いかけは出ない', () => {
    renderRoom(runningTrack(LONG_NOW));
    const switched = trackView({
      nowMs: LONG_NOW + 12 * MIN,
      rev: 9,
      segments: [seg('g-3', 'work', 'Build', 45 * MIN, LONG_NOW + 2 * MIN), seg('g-4', 'work', 'Test', LONG_NOW + 2 * MIN, null)],
    });
    leaveReturnAndSync(12 * MIN, switched);
    expect(screen.queryByText(/離れていました/)).toBeNull();
  });

  it('Given 問いかけが出ている / When 他の人が止めた写しが届く / Then 問いかけを下ろす', () => {
    renderRoom(runningTrack(LONG_NOW));
    leaveReturnAndSync(12 * MIN);
    deliver(stoppedTrack(LONG_NOW + 13 * MIN));
    expect(screen.queryByText(/離れていました/)).toBeNull();
  });

  it('Given 短く離れて問いかけが出なかった / When 後で長く使い続ける / Then 古い記録で問いかけを出さない', () => {
    renderRoom(runningTrack(LONG_NOW));
    leaveReturnAndSync(MIN, runningTrack(LONG_NOW + MIN));
    nowMs += 20 * MIN;
    deliver(runningTrack(LONG_NOW + 21 * MIN));
    expect(screen.queryByText(/離れていました/)).toBeNull();
  });

  it('Given 離れている間ミニ表示の窓が開いていた / When 戻って写しが届く / Then 問いかけを出さない', () => {
    renderRoom(runningTrack(LONG_NOW));
    Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: { window: {} } });
    leaveReturnAndSync(12 * MIN);
    expect(screen.queryByText(/離れていました/)).toBeNull();
  });

  it('Given 離れた間を休憩にする操作が全員の写しに届く / When 写しの undo が away / Then 取り消しの帯に文が出る', () => {
    renderRoom(runningTrack(LONG_NOW));
    deliver(runningTrack(LONG_NOW, { rev: 4, undo: { rev: 4, kind: 'away', remainingMs: 8000 } }));
    expect(screen.getByText(UNDO_NOTE_AWAY)).toBeInTheDocument();
    fireEvent.click(button(UNDO_BUTTON));
    expect(sentCommands().at(-1)).toEqual({ command: 'track.undo', rev: 4 });
  });

  it('Given 切断中 / When 問いかけが出る / Then 送る 2 つは押せず、残すは押せる', () => {
    renderRoom(runningTrack(LONG_NOW));
    leaveReturnAndSync(12 * MIN);
    act(() => latestSocket().drop());
    expect(button(AWAY_CUT_BUTTON)).toBeDisabled();
    expect(button(AWAY_BREAK_BUTTON)).toBeDisabled();
    expect(button(AWAY_KEEP_BUTTON)).toBeEnabled();
  });
});

/**
 * @requirements #476 FR-6・設計 §4 C6・C7
 */
describe('止め忘れの通知', () => {
  const LONG_NOW = 45 * MIN + LONG_RUNNING_NOTICE_MS;
  const created: { title: string; options: NotificationOptions | undefined }[] = [];
  let permission: NotificationPermission = 'default';
  let requested = 0;

  class FakeNotification {
    static get permission(): NotificationPermission {
      return permission;
    }
    static requestPermission(): Promise<NotificationPermission> {
      requested += 1;
      permission = nextAnswer;
      return Promise.resolve(permission);
    }
    constructor(title: string, options?: NotificationOptions) {
      created.push({ title, options });
    }
  }
  let nextAnswer: NotificationPermission = 'granted';

  beforeEach(() => {
    created.length = 0;
    permission = 'default';
    nextAnswer = 'granted';
    requested = 0;
    vi.stubGlobal('Notification', FakeNotification);
  });
  afterEach(() => {
    Reflect.deleteProperty(document, 'visibilityState');
  });

  /** 設定を入にして、裏に回し、知らせが出る境目を越える。 */
  async function enable(): Promise<void> {
    renderRoom(runningTrack(LONG_NOW - 1000));
    await act(async () => {
      fireEvent.click(button(NOTIFY_BUTTON));
      await Promise.resolve();
    });
  }

  it('Given 既定 / When 画面を描く / Then 切のまま、許可は求めない', () => {
    renderRoom(runningTrack(LONG_NOW - 1000));
    expect(button(NOTIFY_BUTTON)).toHaveAttribute('aria-pressed', 'false');
    expect(requested).toBe(0);
    setVisibility('hidden');
    deliver(runningTrack(LONG_NOW));
    expect(created).toEqual([]);
  });

  it('Given 通知する / When 押す / Then その時に許可を求め、入にして端末へ覚える', async () => {
    await enable();
    expect(requested).toBe(1);
    expect(button(NOTIFY_BUTTON)).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem(NOTIFY_PREFERENCE_KEY)).toBe('1');
  });

  it('Given 許可が拒まれた / When 押す / Then 入にならず、拒まれたことを知らせる', async () => {
    nextAnswer = 'denied';
    renderRoom(runningTrack(LONG_NOW - 1000));
    await act(async () => {
      fireEvent.click(button(NOTIFY_BUTTON));
      await Promise.resolve();
    });
    expect(button(NOTIFY_BUTTON)).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(NOTIFY_DENIED_TEXT)).toBeInTheDocument();
    expect(localStorage.getItem(NOTIFY_PREFERENCE_KEY)).toBeNull();
  });

  it('Given 入 / When ページが裏のまま知らせが出る / Then 1 回だけ通知し、文に作業名を出さない', async () => {
    await enable();
    setVisibility('hidden');
    deliver(runningTrack(LONG_NOW));
    expect(created).toHaveLength(1);
    expect(created[0]!.title).toBe(longRunningNotifyTitle(LONG_RUNNING_NOTICE_MS / MIN));
    expect(created[0]!.options?.body).toBe(LONG_RUNNING_NOTIFY_BODY);
    expect(JSON.stringify(created)).not.toContain('Build');
    // 同じ区切りの写しがもう一度届いても重ねない
    deliver(runningTrack(LONG_NOW + MIN));
    expect(created).toHaveLength(1);
  });

  it('Given 通知した区切り / When 止まって取り消しで同じ区切りの知らせが出直す / Then 重ねて通知しない（区切りの id で 1 回）', async () => {
    await enable();
    setVisibility('hidden');
    deliver(runningTrack(LONG_NOW));
    expect(created).toHaveLength(1);
    deliver(stoppedTrack(LONG_NOW + MIN));
    deliver(runningTrack(LONG_NOW + 2 * MIN));
    expect(created).toHaveLength(1);
  });

  it('Given 入 / When 別の区切りで次の知らせが出る / Then その区切りでもう 1 回通知する', async () => {
    await enable();
    setVisibility('hidden');
    deliver(runningTrack(LONG_NOW));
    const next = trackView({ nowMs: LONG_NOW + 100 * MIN, rev: 9, segments: [seg('g-9', 'work', 'Next', LONG_NOW, null)] });
    deliver(trackView({ ...next, segments: [seg('g-9', 'work', 'Next', LONG_NOW + MIN, null)], nowMs: LONG_NOW + 2 * MIN }));
    deliver(next);
    expect(created).toHaveLength(2);
  });

  it('Given 入 / When ページが前面のまま知らせが出る / Then 通知しない', async () => {
    await enable();
    deliver(runningTrack(LONG_NOW));
    expect(created).toEqual([]);
  });

  it('Given 切 / When ページが裏のまま知らせが出る / Then 通知しない', () => {
    permission = 'granted';
    renderRoom(runningTrack(LONG_NOW - 1000));
    setVisibility('hidden');
    deliver(runningTrack(LONG_NOW));
    expect(created).toEqual([]);
  });

  it('Given 通知に未対応のブラウザ / When 画面を描く / Then 設定のボタンを出さない', () => {
    vi.stubGlobal('Notification', undefined);
    Reflect.deleteProperty(globalThis, 'Notification');
    renderRoom(runningTrack(LONG_NOW - 1000));
    expect(screen.queryByRole('button', { name: NOTIFY_BUTTON })).toBeNull();
  });

  it('Given 入を覚えた端末 / When 画面を開き直す / Then 入のまま（許可が下りている間）', () => {
    permission = 'granted';
    localStorage.setItem(NOTIFY_PREFERENCE_KEY, '1');
    renderRoom(runningTrack(LONG_NOW - 1000));
    expect(button(NOTIFY_BUTTON)).toHaveAttribute('aria-pressed', 'true');
  });

  it('Given 入を覚えたが許可が取り消された / When 画面を開く / Then 切として読む', () => {
    permission = 'denied';
    localStorage.setItem(NOTIFY_PREFERENCE_KEY, '1');
    renderRoom(runningTrack(LONG_NOW - 1000));
    expect(button(NOTIFY_BUTTON)).toHaveAttribute('aria-pressed', 'false');
  });

  it('Given 画面を開いた時点で知らせが出ている / When 裏に回る / Then 通知しない（出る瞬間ではない）', () => {
    permission = 'granted';
    localStorage.setItem(NOTIFY_PREFERENCE_KEY, '1');
    renderRoom(runningTrack(LONG_NOW + MIN));
    setVisibility('hidden');
    deliver(runningTrack(LONG_NOW + 2 * MIN));
    expect(created).toEqual([]);
  });
});
