/**
 * 進める画面（#429 spec §4.3〜§4.7・§7.5・§7.7）。**画面はルームを通して描く**（同期フックの差し込みと
 * フレームの受け取りを実際の経路で通すため）。送った中身は `ScriptedWebSocket` が覚えている。
 *
 * 手元の時計は止めておく（`requestAnimationFrame` は予約だけ受けて呼ばない・`performance.now()` は固定）。
 * 盤の値は届いたフレームの値そのものになり、局面をフレームで作れる。
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import {
  EXTEND_LABEL,
  NEXT_BUTTON,
  PAUSE_BUTTON,
  RESET_BUTTON,
  RESET_CONFIRM_NO,
  RESET_CONFIRM_TEXT,
  RESET_CONFIRM_YES,
  RESUME_BUTTON,
  SOUND_OFF,
  SOUND_ON,
  STEP_LIST_HEADING,
  extendButton,
  extensionNote,
  skipStepLabel,
  unskipStepLabel,
} from '../src/copy';
import { playStrike, unlockAudio } from '../src/platform/sound';
import { SOUND_SETTING_KEY } from '../src/hooks/use-sound-setting';
import { Driver } from './support/agenda-states';
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
  // 手元の時計を止める（描き直しの予約は受けるが呼ばない）
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.spyOn(performance, 'now').mockReturnValue(50_000);
  localStorage.clear();
  window.history.replaceState(null, '', '/agenda/?room=R1');
  vi.mocked(playStrike).mockClear();
  vi.mocked(unlockAudio).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function join(): void {
  act(() => {
    latestSocket().open();
    latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
  });
}

/** 入室して、最初の `agenda` フレームを受けた画面 */
function joinedRoom(state: unknown): void {
  saveResumeIdentity(RESUME);
  render(<App />);
  join();
  deliverAgenda(state);
}

const deliverAgenda = (state: unknown): void => act(() => latestSocket().deliver({ type: 'agenda', state }));

const sentCommands = (name: string) => latestSocket().sentJson().filter((m) => m['command'] === name);

/** 2 ステップ目（S2）が進行中の状態。S1 は済み・S3 はまだ */
const secondStepRunning = () => new Driver([1, 2, 3]).next(60_000).view(61_000);

/**
 * @requirements #429 spec §4.3・§4.5・§4.6・§7.5
 */
