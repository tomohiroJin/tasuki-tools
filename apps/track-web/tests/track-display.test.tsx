/**
 * 映す画面・時系列の帯・ミニ表示（#476 第 2 段・設計 §5 D1〜D5）。台本つきの偽の WebSocket で写しを届ける。
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import type { TrackView } from '@tasuki/track-core';
import { App } from '../src/App';
import { BACK_FIELD, BREAK_BUTTON, DISPLAY_LINK, MINI_OFFLINE, MINI_CLOSE_BUTTON, MINI_OPEN_BUTTON, MINI_RESUME_BUTTON, NOW_IDLE, STOP_BUTTON, TIMELINE_HEADING, TOTALS_HEADING } from '../src/copy';
import * as miniPlatform from '../src/platform/mini-window';
import { EMPTY_TRACK, JOINED, MIN, RESUME, ROSTER_FRAME, ScriptedWebSocket, latestSocket, runningTrack, seg, stoppedTrack, trackFrame, trackView } from './support/track-states';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

vi.mock('../src/platform/mini-window', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/platform/mini-window')>()),
  isMiniWindowSupported: vi.fn(),
  requestMiniWindow: vi.fn(),
}));

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  vi.spyOn(performance, 'now').mockReturnValue(50_000);
  localStorage.clear();
  vi.mocked(miniPlatform.isMiniWindowSupported).mockReturnValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderAt(search: string, state: TrackView | null = EMPTY_TRACK) {
  window.history.replaceState(null, '', `/track/${search}`);
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

const sentCommands = (): Record<string, unknown>[] => latestSocket().sentJson().slice(1);

/**
 * @requirements #476 設計 §5 D4・D5（時系列の帯）
 */
describe('時系列の帯', () => {
  it('Given 計測中の記録 / When ルームの画面を描く / Then 作業・休憩の部分を並べ、休憩は縞の印、帯は飾り（aria-hidden）', () => {
    const { container } = renderAt('?room=R1', runningTrack());
    const wrap = container.querySelector('.track-band-wrap')!;
    expect(wrap.getAttribute('aria-hidden')).toBe('true');
    const parts = Array.from(wrap.querySelectorAll('.track-band-part'));
    expect(parts).toHaveLength(3);
    expect(parts.map((p) => p.classList.contains('track-band-part--break'))).toEqual([false, true, false]);
    // 部分の幅は長さの重み
    expect(parts.map((p) => (p as HTMLElement).style.getPropertyValue('--share'))).toEqual([String(30 * MIN), String(15 * MIN), String(15 * MIN)]);
  });

  it('Given 区切りの間に隙間 / When 描く / Then 隙間は空きとして間に置く', () => {
    const { container } = renderAt('?room=R1', trackView({ nowMs: 40 * MIN, segments: [seg('g-1', 'work', 'A', 0, 10 * MIN), seg('g-2', 'work', 'B', 20 * MIN, 30 * MIN)] }));
    const parts = Array.from(container.querySelectorAll('.track-band-part'));
    expect(parts.map((p) => p.classList.contains('track-band-part--gap'))).toEqual([false, true, false]);
  });

  it('Given 同じ作業名が離れて 2 回 / When 描く / Then 同じ作業名は同じ色の番号', () => {
    const { container } = renderAt(
      '?room=R1',
      trackView({ nowMs: 50 * MIN, segments: [seg('g-1', 'work', 'A', 0, 10 * MIN), seg('g-2', 'work', 'B', 10 * MIN, 15 * MIN), seg('g-3', 'work', 'A', 15 * MIN, 30 * MIN)] }),
    );
    const tones = Array.from(container.querySelectorAll('.track-band-part')).map((p) => Array.from(p.classList).find((c) => c.startsWith('track-tone--')));
    expect(tones[0]).toBeDefined();
    expect(tones[0]).toBe(tones[2]);
    expect(tones[0]).not.toBe(tones[1]);
  });

  it('Given 区切りが無い / When 描く / Then 帯を出さない', () => {
    const { container } = renderAt('?room=R1', EMPTY_TRACK);
    expect(container.querySelector('.track-band-wrap')).toBeNull();
  });

  it('Given 計測中 / When 1 分の中で秒が進む / Then 帯の幅は変わらず、1 分たつと変わる', () => {
    let now = 50_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const { container } = renderAt('?room=R1', runningTrack(60 * MIN));
    const shares = () => Array.from(container.querySelectorAll('.track-band-part')).map((p) => (p as HTMLElement).style.getPropertyValue('--share'));
    const before = shares();
    now += 30_000;
    act(() => latestSocket().deliver(trackFrame(runningTrack(60 * MIN + 30_000, { rev: 4 }))));
    expect(shares()).toEqual(before);
    now += 31_000;
    act(() => latestSocket().deliver(trackFrame(runningTrack(61 * MIN + 1_000, { rev: 5 }))));
    expect(shares()).not.toEqual(before);
  });
});

