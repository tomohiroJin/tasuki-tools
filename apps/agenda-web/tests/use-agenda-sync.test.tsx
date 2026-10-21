/**
 * 進行タイマーの同期フック（#429）。**サーバーは立てない**（実サーバーとの配線は
 * `apps/tasuki-sync/test/live-ws.agenda.test.ts` が受け持つ）。
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { joinRetryDelayMs, loadResumeIdentity, saveResumeIdentity } from '@tasuki/sync-client';
import { RETRY_EXHAUSTED_TEXT, RETRY_WAITING_TEXT } from '../src/copy';
import { agendaSyncUrl, useAgendaSync } from '../src/hooks/use-agenda-sync';
import {
  IDLE_AGENDA,
  RESUME,
  ScriptedWebSocket,
  latestSocket,
  runningAgenda,
} from './support/scripted-web-socket';

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const JOINED = { type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' };

/** 入室済みのフックを用意する。 */
function joinedHook() {
  saveResumeIdentity(RESUME);
  const hook = renderHook(() => useAgendaSync('R1'));
  act(() => latestSocket().open());
  act(() => latestSocket().deliver(JOINED));
  return hook;
}

/** `document.visibilityState` を差し替えて `visibilitychange` を起こす。 */
function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

const commandsOf = () => latestSocket().sentJson().map((m) => m['command']);

/**
 * @requirements #429 spec §5.6
 */
describe('進行タイマーのルームへの入り方', () => {
  it('Given 復帰の組がある / When 繋ぐ / Then 進行タイマーの入口へ繋ぎ、保存済みの組で入る', () => {
    saveResumeIdentity(RESUME);
    renderHook(() => useAgendaSync('R1'));
    act(() => latestSocket().open());
    expect(latestSocket().url).toMatch(/\/ws\?tool=agenda$/);
    expect(agendaSyncUrl({ protocol: 'https:', host: 'x.example' })).toMatch(/\/ws\?tool=agenda$/);
    expect(latestSocket().sentJson()[0]).toEqual({
      command: 'room.join',
      code: 'R1',
      displayName: 'あや',
      resumeToken: 't1',
    });
  });

  it('Given 復帰の組が無い / When 繋ぐ / Then 繋がずに玄関へ戻す印を立てる', () => {
    const { result } = renderHook(() => useAgendaSync('R1'));
    expect(ScriptedWebSocket.instances).toHaveLength(0);
    expect(result.current.needsHub).toBe(true);
  });

  it('Given 入れた / When 参加の応答が届く / Then 自分の参加者 ID を覚え、入れたと分かる', () => {
    const { result } = joinedHook();
    expect(result.current.joined).toBe(true);
    expect(result.current.selfId).toBe('p1');
  });

  it('Given ルームが消えていた / When ROOM_NOT_FOUND が返る / Then 組を捨てて、接続を畳む', () => {
    vi.useFakeTimers();
    saveResumeIdentity(RESUME);
    const { result } = renderHook(() => useAgendaSync('R1'));
    act(() => latestSocket().open());
    act(() => latestSocket().deliver({ type: 'error', code: 'ROOM_NOT_FOUND', message: 'x' }));
    expect(result.current.gone).toBe(true);
    expect(loadResumeIdentity('R1')).toBeNull();
    act(() => latestSocket().drop());
    act(() => vi.advanceTimersByTime(30_000));
    expect(ScriptedWebSocket.instances).toHaveLength(1);
  });

  it.each([
    ['LEFT_ROOM', 'self'],
    ['REMOVED_FROM_ROOM', 'removed'],
  ] as const)('Given 入れた / When %s が届く / Then 組を捨て、理由 %s を持つ', (code, reason) => {
    vi.useFakeTimers();
    const { result } = joinedHook();
    act(() => latestSocket().deliver({ type: 'error', code, message: 'x' }));
    expect(result.current.departed).toBe(reason);
    expect(loadResumeIdentity('R1')).toBeNull();
  });

  it('Given 合言葉つきのルームで組が効かない / When 合言葉を求められる / Then 玄関へ戻す印を立てる', () => {
    saveResumeIdentity(RESUME);
    const { result } = renderHook(() => useAgendaSync('R1'));
    act(() => latestSocket().open());
    act(() => latestSocket().deliver({ type: 'error', code: 'PASSPHRASE_REQUIRED', message: 'x' }));
    expect(result.current.needsHub).toBe(true);
  });

  it('Given 混雑で拒まれた / When 待ち時間が過ぎる / Then 待つ間は送らず、過ぎたら入り直す', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    saveResumeIdentity(RESUME);
    const { result } = renderHook(() => useAgendaSync('R1'));
    act(() => latestSocket().open());
    const joins = () => latestSocket().sentJson().filter((m) => m['command'] === 'room.join');
    const delay = joinRetryDelayMs(1, () => 0.5)!;
    act(() => latestSocket().deliver({ type: 'error', code: 'JOIN_RATE_LIMITED', message: 'x' }));
    expect(result.current.retryNotice).toBe(RETRY_WAITING_TEXT);
    act(() => vi.advanceTimersByTime(delay - 1));
    expect(joins()).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(joins()).toHaveLength(2);
  });

  it('Given 混雑で拒まれ続けた / When 試行を使い切る / Then 諦めたと伝え、それ以上は送らない', () => {
    vi.useFakeTimers();
    saveResumeIdentity(RESUME);
    const { result } = renderHook(() => useAgendaSync('R1'));
    act(() => latestSocket().open());
    for (let attempt = 1; joinRetryDelayMs(attempt) !== null; attempt += 1) {
      act(() => latestSocket().deliver({ type: 'error', code: 'JOIN_RATE_LIMITED', message: 'x' }));
      act(() => vi.advanceTimersByTime(60_000));
    }
    const sentBefore = latestSocket().sent.length;
    act(() => latestSocket().deliver({ type: 'error', code: 'JOIN_RATE_LIMITED', message: 'x' }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.retryNotice).toBe(RETRY_EXHAUSTED_TEXT);
    expect(latestSocket().sent.length).toBe(sentBefore);
  });

  it('Given 契約に合わないフレームが届いた / When 正しいフレームが届く / Then 同期できていない印が立ち、下りる', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result } = joinedHook();
    act(() => latestSocket().deliver({ type: 'agenda', state: { phase: 'idle' } }));
    expect(result.current.syncStale).toBe(true);
    act(() => latestSocket().deliver({ type: 'agenda', state: IDLE_AGENDA }));
    expect(result.current.syncStale).toBe(false);
  });
});

