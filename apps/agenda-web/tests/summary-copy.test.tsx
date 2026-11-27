/**
 * 終了の一覧の Markdown コピー（#676）。終わった後だけ操作が出て、失敗したら同じ文を手で選べる欄に出す。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import {
  SUMMARY_COPY_BUTTON,
  SUMMARY_COPY_DONE,
  SUMMARY_COPY_FAILED,
  SUMMARY_COPY_MANUAL_FIELD,
} from '../src/copy';
import { summaryMarkdown } from '../src/summary-markdown';
import { Driver } from './support/agenda-states';
import { RESUME, ScriptedWebSocket, latestSocket } from './support/scripted-web-socket';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

vi.mock('../src/platform/sound', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/platform/sound')>()),
  preloadChime: vi.fn(),
  installAudioUnlock: vi.fn(),
  unlockAudio: vi.fn(),
  playChime: vi.fn(),
  isAudioUnlocked: () => false,
  subscribeAudioState: () => () => undefined,
}));

/** 書き出す日時を固定する（日付だけ偽にして、タイマーは本物のまま） */
const NOW = Date.UTC(2026, 10, 23, 5, 5, 30);

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  localStorage.clear();
  window.history.replaceState(null, '', '/agenda/?room=R1');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function joinedRoom(state: unknown): void {
  saveResumeIdentity(RESUME);
  render(<App />);
  act(() => {
    latestSocket().open();
    latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
    latestSocket().deliver({ type: 'agenda', state });
  });
}

const finished = () => new Driver([1, 2], '朝会').next(90_000).next(250_000).view(250_000);
const expected = () => summaryMarkdown(finished(), { wallMs: NOW, tzOffsetMin: -new Date(NOW).getTimezoneOffset() });

/**
 * @requirements #676
 */
describe('終了の一覧の Markdown コピー', () => {
  it('Given 会が終わる前 / When 画面を見る / Then コピーの操作は出ない', () => {
    joinedRoom(new Driver([1, 2], '朝会').view(30_000));
    expect(screen.queryByRole('button', { name: SUMMARY_COPY_BUTTON })).toBeNull();
  });

  it('Given 終了した / When Markdown でコピーを押す / Then 終了の一覧の Markdown を書き込み、できたと伝える', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    joinedRoom(finished());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: SUMMARY_COPY_BUTTON }));
    });
    expect(writeText).toHaveBeenCalledWith(expected());
    expect(writeText.mock.calls[0]![0]).toContain('## 進行タイマー（');
    expect(screen.getByRole('status')).toHaveTextContent(SUMMARY_COPY_DONE);
    expect(screen.queryByRole('textbox', { name: SUMMARY_COPY_MANUAL_FIELD })).toBeNull();
  });

  it('Given クリップボードへ書けない / When コピーを押す / Then 失敗を伝え、同じ文を手で選べる欄に出す', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    // 従来のコピー（execCommand）も使えない
    document.execCommand = () => false;
    joinedRoom(finished());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: SUMMARY_COPY_BUTTON }));
    });
    expect(screen.getByRole('status')).toHaveTextContent(SUMMARY_COPY_FAILED);
    expect(screen.getByRole('status')).not.toHaveTextContent(SUMMARY_COPY_DONE);
    const manual = screen.getByRole('textbox', { name: SUMMARY_COPY_MANUAL_FIELD });
    expect(manual).toHaveValue(expected());
    expect(manual).toHaveAttribute('readonly');
  });

  it('Given 失敗して欄が出た / When 続けてコピーが成功する / Then 欄が閉じ、2 秒たって元に戻っても出ない', async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: NOW });
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    document.execCommand = () => false;
    joinedRoom(finished());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: SUMMARY_COPY_BUTTON }));
    });
    expect(screen.getByRole('textbox', { name: SUMMARY_COPY_MANUAL_FIELD })).toBeInTheDocument();
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: SUMMARY_COPY_BUTTON }));
    });
    expect(screen.getByRole('status')).toHaveTextContent(SUMMARY_COPY_DONE);
    expect(screen.queryByRole('textbox', { name: SUMMARY_COPY_MANUAL_FIELD })).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.queryByRole('textbox', { name: SUMMARY_COPY_MANUAL_FIELD })).toBeNull();
  });
});