describe('進める画面の操作', () => {
  it('Given s-1 から s-2 へ移ったフレームを受けた / When 「次へ」を押す / Then いまの s-2 を載せた agenda.next を送る', () => {
    // Given
    joinedRoom(runningAgenda(1000));
    deliverAgenda({ ...runningAgenda(1000), currentId: 's-2' });
    // When
    fireEvent.click(screen.getByRole('button', { name: NEXT_BUTTON }));
    // Then: 前に描いた s-1 ではなく、押した瞬間のいまの ID
    expect(sentCommands('agenda.next')).toEqual([{ command: 'agenda.next', stepId: 's-2' }]);
  });

  it('Given 進行中 / When 「このステップに」の +3 分を押す / Then いまの ID と minutes: 3 の agenda.extend を送る', () => {
    joinedRoom(runningAgenda(1000));
    const group = screen.getByRole('group', { name: EXTEND_LABEL });
    fireEvent.click(within(group).getByRole('button', { name: extendButton(3) }));
    expect(sentCommands('agenda.extend')).toEqual([{ command: 'agenda.extend', stepId: 's-1', minutes: 3 }]);
  });

  it('Given 進行中・一時停止中 / When 一時停止・再開を押す / Then それぞれの命令を送る', () => {
    joinedRoom(runningAgenda(1000));
    fireEvent.click(screen.getByRole('button', { name: PAUSE_BUTTON }));
    expect(sentCommands('agenda.pause')).toHaveLength(1);
    deliverAgenda({ ...runningAgenda(1000), phase: 'paused' });
    expect(screen.queryByRole('button', { name: PAUSE_BUTTON })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: RESUME_BUTTON }));
    expect(sentCommands('agenda.resume')).toHaveLength(1);
  });

  it('Given 2 ステップ目が進行中 / When 進行表を見る / Then 「スキップ」はまだのステップの行にだけある', () => {
    joinedRoom(secondStepRunning());
    const list = screen.getByRole('region', { name: STEP_LIST_HEADING });
    expect(within(list).queryByRole('button', { name: skipStepLabel(1) })).toBeNull();
    expect(within(list).queryByRole('button', { name: skipStepLabel(2) })).toBeNull();
    fireEvent.click(within(list).getByRole('button', { name: skipStepLabel(3) }));
    expect(sentCommands('agenda.skip')).toEqual([{ command: 'agenda.skip', stepId: 's-3', skipped: true }]);
    // 主の操作の帯には「スキップ」を置かない
    expect(screen.getAllByRole('button', { name: /スキップ/ })).toHaveLength(1);
  });

  it('Given まだのステップを飛ばした / When 進行表を見る / Then その行に「戻す」があり、押すと skipped: false を送る', () => {
    const d = new Driver([1, 2, 3]).skip('s-3');
    joinedRoom(d.view(1000));
    fireEvent.click(screen.getByRole('button', { name: unskipStepLabel(3) }));
    expect(sentCommands('agenda.skip')).toEqual([{ command: 'agenda.skip', stepId: 's-3', skipped: false }]);
  });

  it('Given 進行中 / When 「最初から」を押す / Then 確認を挟み、やめれば送らず、やり直せば agenda.reset を送る', () => {
    joinedRoom(runningAgenda(1000));
    fireEvent.click(screen.getByRole('button', { name: RESET_BUTTON }));
    expect(screen.getByText(RESET_CONFIRM_TEXT)).toBeInTheDocument();
    expect(sentCommands('agenda.reset')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: RESET_CONFIRM_NO }));
    expect(screen.queryByText(RESET_CONFIRM_TEXT)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: RESET_BUTTON }));
    fireEvent.click(screen.getByRole('button', { name: RESET_CONFIRM_YES }));
    expect(sentCommands('agenda.reset')).toHaveLength(1);
  });

  it('Given いまのステップを 3 分延長した / When 盤の下を見る / Then 「予定 1 分 + 3 分」と添える', () => {
    joinedRoom(new Driver([1, 2]).extend(3, 500).view(1000));
    expect(screen.getByText(extensionNote(1, 3))).toBeInTheDocument();
  });

  it('Given 切断された / When 画面を見る / Then 主の操作は押せない（入り直しより先に届いて弾かれる）', () => {
    joinedRoom(runningAgenda(1000));
    act(() => latestSocket().drop());
    expect(screen.getByRole('button', { name: NEXT_BUTTON })).toBeDisabled();
  });
});

/**
 * @requirements #429 spec §4.7・§7.4
 */
