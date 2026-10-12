/**
 * ルーレットの同期フック（#94 PR 2）。**サーバーは立てない**（実サーバーとの配線は
 * `apps/tasuki-sync/test/live-ws.roulette.test.ts` が受け持つ）。
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { joinRetryDelayMs, loadResumeIdentity, saveResumeIdentity } from '@tasuki/sync-client';
import { RETRY_EXHAUSTED_TEXT, RETRY_WAITING_TEXT } from '../src/copy';
import { useRouletteSync } from '../src/hooks/use-roulette-sync';
import { phaseOf } from '../src/roulette-view';
import {
  IDLE_ROULETTE,
  RESUME,
  ROSTER_FRAME,
  ScriptedWebSocket,
  latestSocket,
  spinState,
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
  const hook = renderHook(() => useRouletteSync('R1'));
  act(() => latestSocket().open());
  act(() => latestSocket().deliver(JOINED));
  return hook;
}

/**
 * @requirements #94 spec §5.6
 */
describe('ルーレットのルームへの入り方', () => {
  it('Given 復帰の組がある / When 繋ぐ / Then ルーレットの入口へ繋ぎ、保存済みの組で入る', () => {
    // Given
    saveResumeIdentity(RESUME);
    // When
    renderHook(() => useRouletteSync('R1'));
    act(() => latestSocket().open());
    // Then
    expect(latestSocket().url).toMatch(/\/ws\?tool=roulette$/);
    expect(latestSocket().sentJson()[0]).toEqual({
      command: 'room.join',
      code: 'R1',
      displayName: 'あや',
      resumeToken: 't1',
    });
  });

  it('Given 復帰の組が無い / When 繋ぐ / Then 繋がずに玄関へ戻す印を立てる', () => {
    // Given: 復帰の組を置いていない
    // When
    const { result } = renderHook(() => useRouletteSync('R1'));
    // Then
    expect(ScriptedWebSocket.instances).toHaveLength(0);
    expect(result.current.needsHub).toBe(true);
  });

  it('Given 入れた / When 参加の応答が届く / Then 自分の参加者 ID を覚え、入れたと分かる', () => {
    // Given
    // When: 入室した（参加の応答が届く）
    const { result } = joinedHook();
    // Then
    expect(result.current.joined).toBe(true);
    expect(result.current.selfId).toBe('p1');
  });

  it('Given 入れた / When 参加の応答が届く / Then 新しい復帰の組を名乗った名前のまま保存する', () => {
    // Given
    saveResumeIdentity(RESUME);
    renderHook(() => useRouletteSync('R1'));
    act(() => latestSocket().open());
    localStorage.clear();
    // When: 応答が届く前に別のタブが組を捨てていても、送った名前で保存する
    act(() => latestSocket().deliver({ ...JOINED, resumeToken: 't2' }));
    // Then
    expect(loadResumeIdentity('R1')).toEqual({ ...RESUME, resumeToken: 't2' });
  });

  it('Given ルームが消えていた / When ROOM_NOT_FOUND が返る / Then 組を捨てて、接続を畳む', () => {
    // Given
    vi.useFakeTimers();
    saveResumeIdentity(RESUME);
    const { result } = renderHook(() => useRouletteSync('R1'));
    act(() => latestSocket().open());
    // When
    act(() => latestSocket().deliver({ type: 'error', code: 'ROOM_NOT_FOUND', message: 'x' }));
    // Then
    expect(result.current.gone).toBe(true);
    expect(loadResumeIdentity('R1')).toBeNull();
    act(() => latestSocket().drop());
    act(() => vi.advanceTimersByTime(30_000));
    expect(ScriptedWebSocket.instances).toHaveLength(1);
  });

  it.each([
    ['LEFT_ROOM', 'self'],
    ['REMOVED_FROM_ROOM', 'removed'],
  ] as const)('Given 入れた / When %s が届く / Then 組を捨て、接続を畳んで理由 %s を持つ', (code, reason) => {
    // Given
    vi.useFakeTimers();
    const { result } = joinedHook();
    // When
    act(() => latestSocket().deliver({ type: 'error', code, message: 'x' }));
    // Then
    expect(result.current.departed).toBe(reason);
    expect(loadResumeIdentity('R1')).toBeNull();
    act(() => latestSocket().drop());
    act(() => vi.advanceTimersByTime(30_000));
    expect(ScriptedWebSocket.instances).toHaveLength(1);
  });

  it('Given 合言葉つきのルームで組が効かない / When 合言葉を求められる / Then 玄関へ戻す印を立てる', () => {
    // Given
    saveResumeIdentity(RESUME);
    const { result } = renderHook(() => useRouletteSync('R1'));
    act(() => latestSocket().open());
    // When
    act(() => latestSocket().deliver({ type: 'error', code: 'PASSPHRASE_REQUIRED', message: 'x' }));
    // Then
    expect(result.current.needsHub).toBe(true);
  });

  it('Given 混雑で拒まれた / When 待ち時間が過ぎる / Then 待つ間は送らず、過ぎたら入り直す', () => {
    // Given
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    saveResumeIdentity(RESUME);
    const { result } = renderHook(() => useRouletteSync('R1'));
    act(() => latestSocket().open());
    const joins = () => latestSocket().sentJson().filter((m) => m['command'] === 'room.join');
    const delay = joinRetryDelayMs(1, () => 0.5)!;
    // When
    act(() => latestSocket().deliver({ type: 'error', code: 'JOIN_RATE_LIMITED', message: 'x' }));
    // Then
    expect(result.current.retryNotice).toBe(RETRY_WAITING_TEXT);
    act(() => vi.advanceTimersByTime(delay - 1));
    expect(joins()).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(joins()).toHaveLength(2);
  });

  it('Given 混雑で拒まれ続けた / When 試行を使い切る / Then 諦めたと伝え、それ以上は送らない', () => {
    // Given
    vi.useFakeTimers();
    saveResumeIdentity(RESUME);
    const { result } = renderHook(() => useRouletteSync('R1'));
    act(() => latestSocket().open());
    // When
    for (let attempt = 1; joinRetryDelayMs(attempt) !== null; attempt += 1) {
      act(() => latestSocket().deliver({ type: 'error', code: 'JOIN_RATE_LIMITED', message: 'x' }));
      act(() => vi.advanceTimersByTime(60_000));
    }
    const sentBefore = latestSocket().sent.length;
    act(() => latestSocket().deliver({ type: 'error', code: 'JOIN_RATE_LIMITED', message: 'x' }));
    act(() => vi.advanceTimersByTime(60_000));
    // Then
    expect(result.current.retryNotice).toBe(RETRY_EXHAUSTED_TEXT);
    expect(latestSocket().sent.length).toBe(sentBefore);
  });

  it('Given 混雑の待ちの途中で切れた / When 繋ぎ直す / Then 入り直しは 1 通だけ送る', () => {
    // Given
    vi.useFakeTimers();
    saveResumeIdentity(RESUME);
    renderHook(() => useRouletteSync('R1'));
    act(() => latestSocket().open());
    act(() => latestSocket().deliver({ type: 'error', code: 'JOIN_RATE_LIMITED', message: 'x' }));
    // When
    act(() => latestSocket().drop());
    act(() => vi.advanceTimersByTime(60_000));
    act(() => latestSocket().open());
    // Then
    expect(latestSocket().sentJson().filter((m) => m['command'] === 'room.join')).toHaveLength(1);
  });

  it('Given 契約に合わないフレームが届いた / When 正しいフレームが届く / Then 同期できていない印が立ち、下りる', () => {
    // Given
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result } = joinedHook();
    // When
    act(() => latestSocket().deliver({ type: 'roulette', state: { excluded: [] } }));
    // Then
    expect(result.current.syncStale).toBe(true);
    act(() => latestSocket().deliver({ type: 'roulette', state: IDLE_ROULETTE }));
    expect(result.current.syncStale).toBe(false);
  });
});

