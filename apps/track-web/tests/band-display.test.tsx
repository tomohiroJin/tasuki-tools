/**
 * 映す画面の入り方・帯の読み上げ・帯の色の安定（#476 第 2 段・D1・D4）。台本つきの偽の WebSocket で写しを届ける。
 */
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import type { TrackView } from '@tasuki/track-core';
import { App } from '../src/App';
import { DISPLAY_JOIN_LINK, DISPLAY_NEEDS_JOIN, TIMELINE_HEADING } from '../src/copy';
import { redirectTo } from '../src/router';
import { EMPTY_TRACK, JOINED, MIN, RESUME, ROSTER_FRAME, ScriptedWebSocket, latestSocket, runningTrack, seg, trackFrame, trackView } from './support/track-states';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  vi.spyOn(performance, 'now').mockReturnValue(50_000);
  localStorage.clear();
  window.history.replaceState(null, '', '/track/?room=R1&view=display');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderDisplay(state: TrackView | null) {
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

/**
 * @requirements #476 設計 §5 D1（名乗りのない端末では、映す画面から玄関へ自動で送らない）
 */
describe('映す画面の入り方', () => {
  it('Given この端末に復帰の組が無い / When 映す画面を開く / Then 玄関へ自動で送らず、先にルームに入るよう案内し、玄関のそのルームへのリンクを出す', () => {
    render(<App />);
    expect(redirectTo).not.toHaveBeenCalled();
    expect(screen.getByText(DISPLAY_NEEDS_JOIN)).toBeTruthy();
    expect(screen.getByRole('link', { name: DISPLAY_JOIN_LINK }).getAttribute('href')).toBe('/?room=R1');
    expect(ScriptedWebSocket.instances).toHaveLength(0);
  });
});

/**
 * @requirements #476 設計 §5 D4（読み上げ向けの要約・帯の色の安定）
 */
describe('映す画面の時系列', () => {
  it('Given 区切りがある / When 映す画面を描く / Then 帯の区画に、時刻と区切りの数の要約を読み上げ向けに持つ', () => {
    renderDisplay(runningTrack());
    const region = screen.getByRole('region', { name: TIMELINE_HEADING });
    expect(region.textContent).toContain('作業 2 件、休憩 1 件。');
  });

  it('Given 区切りが無い / When 映す画面を描く / Then 時系列の区画ごと出さない', () => {
    renderDisplay(EMPTY_TRACK);
    expect(screen.queryByRole('region', { name: TIMELINE_HEADING })).toBeNull();
  });
});

describe('帯の色', () => {
  /** A（10 分 45 秒）の後に B を計測中。B の長さが A を超えるのは 21 分 30 秒 */
  const withNow = (nowMs: number): TrackView =>
    trackView({ nowMs, segments: [seg('g-1', 'work', 'A', 0, 10 * MIN + 45_000), seg('g-2', 'work', 'B', 10 * MIN + 45_000, null)] });

  const toneOfFirst = (container: HTMLElement): string | undefined =>
    Array.from(container.querySelector('.track-band-part')!.classList).find((c) => c.startsWith('track-tone--'));

  it('Given 1 分の中で合計の並びが入れ替わる / When 写しを受ける / Then 帯の色の番号は 1 分の間は変わらない', () => {
    const { container } = renderDisplay(withNow(21 * MIN + 10_000));
    const before = toneOfFirst(container);
    act(() => latestSocket().deliver(trackFrame({ ...withNow(21 * MIN + 50_000), rev: 9 })));
    expect(toneOfFirst(container)).toBe(before);
    expect(before).toBe('track-tone--0');
  });
});