/**
 * 受け取った時刻の基準（`receivedAt`）は**フレームを受けるたびに**取り直す。進行タイマーのフレームは
 * 送る時点で計った経過を運ぶので、同じ値を二重に数えない（ルーレットの `seq` ごととは違う）。
 *
 * @requirements #429 spec §5.6
 */
describe('受け取った状態の保持', () => {
  it('Given 状態を受けた / When 次の状態を受ける / Then 状態も受け取った時刻も新しくなる', () => {
    const now = vi.spyOn(performance, 'now');
    const { result } = joinedHook();
    expect(result.current.agenda).toBeNull();
    now.mockReturnValue(1000);
    act(() => latestSocket().deliver({ type: 'agenda', state: runningAgenda(100) }));
    expect(result.current.receivedAt).toBe(1000);
    now.mockReturnValue(2500);
    act(() => latestSocket().deliver({ type: 'agenda', state: runningAgenda(1600) }));
    expect(result.current.receivedAt).toBe(2500);
    expect(result.current.agenda?.stepTimerMs).toBe(1600);
  });

  it('Given お題と名簿が届く / When 受ける / Then お題と名簿を持つ', () => {
    const { result } = joinedHook();
    const topic = { topic: { title: 'FizzBuzz', body: '', source: 'manual' }, generating: false, degraded: false, aiUnlocked: false };
    act(() => latestSocket().deliver({ type: 'topic', state: topic }));
    expect(result.current.topic?.topic?.title).toBe('FizzBuzz');
  });
});

/**
 * @requirements #429 spec §5.6
 */
describe('進行タイマーの操作', () => {
  it('Given 入れた / When 各操作を呼ぶ / Then 対応するコマンドを送る', () => {
    const { result } = joinedHook();
    const scenario = { title: 'Retro', steps: [{ name: 'Check', durationSec: 60, onTimeout: 'wait' as const }] };
    act(() => {
      result.current.setScenario(scenario);
      result.current.start();
      result.current.next('s-1');
      result.current.pause();
      result.current.resume();
      result.current.extend('s-1', 3);
      result.current.setSkipped('s-2', true);
      result.current.reset();
    });
    expect(latestSocket().sentJson().slice(1)).toEqual([
      { command: 'agenda.scenario.set', scenario },
      { command: 'agenda.start' },
      { command: 'agenda.next', stepId: 's-1' },
      { command: 'agenda.pause' },
      { command: 'agenda.resume' },
      { command: 'agenda.extend', stepId: 's-1', minutes: 3 },
      { command: 'agenda.skip', stepId: 's-2', skipped: true },
      { command: 'agenda.reset' },
    ]);
  });
});

/**
 * @requirements #429 第 2 段（シナリオの回数）
 */