/**
 * @requirements #476 設計 §5 D1・D2（映す画面）
 */
describe('映す画面', () => {
  it('Given ルームの画面 / When 見せ方を見る / Then 「映す画面を開く」は新しいタブで view=display を開く', () => {
    renderAt('?room=R1', stoppedTrack());
    const link = screen.getByRole('link', { name: DISPLAY_LINK });
    expect(link.getAttribute('href')).toBe('/track/?room=R1&view=display');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('Given 計測中 / When 映す画面を開く / Then いまの作業名・経過・合計の表・時系列の帯を出す', () => {
    const { container } = renderAt('?room=R1&view=display', runningTrack());
    expect(screen.getByText('Build', { selector: '.track-display-name' })).toBeTruthy();
    expect(container.querySelector('.track-display-elapsed')?.textContent).toContain('0:15:00');
    expect(screen.getByRole('heading', { name: TOTALS_HEADING })).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByRole('heading', { name: TIMELINE_HEADING })).toBeTruthy();
    expect(container.querySelectorAll('.track-band-part')).toHaveLength(3);
  });

  it('Given 止まっている / When 映す画面を開く / Then 計測していないと出す', () => {
    renderAt('?room=R1&view=display', stoppedTrack());
    expect(screen.getByText(NOW_IDLE)).toBeTruthy();
  });

  it('Given 映す画面 / When 描く / Then 押せる部品（ボタン・リンク・入力）が 1 つも無い', () => {
    const { container } = renderAt('?room=R1&view=display', runningTrack());
    expect(container.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: STOP_BUTTON })).toBeNull();
  });

  it('Given 映す画面 / When 入って写しを受ける・表に戻る / Then 送るのは track.sync だけ', () => {
    renderAt('?room=R1&view=display', runningTrack());
    const visible = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    visible.mockRestore();
    const commands = sentCommands().map((m) => m.command);
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.every((c) => c === 'track.sync')).toBe(true);
  });

  it('Given 映す画面 / When S・C・数字キーを押す / Then 何も送らない', () => {
    renderAt('?room=R1&view=display', runningTrack());
    for (const key of ['s', 'c', '1']) fireEvent.keyDown(document, { key });
    expect(sentCommands()).toEqual([]);
  });
});

/** 偽のミニ表示の窓。`close()` は `pagehide` を起こす。 */
function fakeMini() {
  const events = new EventTarget();
  const doc = document.implementation.createHTMLDocument('mini');
  const win = {
    document: doc,
    close: vi.fn(() => events.dispatchEvent(new Event('pagehide'))),
    focus: vi.fn(),
    addEventListener: (type: string, fn: EventListener, opts?: AddEventListenerOptions) => events.addEventListener(type, fn, opts),
    removeEventListener: (type: string, fn: EventListener) => events.removeEventListener(type, fn),
  };
  // 窓の文書でも testing-library が使えるよう、`defaultView` は jsdom の window を指す
  Object.defineProperty(doc, 'defaultView', { value: window });
  return { win, doc };
}

/**
 * @requirements #476 設計 §5 D3（ミニ表示）
 */
