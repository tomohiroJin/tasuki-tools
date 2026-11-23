import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { LONG_RUNNING_NOTICE_MS, type TrackView } from '@tasuki/track-core';
import { outsideBase } from '@tasuki/test-css/font-base';
import { App } from '../src/App';
import { CLEAR_BUTTON, COPY_BUTTON, EDIT_BUTTON, INSERT_BUTTON, PAGE_HEADING } from '../src/copy';
import { EMPTY_TRACK, JOINED, MIN, RESUME, ROSTER_FRAME, ScriptedWebSocket, latestSocket, runningTrack, seg, stoppedTrack, trackFrame, trackView } from './support/track-states';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  window.history.replaceState(null, '', '/track/?room=R1');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 描いた画面の文字を 1 本にする（作業名は固定データで ASCII にしてあり、判定から外れる）。 */
function renderedText(): string {
  return document.body.textContent ?? '';
}

function renderWith(state: TrackView | null): void {
  saveResumeIdentity(RESUME);
  render(<App />);
  act(() => {
    latestSocket().open();
    if (state === null) return;
    latestSocket().deliver(JOINED);
    latestSocket().deliver(ROSTER_FRAME);
    latestSocket().deliver(trackFrame(state));
  });
}

/**
 * @requirements #476 設計 §5（文言は書体の base 層に収める）
 */
describe('描いたうちわけの文字は書体の常用の層に収まる', () => {
  it('対照: 検査は base 層に無い字を拾う（拾えない検査は常に緑になる）', () => {
    expect(outsideBase(['議論'])).not.toEqual([]);
  });

  it.each([
    ['参加の途中', null],
    ['始まる前', EMPTY_TRACK],
    ['計測中', runningTrack()],
    ['止まっている・取り消しあり', stoppedTrack(60 * MIN, { undo: { rev: 2, kind: 'stop', remainingMs: 9000 } })],
    ['名前なし・休憩を計測中', trackView({ nowMs: 20 * MIN, segments: [seg('g-1', 'work', '', 0, 10 * MIN), seg('g-2', 'break', '', 10 * MIN, null)] })],
    ['全員の切断で止まった', trackView({ nowMs: 60 * MIN, segments: [seg('g-1', 'work', 'Build', 0, 20 * MIN, true)], resumeOffer: true })],
    ['止め忘れの知らせ', runningTrack(45 * MIN + LONG_RUNNING_NOTICE_MS)],
  ])('Given %s / When 画面を描く / Then 外れる字は無く、描けている', (_label, state) => {
    renderWith(state);
    expect(outsideBase([renderedText()])).toEqual([]);
    // 空の画面なら何も外れない。描けていることも固定する
    expect(renderedText().length).toBeGreaterThan(5);
  });

  it('Given 止まっている / When 直す・抜けを足す・消す確かめ・コピーの失敗を開く / Then 開いた欄の字も外れない', async () => {
    renderWith(stoppedTrack());
    expect(renderedText()).toContain(PAGE_HEADING);
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(EDIT_BUTTON) })[0]!);
    fireEvent.click(screen.getByRole('button', { name: INSERT_BUTTON }));
    fireEvent.click(screen.getByRole('button', { name: CLEAR_BUTTON }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: COPY_BUTTON }));
    });
    // 開いた欄が実際に描かれている（開かずに緑にならない）
    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(3);
    expect(outsideBase([renderedText()])).toEqual([]);
  });
});