describe('シナリオの送信の回数', () => {
  const one = { title: 'Retro', steps: [{ name: 'Check', durationSec: 60, onTimeout: 'wait' as const }] };
  const sentScenario = (): Record<string, unknown> =>
    latestSocket().sentJson().slice(1)[0]?.['scenario'] as Record<string, unknown>;

  it('Given rounds: 1 が来た / When 送る / Then rounds のキーを落とす', () => {
    const { result } = joinedHook();
    act(() => result.current.setScenario({ ...one, rounds: 1 }));
    expect('rounds' in sentScenario()).toBe(false);
  });

  it('Given rounds: 3 / When 送る / Then rounds: 3 を載せる', () => {
    const { result } = joinedHook();
    act(() => result.current.setScenario({ ...one, rounds: 3 }));
    expect(sentScenario()['rounds']).toBe(3);
  });
});

/**
 * @requirements #429 spec §5.6
 */
describe('操作の失敗', () => {
  const IN_PROGRESS = { type: 'error', code: 'AGENDA_IN_PROGRESS', message: '進行中はシナリオを変えられません' };

  it('Given 操作が失敗した / When 次の操作のあとのフレームが届く / Then サーバーの文を見せ、そのフレームで下ろす', () => {
    const { result } = joinedHook();
    act(() => latestSocket().deliver({ type: 'agenda', state: runningAgenda(1000) }));
    act(() => latestSocket().deliver(IN_PROGRESS));
    expect(result.current.error).toBe('進行中はシナリオを変えられません');
    act(() => result.current.pause());
    act(() => latestSocket().deliver({ type: 'agenda', state: { ...runningAgenda(1000), phase: 'paused' } }));
    expect(result.current.error).toBeNull();
  });

  it('Given 操作が失敗した / When いまのステップが同じままの無関係なフレーム（他の人の延長など）が届く / Then 失敗の文は残す', () => {
    const { result } = joinedHook();
    act(() => latestSocket().deliver({ type: 'agenda', state: runningAgenda(1000) }));
    act(() => latestSocket().deliver(IN_PROGRESS));
    act(() => latestSocket().deliver({ type: 'agenda', state: runningAgenda(2000) }));
    expect(result.current.error).toBe('進行中はシナリオを変えられません');
  });

  it('Given 操作が失敗した / When いまのステップが変わったフレームが届く / Then 下ろす', () => {
    const { result } = joinedHook();
    act(() => latestSocket().deliver({ type: 'agenda', state: runningAgenda(1000) }));
    act(() => latestSocket().deliver(IN_PROGRESS));
    act(() => latestSocket().deliver({ type: 'agenda', state: { ...runningAgenda(1000), currentId: 's-2' } }));
    expect(result.current.error).toBeNull();
  });

  it('Given 操作を送った / When その操作が失敗し、続けて無関係なフレームが届く / Then 失敗の文は残す', () => {
    const { result } = joinedHook();
    act(() => latestSocket().deliver({ type: 'agenda', state: IDLE_AGENDA }));
    act(() => result.current.start());
    act(() => latestSocket().deliver(IN_PROGRESS));
    act(() => latestSocket().deliver({ type: 'agenda', state: IDLE_AGENDA }));
    expect(result.current.error).toBe('進行中はシナリオを変えられません');
  });
});

/**
 * 裏のタブは時計が止まる・待たされる。表に戻ったら状態を取り直す（`agenda.sync`）。
 *
 * @requirements #429 spec §5.6
 */
describe('表に戻ったときの取り直し', () => {
  afterEach(() => {
    Reflect.deleteProperty(document, 'visibilityState');
  });

  it('Given 入れた / When タブが表に戻る / Then agenda.sync を 1 通送る', () => {
    joinedHook();
    const before = commandsOf().filter((c) => c === 'agenda.sync').length;
    act(() => setVisibility('visible'));
    expect(commandsOf().filter((c) => c === 'agenda.sync').length - before).toBe(1);
  });

  it('Given 入れた / When タブが裏に回る / Then 何も送らない', () => {
    joinedHook();
    act(() => setVisibility('hidden'));
    expect(commandsOf()).not.toContain('agenda.sync');
  });

  it('Given まだ入れていない / When タブが表に戻る / Then 送らない', () => {
    saveResumeIdentity(RESUME);
    renderHook(() => useAgendaSync('R1'));
    act(() => latestSocket().open());
    act(() => setVisibility('visible'));
    expect(commandsOf()).not.toContain('agenda.sync');
  });

  it('Given 入れた / When フックを外す / Then 付けた visibilitychange の聞き手を同じもので外す', () => {
    // 外したあとの送信は接続が畳まれて捨てられるので、送信の有無では見えない。登録と解除を直接見る
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = joinedHook();
    const added = add.mock.calls.filter(([type]) => type === 'visibilitychange').map(([, handler]) => handler);
    expect(added).toHaveLength(1);
    unmount();
    const removed = remove.mock.calls.filter(([type]) => type === 'visibilitychange').map(([, handler]) => handler);
    expect(removed).toEqual(added);
  });
});
