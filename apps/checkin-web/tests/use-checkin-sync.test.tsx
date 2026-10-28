/**
 * Check-in Cards の同期フック（#406）。**サーバーは立てない**（実サーバーとの配線は
 * `apps/tasuki-sync/test/live-ws.checkin.test.ts` が受け持つ）。
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { joinRetryDelayMs, loadResumeIdentity, saveResumeIdentity } from '@tasuki/sync-client';
import { RETRY_EXHAUSTED_TEXT, RETRY_WAITING_TEXT } from '../src/copy';
import { checkinSyncUrl, useCheckinSync } from '../src/hooks/use-checkin-sync';
import { IDLE_CHECKIN, RESUME, ROSTER_FRAME, ScriptedWebSocket, latestSocket, openCheckin } from './support/scripted-web-socket';

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
  const hook = renderHook(() => useCheckinSync('R1'));
  act(() => latestSocket().open());
  act(() => latestSocket().deliver(JOINED));
  return hook;
}

/**
 * @requirements #406 設計 §5（接続）
 */
describe('Check-in Cards のルームへの入り方', () => {
  it('Given 復帰の組がある / When 繋ぐ / Then checkin の入口へ繋ぎ、保存済みの組で入る', () => {
    saveResumeIdentity(RESUME);
    renderHook(() => useCheckinSync('R1'));
    act(() => latestSocket().open());
    expect(latestSocket().url).toMatch(/\/ws\?tool=checkin$/);
    expect(checkinSyncUrl({ protocol: 'https:', host: 'x.example' })).toMatch(/\/ws\?tool=checkin$/);
    expect(latestSocket().sentJson()[0]).toEqual({
      command: 'room.join',
      code: 'R1',
      displayName: 'あや',
      resumeToken: 't1',
    });
  });

  it('Given 復帰の組が無い / When 繋ぐ / Then 繋がずに玄関へ戻す印を立てる', () => {
    const { result } = renderHook(() => useCheckinSync('R1'));
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
    const { result } = renderHook(() => useCheckinSync('R1'));
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
    const { result } = renderHook(() => useCheckinSync('R1'));
    act(() => latestSocket().open());
    act(() => latestSocket().deliver({ type: 'error', code: 'PASSPHRASE_REQUIRED', message: 'x' }));
    expect(result.current.needsHub).toBe(true);
  });

  it('Given 混雑で拒まれた / When 待ち時間が過ぎる / Then 待つ間は送らず、過ぎたら入り直す', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    saveResumeIdentity(RESUME);
    const { result } = renderHook(() => useCheckinSync('R1'));
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
    const { result } = renderHook(() => useCheckinSync('R1'));
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
    act(() => latestSocket().deliver({ type: 'checkin', state: { you: 'p1' } }));
    expect(result.current.syncStale).toBe(true);
    act(() => latestSocket().deliver({ type: 'checkin', state: IDLE_CHECKIN }));
    expect(result.current.syncStale).toBe(false);
  });
});

/**
 * @requirements #406 設計 §5
 */
describe('受け取った状態の保持', () => {
  it('Given 状態を受けた / When 次の状態を受ける / Then 新しい状態に替わる', () => {
    const { result } = joinedHook();
    expect(result.current.checkin).toBeNull();
    act(() => latestSocket().deliver({ type: 'checkin', state: IDLE_CHECKIN }));
    expect(result.current.checkin?.round).toBeNull();
    act(() => latestSocket().deliver({ type: 'checkin', state: openCheckin('sunny') }));
    expect(result.current.checkin?.round?.status).toBe('open');
    expect(result.current.checkin?.you).toBe('p1');
  });

  it('Given お題と名簿が届く / When 受ける / Then お題と名簿を持つ', () => {
    const { result } = joinedHook();
    const topic = { topic: { title: 'FizzBuzz', body: '', source: 'manual' }, generating: false, degraded: false, aiUnlocked: false };
    act(() => latestSocket().deliver({ type: 'topic', state: topic }));
    act(() => latestSocket().deliver(ROSTER_FRAME));
    expect(result.current.topic?.topic?.title).toBe('FizzBuzz');
    expect(result.current.roster?.code).toBe('R1');
  });
});

/**
 * 操作は `CheckinCommandSchema`（中核）の形で送る。回にまたがる操作は `seq` を運ぶ。
 *
 * @requirements #406 設計 §5
 */
describe('Check-in Cards の操作', () => {
  it('Given 入れた / When 各操作を呼ぶ / Then 対応するコマンドを送る', () => {
    const { result } = joinedHook();
    act(() => {
      result.current.chooseMethod('weather');
      result.current.drawMethod('checkin');
      result.current.playCard(3, 'sunny');
      result.current.setVisibility(3, 'anonymous');
      result.current.reveal(3);
      result.current.playAgain(3);
      result.current.setSpectator(true);
      result.current.setSpectator(false);
    });
    expect(latestSocket().sentJson().slice(1)).toEqual([
      { command: 'checkin.method.choose', method: 'weather' },
      { command: 'checkin.method.draw', side: 'checkin' },
      { command: 'checkin.card.play', seq: 3, card: 'sunny' },
      { command: 'checkin.visibility.set', seq: 3, visibility: 'anonymous' },
      { command: 'checkin.reveal', seq: 3 },
      { command: 'checkin.again', seq: 3 },
      { command: 'checkin.spectator.set', spectator: true },
      { command: 'checkin.spectator.set', spectator: false },
    ]);
  });
});

/**
 * @requirements #406 設計 §5
 */
describe('操作の失敗', () => {
  const REVEALED = { type: 'error', code: 'CHECKIN_REVEALED', message: '開いた後は出せません' };

  it('Given 操作が失敗した / When サーバーの文が届く / Then その文を見せる', () => {
    const { result } = joinedHook();
    act(() => latestSocket().deliver({ type: 'checkin', state: openCheckin() }));
    act(() => latestSocket().deliver(REVEALED));
    expect(result.current.error).toBe('開いた後は出せません');
  });

  it('Given 失敗の文が出ている / When 閉じる / Then 下りる', () => {
    const { result } = joinedHook();
    act(() => latestSocket().deliver(REVEALED));
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it('Given 失敗の文が出ている / When 自分の次の操作のあとに状態が届く / Then 下ろす', () => {
    const { result } = joinedHook();
    act(() => latestSocket().deliver({ type: 'checkin', state: openCheckin() }));
    act(() => latestSocket().deliver(REVEALED));
    act(() => result.current.playCard(1, 'sunny'));
    act(() => latestSocket().deliver({ type: 'checkin', state: openCheckin('sunny') }));
    expect(result.current.error).toBeNull();
  });

  it('Given 失敗の文が出ている / When 自分の操作と無関係な状態（他の人の札）が届く / Then 失敗の文は残す', () => {
    const { result } = joinedHook();
    act(() => latestSocket().deliver({ type: 'checkin', state: openCheckin() }));
    act(() => latestSocket().deliver(REVEALED));
    act(() => latestSocket().deliver({ type: 'checkin', state: openCheckin() }));
    expect(result.current.error).toBe('開いた後は出せません');
  });

  it('Given 操作を送った / When その操作が失敗し、続けて無関係な状態が届く / Then 失敗の文は残す', () => {
    const { result } = joinedHook();
    act(() => latestSocket().deliver({ type: 'checkin', state: openCheckin() }));
    act(() => result.current.reveal(1));
    act(() => latestSocket().deliver(REVEALED));
    act(() => latestSocket().deliver({ type: 'checkin', state: openCheckin() }));
    expect(result.current.error).toBe('開いた後は出せません');
  });
});
