/**
 * 映す表示（#429 spec §7.5 判断 J13）。キーボードで Space ＝ 一時停止／再開・→ ＝ 次へ・Esc ＝ 抜ける。
 * 進行表・延長のボタンは落とし、盤・名前・残り・押し巻き・次・終了見込みを残す。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import { EXTEND_LABEL, NEXT_STEP_LABEL, PROJECTED_END_LABEL, PROJECT_BUTTON, PROJECT_EXIT_BUTTON, STEP_LIST_HEADING } from '../src/copy';
import { RESUME, ScriptedWebSocket, latestSocket, runningAgenda } from './support/scripted-web-socket';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

vi.mock('../src/platform/sound', () => ({
  installAudioUnlock: vi.fn(),
  unlockAudio: vi.fn(),
  playStrike: vi.fn(),
}));

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.spyOn(performance, 'now').mockReturnValue(50_000);
  localStorage.clear();
  window.history.replaceState(null, '', '/agenda/?room=R1');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function projecting(state: unknown = runningAgenda(1000)): void {
  saveResumeIdentity(RESUME);
  render(<App />);
  act(() => {
    latestSocket().open();
    latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
    latestSocket().deliver({ type: 'agenda', state });
  });
  fireEvent.click(screen.getByRole('button', { name: PROJECT_BUTTON }));
}

const deliverAgenda = (state: unknown): void => act(() => latestSocket().deliver({ type: 'agenda', state }));
const sentCommands = (name: string) => latestSocket().sentJson().filter((m) => m['command'] === name);
const press = (key: string): void => {
  fireEvent.keyDown(document.activeElement ?? document.body, { key });
};

/**
 * @requirements #429 spec §7.5
 */
describe('映す表示', () => {
  it('Given 映す表示に入った / When 画面を見る / Then 進行表と延長を落とし、次と終了見込みを残す', () => {
    projecting();
    expect(screen.queryByRole('region', { name: STEP_LIST_HEADING })).toBeNull();
    expect(screen.queryByRole('group', { name: EXTEND_LABEL })).toBeNull();
    expect(screen.getByText(NEXT_STEP_LABEL)).toBeInTheDocument();
    expect(screen.getByText(PROJECTED_END_LABEL)).toBeInTheDocument();
    // 次のステップの名前（Talk）が右の列に出る
    expect(screen.getByText('Talk')).toBeInTheDocument();
  });

  it('Given 映す表示・s-2 へ移った / When → を押す / Then いまの s-2 を載せた agenda.next を送る', () => {
    projecting();
    deliverAgenda({ ...runningAgenda(1000), currentId: 's-2' });
    press('ArrowRight');
    expect(sentCommands('agenda.next')).toEqual([{ command: 'agenda.next', stepId: 's-2' }]);
  });

  it('Given 映す表示・進行中 / When Space を押す / Then 一時停止を送り、一時停止中なら再開を送る', () => {
    projecting();
    press(' ');
    expect(sentCommands('agenda.pause')).toHaveLength(1);
    expect(sentCommands('agenda.resume')).toHaveLength(0);
    deliverAgenda({ ...runningAgenda(1000), phase: 'paused' });
    press(' ');
    expect(sentCommands('agenda.resume')).toHaveLength(1);
  });

  it('Given 映す表示 / When Esc を押す / Then 手元の表示に戻り、映す表示のボタンにフォーカスを返す', () => {
    projecting();
    press('Escape');
    expect(screen.getByRole('region', { name: STEP_LIST_HEADING })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: PROJECT_BUTTON })).toHaveFocus();
  });

  it('Given 映す表示 / When 「手元の表示に戻る」を押す / Then 手元の表示に戻る', () => {
    projecting();
    fireEvent.click(screen.getByRole('button', { name: PROJECT_EXIT_BUTTON }));
    expect(screen.getByRole('region', { name: STEP_LIST_HEADING })).toBeInTheDocument();
  });

  it('Given 映す表示 / When マウスを動かす / Then 操作帯を 3 秒だけ出す', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    projecting();
    const strip = document.querySelector('.projection-strip');
    expect(strip).not.toHaveClass('is-shown');
    fireEvent.mouseMove(document.querySelector('.projection')!);
    expect(strip).toHaveClass('is-shown');
    act(() => vi.advanceTimersByTime(2999));
    expect(strip).toHaveClass('is-shown');
    act(() => vi.advanceTimersByTime(1));
    expect(strip).not.toHaveClass('is-shown');
  });

  it('Given 手元の表示 / When → や Space を押す / Then 何も送らない（キーは映す表示の間だけ）', () => {
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => {
      latestSocket().open();
      latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
      latestSocket().deliver({ type: 'agenda', state: runningAgenda(1000) });
    });
    press('ArrowRight');
    press(' ');
    expect(sentCommands('agenda.next')).toHaveLength(0);
    expect(sentCommands('agenda.pause')).toHaveLength(0);
  });
});