describe('時間切れの合図と音', () => {
  const soundOn = (): void => localStorage.setItem(SOUND_SETTING_KEY, 'on');

  it('Given 既定 / When 画面を見る / Then 「音なし」で、押すと解錠して「音あり」を端末に覚える', () => {
    joinedRoom(runningAgenda(1000));
    const toggle = screen.getByRole('button', { name: SOUND_OFF });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(unlockAudio).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: SOUND_ON })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem(SOUND_SETTING_KEY)).toBe('on');
  });

  it('Given 音あり / When 最初に受けたフレームが残り −5 秒 / Then 鳴らさない（過去の 0 に対して鳴らさない）', () => {
    soundOn();
    joinedRoom(runningAgenda(65_000));
    expect(playStrike).not.toHaveBeenCalled();
  });

  it('Given 音あり・残り +1 秒で切断 / When 再接続で受けた最初のフレームが残り −5 秒 / Then 鳴らさない', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    soundOn();
    joinedRoom(runningAgenda(59_000));
    act(() => latestSocket().drop());
    act(() => vi.advanceTimersByTime(30_000));
    expect(ScriptedWebSocket.instances.length).toBeGreaterThan(1);
    join();
    deliverAgenda(runningAgenda(65_000));
    expect(playStrike).not.toHaveBeenCalled();
  });

  it('Given 音あり・残り +1 秒 / When 残り 0 のフレーム、続けて −2 秒のフレームを受ける / Then 1 回だけ鳴らし、盤を光らせる', () => {
    soundOn();
    joinedRoom(runningAgenda(59_000));
    deliverAgenda(runningAgenda(60_000));
    expect(playStrike).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.dial--striking')).not.toBeNull();
    deliverAgenda(runningAgenda(62_000));
    expect(playStrike).toHaveBeenCalledTimes(1);
  });

  it('Given 音なし / When 0 をまたぐ / Then 鳴らさないが、盤は光らせる', () => {
    joinedRoom(runningAgenda(59_000));
    deliverAgenda(runningAgenda(60_000));
    expect(playStrike).not.toHaveBeenCalled();
    expect(document.querySelector('.dial--striking')).not.toBeNull();
  });

  it('Given 動きを減らす設定 / When 0 をまたぐ / Then 盤を光らせない', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    joinedRoom(runningAgenda(59_000));
    deliverAgenda(runningAgenda(60_000));
    expect(document.querySelector('.dial--striking')).toBeNull();
  });

  it('Given 光らせた / When 600ms 過ぎる / Then 光を下ろす', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    joinedRoom(runningAgenda(59_000));
    deliverAgenda(runningAgenda(60_000));
    expect(document.querySelector('.dial--striking')).not.toBeNull();
    act(() => vi.advanceTimersByTime(600));
    expect(document.querySelector('.dial--striking')).toBeNull();
  });
});

/**
 * @requirements #429 spec §7.7
 */
describe('読み上げ（aria-live）', () => {
  const live = (): HTMLElement => {
    const region = document.querySelector<HTMLElement>('[aria-live="polite"].agenda-live');
    if (region === null) throw new Error('ライブリージョンが無い');
    return region;
  };

  it('Given 進行中 / When 毎秒のフレームを受ける / Then 読み上げの文は変わらない', () => {
    joinedRoom(runningAgenda(1000));
    const before = live().textContent;
    deliverAgenda(runningAgenda(2000));
    deliverAgenda(runningAgenda(3000));
    expect(live().textContent).toBe(before);
  });

  it('Given 進行中 / When 一時停止になる / Then 一時停止を読み上げる', () => {
    joinedRoom(runningAgenda(1000));
    deliverAgenda({ ...runningAgenda(1000), phase: 'paused' });
    expect(live().textContent).toBe('一時停止しました');
    deliverAgenda(runningAgenda(1000));
    expect(live().textContent).toBe('再開しました');
  });

  it('Given 進行中 / When 次のステップへ移る / Then いまのステップの名前を読み上げる', () => {
    joinedRoom(runningAgenda(1000));
    deliverAgenda({ ...runningAgenda(1000), currentId: 's-2' });
    expect(live().textContent).toBe('いまのステップは Talk');
  });

  it('Given 残り +1 秒 / When 0 をまたぐ / Then 時間切れを読み上げる', () => {
    joinedRoom(runningAgenda(59_000));
    deliverAgenda(runningAgenda(60_000));
    expect(live().textContent).toBe('時間切れです');
  });

  it('Given 予定どおり / When 押しに変わる / Then 押し巻きを読み上げる', () => {
    joinedRoom(runningAgenda(59_000, 59_000));
    // 一時停止で実時間だけ 2 分進む（計時は止まる）→ 予定より +2 分
    deliverAgenda({ ...runningAgenda(59_000, 179_000), phase: 'paused', stepSpentMs: 179_000 });
    expect(live().textContent).toContain('予定より +2 分');
  });

  it('Given 進行中 / When 画面を見る / Then 進行表の見出しがあり、盤の要約も読める', () => {
    joinedRoom(runningAgenda(1000));
    expect(screen.getByRole('heading', { name: STEP_LIST_HEADING })).toBeInTheDocument();
    expect(screen.getByText(/Check、残り 1 分/)).toBeInTheDocument();
  });
});