/**
 * 回転の時刻の基準（`receivedAt`）は**回転ごと（`seq` ごと）に 1 度だけ**決める（spec §6.4）。
 * 同じ回転の状態を繰り返し受けて基準を更新すると、円盤が回し直しになる。
 *
 * @requirements #94 E17
 */
describe('受け取った状態の保持', () => {
  it('Given ある回転を受けた / When 同じ seq の状態をもう一度受ける / Then 受け取った時刻は変わらない', () => {
    // Given: 時計を 2 点に分ける
    const now = vi.spyOn(performance, 'now');
    const { result } = joinedHook();
    now.mockReturnValue(1000);
    act(() => latestSocket().deliver({ type: 'roulette', state: spinState(1, 100) }));
    expect(result.current.receivedAt).toBe(1000);
    // When
    now.mockReturnValue(2500);
    act(() => latestSocket().deliver({ type: 'roulette', state: spinState(1, 1600) }));
    // Then
    expect(result.current.receivedAt).toBe(1000);
  });

  it('Given 回転中 / When 誰かの操作で同じ seq・進んだ elapsedMs の状態を受ける / Then 止まる時刻も局面も変わらず、回転以外の中身は新しくなる', () => {
    // Given: 1000ms の時点で経過 100ms の回転を受けた（止まるのは 1000 + 4000 - 100 = 4900ms）
    const now = vi.spyOn(performance, 'now');
    const { result } = joinedHook();
    now.mockReturnValue(1000);
    act(() => latestSocket().deliver({ type: 'roulette', state: spinState(1, 100) }));
    // When: 回転中に誰かが外す（サーバーは同じ回転の状態を、その時点で計った経過つきで配り直す）
    now.mockReturnValue(2500);
    act(() =>
      latestSocket().deliver({ type: 'roulette', state: { ...spinState(1, 1600), excluded: ['p2'] } }),
    );
    // Then: 新しい経過を古い基準に足すと 1500ms 先取りし、4000ms の時点で止まって当たりが出る
    const at = (nowMs: number) =>
      phaseOf({ view: result.current.roulette!, receivedAt: result.current.receivedAt, nowMs, reducedMotion: false });
    expect(at(4000)).toBe('spinning');
    expect(at(4899)).toBe('spinning');
    expect(at(4900)).toBe('settled');
    expect(result.current.roulette?.excluded).toEqual(['p2']);
  });

  it('Given ある回転を受けた / When 新しい seq の状態を受ける / Then 受け取った時刻が新しくなる', () => {
    // Given
    const now = vi.spyOn(performance, 'now');
    const { result } = joinedHook();
    now.mockReturnValue(1000);
    act(() => latestSocket().deliver({ type: 'roulette', state: spinState(1) }));
    // When
    now.mockReturnValue(9000);
    act(() => latestSocket().deliver({ type: 'roulette', state: spinState(2) }));
    // Then
    expect(result.current.receivedAt).toBe(9000);
    expect(result.current.roulette?.spin?.seq).toBe(2);
  });

  it('Given 名簿とお題のフレーム / When 届く / Then それぞれ保持する', () => {
    // Given
    const { result } = joinedHook();
    // When
    act(() => latestSocket().deliver(ROSTER_FRAME));
    act(() =>
      latestSocket().deliver({
        type: 'topic',
        state: { topic: { title: 'FizzBuzz', body: '', source: 'manual' }, generating: false, degraded: false, aiUnlocked: false },
      }),
    );
    // Then
    expect(result.current.roster?.participants).toHaveLength(2);
    expect(result.current.topic?.topic?.title).toBe('FizzBuzz');
  });
});

