/**
 * 進める画面（#429 spec §4.3〜§4.7・§7.5・§7.7）。**画面はルームを通して描く**（同期フックの差し込みと
 * フレームの受け取りを実際の経路で通すため）。送った中身は `ScriptedWebSocket` が覚えている。
 *
 * 手元の時計は止めておく（`requestAnimationFrame` は予約だけ受けて呼ばない・`performance.now()` は固定）。
 * 盤の値は届いたフレームの値そのものになり、局面をフレームで作れる。
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROOM_HEADER_TEXT } from '@tasuki/invite-ui';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import {
  EXTEND_LABEL,
  FINISHED_ANNOUNCE,
  NEXT_BUTTON,
  PAUSE_BUTTON,
  RESET_BUTTON,
  RESET_CONFIRM_NO,
  RESET_CONFIRM_TEXT,
  RESET_CONFIRM_YES,
  RESUME_BUTTON,
  SOUND_LOCKED,
  SOUND_OFF,
  SOUND_ON,
  SPEAK_SUMMARY_BUTTON,
  START_BUTTON,
  STEP_LIST_HEADING,
  TIMEOUT_ANNOUNCE,
  extendButton,
  extensionNote,
  skipStepLabel,
  unskipStepLabel,
} from '../src/copy';
import { playStrike, unlockAudio } from '../src/platform/sound';
import { SOUND_SETTING_KEY } from '../src/hooks/use-sound-setting';
import { Driver, MIN } from './support/agenda-states';
import { RESUME, ScriptedWebSocket, latestSocket, runningAgenda } from './support/scripted-web-socket';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

/** 解錠の状態（既定は解錠済み。覚えた「音あり」で開き直した局面だけ閉じる） */
const audio = vi.hoisted(() => ({ unlocked: true, listeners: new Set<() => void>() }));

vi.mock('../src/platform/sound', () => ({
  installAudioUnlock: vi.fn(),
  unlockAudio: vi.fn(),
  playStrike: vi.fn(),
  isAudioUnlocked: () => audio.unlocked,
  subscribeAudioState: (listener: () => void) => {
    audio.listeners.add(listener);
    return () => audio.listeners.delete(listener);
  },
}));

