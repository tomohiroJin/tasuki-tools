/**
 * 映す表示（#429 spec §7.5 判断 J13）。キーボードで Space ＝ 一時停止／再開・→ ＝ 次へ・Esc ＝ 抜ける。
 * 進行表・延長のボタンは落とし、盤・名前・残り・押し巻き・次・終了見込みを残す。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ROOM_HEADER_TEXT } from '@tasuki/invite-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import { EXTEND_LABEL, NEXT_BUTTON, NEXT_STEP_LABEL, PROJECTED_END_LABEL, PROJECT_BUTTON, PROJECT_EXIT_BUTTON, STEP_LIST_HEADING } from '../src/copy';
import { Driver } from './support/agenda-states';
import { IDLE_AGENDA, RESUME, ScriptedWebSocket, latestSocket, runningAgenda } from './support/scripted-web-socket';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

vi.mock('../src/platform/sound', () => ({
  installAudioUnlock: vi.fn(),
  unlockAudio: vi.fn(),
  playStrike: vi.fn(),
  isAudioUnlocked: () => false,
  subscribeAudioState: () => () => undefined,
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
const press = (key: string, init: Partial<KeyboardEventInit> = {}): void => {
  fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init });
};

/**
 * @requirements #429 spec §7.5
 */
describe('映す表示', () => {
  it('Given 映す表示の途中で切断された / When 画面を見る / Then 接続の告知の帯は映す表示の中にあり、外には無い', () => {
    projecting();
    act(() => latestSocket().drop());
    const banner = screen.getByRole('status');
    expect(banner).toHaveClass('ui-banner');
    const projection = document.querySelector('.projection');
    expect(projection).not.toBeNull();
    expect(projection!.contains(banner)).toBe(true);
    // 外に二重に出さない
    expect(document.querySelectorAll('.ui-banner')).toHaveLength(1);
    // 映す表示は「上端の枠（帯）」「音の切り替えの隅」「残りの領域（盤・横の情報）」の順。
    // 隅は上端の枠（sticky）の外（中に置くとスクロールしても上に留まり、盤の上に乗った）
    const top = banner.parentElement!;
    expect(top).toHaveClass('projection-top');
    expect(top.firstElementChild).toBe(banner);
    expect(top.querySelector('.projection-corner')).toBeNull();
    expect(projection!.children[0]).toBe(top);
    expect(projection!.children[1]).toHaveClass('projection-corner');
    expect(projection!.children[2]).toHaveClass('projection-body');
    expect(projection!.children[2]!.querySelector('.projection-dial')).not.toBeNull();
    // 上端の枠の中に盤は無い（重ならない構造）
    expect(top.querySelector('.projection-dial')).toBeNull();
  });

  it('Given 映す表示で接続が生きている / When 画面を見る / Then 帯は無く、音の切り替えの隅は映す表示の中にある', () => {
    projecting();
    expect(document.querySelector('.ui-banner')).toBeNull();
    expect(document.querySelector('.projection .projection-corner')).not.toBeNull();
  });

  it('Given 回数 2 以上の進行中 / When 映す表示を見る / Then 盤の中央に「n / N 回」が出る', () => {
    const d = new Driver([1, 1], 'LT', 'wait', 6).next(60_000).next(120_000);
    projecting(d.view(120_000 + 1000));
    expect(document.querySelector('.dial--stage .dial-tag')?.textContent).toBe('2 / 6 回');
  });

  it('Given 回数 1 の進行中 / When 映す表示を見る / Then 回の札は出ない', () => {
    projecting();
    expect(document.querySelector('.dial--stage .dial-tag')).toBeNull();
  });

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

  it('Given 映す表示 / When 操作帯の「次へ」を押してから Space を押す / Then フォーカスは表示の根に戻り、Space は一時停止になる（次へを二度送らない）', () => {
    projecting();
    const nextButton = screen.getByRole('button', { name: NEXT_BUTTON });
    nextButton.focus();
    fireEvent.click(nextButton);
    expect(document.activeElement).toBe(document.querySelector('.projection'));
    // 押せる部品にフォーカスが残っていても、Space は一時停止／再開として扱う
    nextButton.focus();
    press(' ');
    expect(sentCommands('agenda.next')).toHaveLength(1);
    expect(sentCommands('agenda.pause')).toHaveLength(1);
  });

  it.each([['altKey'], ['ctrlKey'], ['metaKey']])('Given 映す表示 / When %s と一緒に → や Space を押す / Then 何も送らない', (mod) => {
    projecting();
    press('ArrowRight', { [mod]: true });
    press(' ', { [mod]: true });
    expect(sentCommands('agenda.next')).toHaveLength(0);
    expect(sentCommands('agenda.pause')).toHaveLength(0);
  });

  it('Given 映す表示 / When 描く / Then 共通の見出し（ルームコード・招待・戻る）を描かない', () => {
    projecting();
    expect(document.querySelector('.ui-room-header')).toBeNull();
    expect(screen.queryByRole('link', { name: ROOM_HEADER_TEXT.back })).toBeNull();
  });

  it('Given 映す表示 / When 裏の画面を見る / Then 見出しと「選択画面へ戻る」を描かず、押せるのは映す表示の中の部品だけ。Esc で戻ると両方が戻り、フォーカスは「映す表示」へ', () => {
    projecting();
    expect(screen.queryByRole('link', { name: ROOM_HEADER_TEXT.back })).toBeNull();
    const projection = document.querySelector('.projection')!;
    const focusable = [...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')];
    expect(focusable.filter((el) => !projection.contains(el))).toEqual([]);
    press('Escape');
    expect(screen.getByRole('link', { name: ROOM_HEADER_TEXT.back })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: PROJECT_BUTTON })).toHaveFocus();
  });

  it('Given 映す表示 / When 誰かが「最初から」で開始前に戻す / Then 映す表示を抜けて組む画面を出す', () => {
    projecting();
    deliverAgenda({ ...IDLE_AGENDA, title: 'Retro', steps: runningAgenda().steps });
    expect(document.querySelector('.projection')).toBeNull();
    expect(screen.getByRole('link', { name: ROOM_HEADER_TEXT.back })).toBeInTheDocument();
  });
});