/**
 * @requirements #94 spec §5.3
 */
describe('ルーレットの操作', () => {
  it('Given 入れた / When 操作する / Then 対応するコマンドを送る', () => {
    // Given
    const { result } = joinedHook();
    // When
    act(() => {
      result.current.spin();
      result.current.setIncluded('p2', false);
      result.current.addGuest('はな');
      result.current.removeGuest('g-1');
      result.current.resetCycle();
    });
    // Then
    expect(latestSocket().sentJson().slice(-5)).toEqual([
      { command: 'roulette.spin' },
      { command: 'roulette.include', id: 'p2', included: false },
      { command: 'roulette.guest.add', name: 'はな' },
      { command: 'roulette.guest.remove', id: 'g-1' },
      { command: 'roulette.cycle.reset' },
    ]);
  });

  it('Given 操作が失敗した / When 失敗が届く / Then サーバーの文を見せ、状態が変わったら下ろす', () => {
    // Given
    const { result } = joinedHook();
    // When
    act(() => latestSocket().deliver({ type: 'error', code: 'ROULETTE_TOO_FEW', message: '2 人から回せます' }));
    // Then
    expect(result.current.error).toBe('2 人から回せます');
    act(() => latestSocket().deliver({ type: 'roulette', state: IDLE_ROULETTE }));
    expect(result.current.error).toBeNull();
  });
});