describe('ミニ表示', () => {
  it('Given 非対応のブラウザ / When ルームの画面を描く / Then 「ミニ表示で出す」を出さない（代わりの道も無い）', () => {
    renderAt('?room=R1', runningTrack());
    expect(screen.queryByRole('button', { name: MINI_OPEN_BUTTON })).toBeNull();
    expect(screen.getByRole('link', { name: DISPLAY_LINK })).toBeTruthy();
  });

  async function openMini(state: TrackView, afterRender?: () => void) {
    vi.mocked(miniPlatform.isMiniWindowSupported).mockReturnValue(true);
    const mini = fakeMini();
    vi.mocked(miniPlatform.requestMiniWindow).mockResolvedValue(mini.win as unknown as Window);
    const utils = renderAt('?room=R1', state);
    afterRender?.();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: MINI_OPEN_BUTTON }));
    });
    return { ...utils, ...mini, panel: within(mini.doc.body) };
  }

  it('Given 対応・計測中 / When 開く / Then 窓の中に作業名と経過と 3 つの操作を描く', async () => {
    const { panel } = await openMini(runningTrack());
    expect(panel.getByText('Build')).toBeTruthy();
    expect(panel.getByText('0:15:00')).toBeTruthy();
    expect(panel.getByRole('button', { name: STOP_BUTTON })).toBeTruthy();
    expect(panel.getByRole('button', { name: BREAK_BUTTON })).toBeTruthy();
    expect(panel.getByRole('button', { name: MINI_RESUME_BUTTON })).toBeTruthy();
    // 開いたらボタンは「閉じる」に変わる
    expect(screen.getByRole('button', { name: MINI_CLOSE_BUTTON })).toBeTruthy();
  });

  it('Given 窓の［止める］ / When 押す / Then track.stop を送る', async () => {
    const { panel } = await openMini(runningTrack());
    fireEvent.click(panel.getByRole('button', { name: STOP_BUTTON }));
    expect(sentCommands()).toEqual([{ command: 'track.stop' }]);
  });

  it('Given 窓の［休憩にする］ / When 押す / Then 休憩の開始を送る', async () => {
    const { panel } = await openMini(runningTrack());
    fireEvent.click(panel.getByRole('button', { name: BREAK_BUTTON }));
    expect(sentCommands()).toEqual([{ command: 'track.start', label: '', kind: 'break' }]);
  });

  it('Given 窓の［直前を再開］ / When 押す / Then 直前の作業名で開始を送る（C キーと同じ）', async () => {
    const { panel } = await openMini(runningTrack());
    fireEvent.click(panel.getByRole('button', { name: MINI_RESUME_BUTTON }));
    expect(sentCommands()).toEqual([{ command: 'track.start', label: 'Review', kind: 'work' }]);
  });

  it('Given 止まっている / When 窓を開く / Then 止める・休憩にするは押せず、計測していないと出す', async () => {
    const { panel } = await openMini(stoppedTrack());
    expect(panel.getByText(NOW_IDLE)).toBeTruthy();
    expect((panel.getByRole('button', { name: STOP_BUTTON }) as HTMLButtonElement).disabled).toBe(true);
    expect((panel.getByRole('button', { name: BREAK_BUTTON }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Given 休憩を計測中 / When 窓を開く / Then 休憩にするは押せない（本体と同じ）', async () => {
    const { panel } = await openMini(trackView({ nowMs: 20 * MIN, segments: [seg('g-1', 'work', 'A', 0, 10 * MIN), seg('g-2', 'break', '', 10 * MIN, null)] }));
    expect((panel.getByRole('button', { name: BREAK_BUTTON }) as HTMLButtonElement).disabled).toBe(true);
    expect((panel.getByRole('button', { name: STOP_BUTTON }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('Given 利用者が窓を閉じた / When pagehide / Then 窓の中の描画を外し、ボタンは「出す」に戻る', async () => {
    const { win, panel } = await openMini(runningTrack());
    act(() => {
      win.close();
    });
    expect(panel.queryByRole('button', { name: STOP_BUTTON })).toBeNull();
    expect(screen.getByRole('button', { name: MINI_OPEN_BUTTON })).toBeTruthy();
  });

  it('Given 開いている / When ルームの画面を外す / Then 窓を閉じる', async () => {
    const { win, unmount } = await openMini(runningTrack());
    unmount();
    expect(win.close).toHaveBeenCalled();
  });

  it('Given 窓の中 / When S・C キーを押す / Then 本体と同じく止める・直前を再開を送り、変換中のキーは拾わない', async () => {
    const { doc } = await openMini(runningTrack());
    fireEvent.keyDown(doc, { key: 's', isComposing: true });
    expect(sentCommands()).toEqual([]);
    fireEvent.keyDown(doc, { key: 's' });
    fireEvent.keyDown(doc, { key: 'c' });
    expect(sentCommands()).toEqual([
      { command: 'track.stop' },
      { command: 'track.start', label: 'Review', kind: 'work' },
    ]);
  });

  it('Given 「5 分前から」を選んだ / When 窓の［止める］を押す / Then 本体と同じく backMin を載せ、使ったら「いまから」へ戻る', async () => {
    const { panel } = await openMini(runningTrack());
    const back = screen.getByRole('combobox', { name: BACK_FIELD });
    fireEvent.change(back, { target: { value: '5' } });
    fireEvent.click(panel.getByRole('button', { name: STOP_BUTTON }));
    fireEvent.click(panel.getByRole('button', { name: STOP_BUTTON }));
    expect(sentCommands()).toEqual([{ command: 'track.stop', backMin: 5 }, { command: 'track.stop' }]);
    expect(back).toHaveValue('0');
  });

  it('Given 「5 分前から」を選んだ / When 窓の［休憩にする］を押す / Then backMin を載せる', async () => {
    const { panel } = await openMini(runningTrack());
    fireEvent.change(screen.getByRole('combobox', { name: BACK_FIELD }), { target: { value: '5' } });
    fireEvent.click(panel.getByRole('button', { name: BREAK_BUTTON }));
    expect(sentCommands()).toEqual([{ command: 'track.start', label: '', kind: 'break', backMin: 5 }]);
  });

  it('Given 接続が切れた / When 窓を見る / Then 切断中と示し、3 つのボタンは押せない', async () => {
    const { panel } = await openMini(runningTrack());
    expect(panel.queryByText(MINI_OFFLINE)).toBeNull();
    act(() => latestSocket().drop());
    expect(panel.getByText(MINI_OFFLINE)).toBeTruthy();
    for (const name of [STOP_BUTTON, BREAK_BUTTON, MINI_RESUME_BUTTON]) {
      expect((panel.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('Given ミニ表示のボタン / When 見る / Then 押した状態（aria-pressed）は持たず、文言だけが切り替わる', async () => {
    await openMini(runningTrack());
    expect(screen.getByRole('button', { name: MINI_CLOSE_BUTTON }).hasAttribute('aria-pressed')).toBe(false);
  });

  it('Given 計測中 / When 秒の境目が来る / Then 窓の経過がその境目で進む（固定の間隔ではない）', async () => {
    // 本体の時計（`useTrackClock` の requestAnimationFrame・setInterval）は**一切動かさない**。動くと、本体の描き直しにつられて
    // 窓の経過も進み、窓自身のタイマーが壊れていても通る（負荷の高い CI で本物の時間で走り、変異 3204 が見逃された。
    // 偽の時計にすると advanceTimersByTime で確実に走ってしまう）。窓の描き直しのきっかけを setTimeout だけにする
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    vi.spyOn(window, 'setInterval').mockImplementation((() => 0) as unknown as typeof window.setInterval);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      let now = 50_000;
      vi.spyOn(performance, 'now').mockImplementation(() => now);
      // 写しを受けてから 0.9 秒たった時点で窓を開く（次の秒の境目まで 0.1 秒）
      const { panel } = await openMini(runningTrack(), () => {
        now = 50_900;
      });
      expect(panel.getByText('0:15:00')).toBeTruthy();
      now = 51_050;
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(panel.getByText('0:15:01')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