/** AudioContext が running になった（resume が済んだ）ことを知らせる */
const audioUnlocked = (): void =>
  act(() => {
    audio.unlocked = true;
    audio.listeners.forEach((l) => l());
  });

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
  audio.unlocked = true;
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
    joinedRoom(new Driver([1, 2]).extend(3).view(1000));
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

  it('Given 「音あり」を覚えた端末で開き直した・まだ解錠していない / When 画面を見る / Then 「音を有効に」と出し、押されていない', () => {
    soundOn();
    audio.unlocked = false;
    joinedRoom(runningAgenda(1000));
    expect(screen.getByRole('button', { name: SOUND_LOCKED })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: SOUND_ON })).toBeNull();
  });

  it('Given 「音を有効に」 / When 1 回押す / Then 解錠して「音あり」になり、覚えた設定は「音あり」のまま', () => {
    soundOn();
    audio.unlocked = false;
    vi.mocked(unlockAudio).mockImplementationOnce(() => audioUnlocked());
    joinedRoom(runningAgenda(1000));
    fireEvent.click(screen.getByRole('button', { name: SOUND_LOCKED }));
    expect(unlockAudio).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: SOUND_ON })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem(SOUND_SETTING_KEY)).toBe('on');
  });

  it('Given 「音を有効に」のまま / When 0 をまたぐ / Then 鳴らさず、画面に触れて解錠したあとの 0 またぎは鳴らす', () => {
    soundOn();
    audio.unlocked = false;
    joinedRoom(runningAgenda(59_000));
    deliverAgenda(runningAgenda(60_000));
    expect(playStrike).not.toHaveBeenCalled();
    // 画面のどこかに触れた（`installAudioUnlock`）→ 解錠
    audioUnlocked();
    expect(screen.getByRole('button', { name: SOUND_ON })).toBeInTheDocument();
    const extended = (ms: number) => ({ ...runningAgenda(ms), steps: runningAgenda().steps.map((x, i) => (i === 0 ? { ...x, extensionSec: 60 } : x)) });
    deliverAgenda(extended(119_000));
    deliverAgenda(extended(120_000));
    expect(playStrike).toHaveBeenCalledTimes(1);
  });

  it('Given 解錠済みの「音あり」 / When 押す / Then 「音なし」に戻す', () => {
    soundOn();
    joinedRoom(runningAgenda(1000));
    fireEvent.click(screen.getByRole('button', { name: SOUND_ON }));
    expect(screen.getByRole('button', { name: SOUND_OFF })).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem(SOUND_SETTING_KEY)).toBe('off');
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

  it('Given 音あり・残り +1 秒でタブを隠した / When 表に戻ったあとの最初のフレームが残り −5 秒 / Then 鳴らさない', () => {
    soundOn();
    joinedRoom(runningAgenda(59_000));
    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    Reflect.deleteProperty(document, 'visibilityState');
    deliverAgenda(runningAgenda(65_000));
    expect(playStrike).not.toHaveBeenCalled();
    // その後の 0 またぎ（延長で正に戻って再び 0）は鳴らす
    deliverAgenda({ ...runningAgenda(119_000), steps: runningAgenda().steps.map((x, i) => (i === 0 ? { ...x, extensionSec: 60 } : x)) });
    deliverAgenda({ ...runningAgenda(120_000), steps: runningAgenda().steps.map((x, i) => (i === 0 ? { ...x, extensionSec: 60 } : x)) });
    expect(playStrike).toHaveBeenCalledTimes(1);
  });

  it('Given 音あり・0 をまたいで鳴らした / When 遅れの大きいフレームで残りが +30ms に戻り、再び 0 をまたぐ / Then 鳴らさず、延長してまたいだときは鳴らす', () => {
    soundOn();
    joinedRoom(runningAgenda(59_000));
    deliverAgenda(runningAgenda(60_000));
    expect(playStrike).toHaveBeenCalledTimes(1);
    // 片道の遅れが大きいフレームで残りが +30ms に戻り、手元の時計（ここではフレーム）で再び 0 をまたぐ
    deliverAgenda(runningAgenda(59_970));
    deliverAgenda(runningAgenda(60_010));
    expect(playStrike).toHaveBeenCalledTimes(1);
    // +1 分の延長で持ち時間が変わったあとの 0 またぎは、別の時間切れとして鳴らす（J20）
    const extended = (ms: number) => ({ ...runningAgenda(ms), steps: runningAgenda().steps.map((x, i) => (i === 0 ? { ...x, extensionSec: 60 } : x)) });
    deliverAgenda(extended(119_000));
    deliverAgenda(extended(120_000));
    expect(playStrike).toHaveBeenCalledTimes(2);
  });

  it('Given 音あり・自動で次へのステップの 0 を手元でまたいで鳴らした / When 遅れて +30ms のフレーム、続けて次へ移ったフレームを受ける / Then 二度目は鳴らさない', () => {
    soundOn();
    const d = new Driver([1, 2], undefined, 'advance');
    joinedRoom(d.view(1 * MIN - 1000));
    deliverAgenda(d.view(1 * MIN));
    expect(playStrike).toHaveBeenCalledTimes(1);
    deliverAgenda(d.view(1 * MIN - 30));
    d.tick(1 * MIN + 20);
    deliverAgenda(d.view(1 * MIN + 20));
    expect(playStrike).toHaveBeenCalledTimes(1);
  });

  it('Given 音あり・0 をまたいで鳴らした / When 最初からやり直して同じステップで再び 0 をまたぐ / Then もう一度鳴らす', () => {
    soundOn();
    joinedRoom(runningAgenda(59_000));
    deliverAgenda(runningAgenda(60_000));
    deliverAgenda({ ...runningAgenda(0), phase: 'idle', currentId: null });
    deliverAgenda(runningAgenda(59_000));
    deliverAgenda(runningAgenda(60_000));
    expect(playStrike).toHaveBeenCalledTimes(2);
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
 * 「自動で次へ」の時間切れ（最終レビュー I-1）。手元の時計は止めてあるので、盤は届いたフレームの値そのもの。
 * 残り +30ms の盤のあとに、サーバーが期限ちょうどで次へ（終了へ）移したフレームが届く局面を作る。
 *
 * @requirements #429 spec §4.4・§4.7・§7.7
 */
describe('自動で次へ移ったときの合図', () => {
  const live = (): string => document.querySelector<HTMLElement>('[aria-live="polite"].agenda-live')?.textContent ?? '';

  it('Given 音あり・自動で次へのステップが残り +30ms / When 次のステップへ移ったフレームを受ける / Then 鳴らし、光らせ、時間切れを読み上げる', () => {
    localStorage.setItem(SOUND_SETTING_KEY, 'on');
    const d = new Driver([1, 2], undefined, 'advance');
    joinedRoom(d.view(1 * MIN - 30));
    d.tick(1 * MIN + 20);
    deliverAgenda(d.view(1 * MIN + 20));
    expect(playStrike).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.dial--striking')).not.toBeNull();
    expect(live()).toContain(TIMEOUT_ANNOUNCE);
  });

  it('Given 音あり・最後のステップが自動で次へ・残り +30ms / When 終了へ移ったフレームを受ける / Then 鳴らし、時間切れと終了を読み上げる', () => {
    localStorage.setItem(SOUND_SETTING_KEY, 'on');
    const d = new Driver([1], undefined, 'advance');
    joinedRoom(d.view(1 * MIN - 30));
    d.tick(1 * MIN + 20);
    deliverAgenda(d.view(1 * MIN + 20));
    expect(playStrike).toHaveBeenCalledTimes(1);
    expect(live()).toContain(TIMEOUT_ANNOUNCE);
    expect(live()).toContain(FINISHED_ANNOUNCE);
  });

  it('Given 音あり・自動で次へのステップ / When 持ち時間の前に次へ移ったフレームを受ける / Then 鳴らさない', () => {
    localStorage.setItem(SOUND_SETTING_KEY, 'on');
    const d = new Driver([1, 2], undefined, 'advance');
    joinedRoom(d.view(30_000));
    d.next(31_000);
    deliverAgenda(d.view(31_000));
    expect(playStrike).not.toHaveBeenCalled();
    expect(live()).not.toContain(TIMEOUT_ANNOUNCE);
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

  it('Given 進行中 / When 「読み上げ」を探す / Then 隠し方のクラスを持ち、Tab でフォーカスが当たり、押すと要約が aria-live の領域に入る', () => {
    joinedRoom(runningAgenda(1000));
    const button = screen.getByRole('button', { name: SPEAK_SUMMARY_BUTTON });
    expect(button).toHaveClass('ui-visually-hidden');
    button.focus();
    expect(document.activeElement).toBe(button);
    expect(button.tabIndex).toBeGreaterThanOrEqual(0);
    fireEvent.click(button);
    expect(live().textContent).toBe('Check、残り 1 分、予定どおり');
  });

  it('Given 要約を読み上げた / When もう一度「読み上げ」を押す / Then 同じ文でも一度空にしてから入れ直す', () => {
    joinedRoom(runningAgenda(1000));
    fireEvent.click(screen.getByRole('button', { name: SPEAK_SUMMARY_BUTTON }));
    const said = live().textContent;
    const observer = new MutationObserver(() => undefined);
    observer.observe(live(), { childList: true, characterData: true, subtree: true });
    fireEvent.click(screen.getByRole('button', { name: SPEAK_SUMMARY_BUTTON }));
    const records = observer.takeRecords();
    observer.disconnect();
    // 文を一度消した（子の文字が外された）記録があり、最後は同じ文に戻っている。直さなければ DOM は 1 度も変わらない
    expect(records.some((r) => r.type === 'childList' && r.removedNodes.length > 0)).toBe(true);
    expect(live().textContent).toBe(said);
  });

  it('Given 進行中 / When 「読み上げ」を押す / Then 盤の要約を読み上げの領域へ流す', () => {
    joinedRoom(runningAgenda(1000));
    fireEvent.click(screen.getByRole('button', { name: SPEAK_SUMMARY_BUTTON }));
    expect(live().textContent).toContain('Check、残り 1 分');
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

/**
 * @requirements #447 段 1
 */
describe('ルームの見出しは共通の部品が描く（#447 段 1）', () => {
  it('Given 入室したルーム / When 描く / Then 共通の見出しにルームコード・招待 URL・QR のボタンが出る', () => {
    // Given / When
    joinedRoom(runningAgenda(1000));
    // Then: ルームコードは値の要素だけを見る（招待 URL の中にも 'R1' の字が入るため、見出しの文字全体では見ない）
    const header = document.querySelector<HTMLElement>('.ui-room-header');
    expect(header).not.toBeNull();
    expect(document.querySelector('.ui-room-header-code-value')?.textContent).toBe('R1');
    expect(header!.querySelector('.ui-invite-url')?.textContent).toBe(`${location.origin}/?room=R1`);
    expect(within(header!).getByRole('button', { name: ROOM_HEADER_TEXT.qrShow })).toBeInTheDocument();
  });

  it('Given 入室したルーム / When 戻るリンクを見る / Then 選択画面を指し、「仲間を招く」は見出しの中の 1 つだけ', () => {
    // Given / When
    joinedRoom(runningAgenda(1000));
    // Then
    expect(screen.getByRole('link', { name: ROOM_HEADER_TEXT.back })).toHaveAttribute('href', '/?room=R1');
    const header = document.querySelector<HTMLElement>('.ui-room-header');
    expect(header).not.toBeNull();
    expect(within(header!).getByRole('button', { name: ROOM_HEADER_TEXT.inviteToggle })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: ROOM_HEADER_TEXT.inviteToggle })).toHaveLength(1);
  });
});

/**
 * 「開始」を押した本人の画面だけ、進める画面へ寄せる（#455）。長い会は組む画面が縦に長く、
 * 押した位置のまま進める画面に入ると盤が画面の外に残るため。他の参加者の画面は動かさない。
 * 寄せ先は進める画面の上端（会の名前の行）。見出し要素はステップ表の `h2` しか無く、そこへ寄せると盤が上に外れる。
 *
 * @requirements #455
 */
describe('開始を押した本人の画面だけ進める画面へ寄せる（#455）', () => {
  const idleWithScenario = { ...runningAgenda(0), phase: 'idle', currentId: null };
  let scrollTo: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  });
  afterEach(() => {
    scrollTo.mockRestore();
  });

  const runTitle = (): HTMLElement => document.querySelector<HTMLElement>('.run-title')!;

  it('Given 組む画面で開始を押した / When 進行中のフレームを受けて描く / Then 会の名前の行へ focus が移り、ページの先頭へ一度で（auto）戻す', () => {
    // Given
    joinedRoom(idleWithScenario);
    fireEvent.click(screen.getByRole('button', { name: START_BUTTON }));
    expect(sentCommands('agenda.start')).toHaveLength(1);
    // When
    deliverAgenda(runningAgenda(0));
    // Then
    expect(document.activeElement).toBe(runTitle());
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });

  it('Given 他の参加者が開始を押した（自分は押していない） / When 進行中に変わったフレームを受ける / Then 寄せず focus も動かさない', () => {
    // Given
    joinedRoom(idleWithScenario);
    // When
    deliverAgenda(runningAgenda(0));
    // Then
    expect(scrollTo).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(runTitle());
  });

  it('Given 開始を押したが返事が来ない（同じ文言の失敗・届かない送信） / When 時間がたってから他の参加者が開始する / Then 寄せない', () => {
    // Given: 押した瞬間の印。失敗の表示が変わらない・送信が黙って落ちると、印を消すきっかけが無い。
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    joinedRoom(idleWithScenario);
    fireEvent.click(screen.getByRole('button', { name: START_BUTTON }));
    // When: 押してから 11 秒後に、他の参加者の開始で進行中に変わる
    now.mockReturnValue(1_011_000);
    deliverAgenda(runningAgenda(0));
    // Then: 本人の開始の返事とは見なさない
    expect(scrollTo).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(runTitle());
    now.mockRestore();
  });

  it('Given 開始を押した / When 9 秒後に進行中が届く / Then 本人の開始の返事として寄せる（遅い回線でも効く）', () => {
    // Given
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    joinedRoom(idleWithScenario);
    fireEvent.click(screen.getByRole('button', { name: START_BUTTON }));
    // When
    now.mockReturnValue(1_009_000);
    deliverAgenda(runningAgenda(0));
    // Then
    expect(scrollTo).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });

  it('Given 開始を押したが失敗が返った / When 後で他の参加者が開始して進行中に変わる / Then 寄せない', () => {
    // Given
    joinedRoom(idleWithScenario);
    fireEvent.click(screen.getByRole('button', { name: START_BUTTON }));
    act(() => latestSocket().deliver({ type: 'error', code: 'INVALID_COMMAND', message: 'x' }));
    // When
    deliverAgenda(runningAgenda(0));
    // Then
    expect(scrollTo).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(runTitle());
  });
});
