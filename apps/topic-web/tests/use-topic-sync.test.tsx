/**
 * お題ツールの同期フック（#91 PR 2）。**サーバーは立てない**（実サーバーとの配線は
 * `apps/tasuki-sync/test/live-ws.topic.test.ts` が受け持つ）。
 */
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { joinRetryDelayMs, loadResumeIdentity, saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import { redirectTo } from '../src/router';
import { GONE_HEADING, RETRY_EXHAUSTED_TEXT, RETRY_WAITING_TEXT, STALE_TEXT } from '../src/copy';
import { IDLE_STATE, RESUME, ScriptedWebSocket, latestSocket } from './support/scripted-web-socket';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  window.history.replaceState(null, '', '/topic/?room=R1');
  vi.mocked(redirectTo).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/**
 * @requirements #91 E4 spec §5.4
 */
describe('お題ツールのルームへの入り方', () => {
  it('Given 復帰の組がある / When お題ツールを開く / Then お題の入口へ繋ぎ、保存済みの組で入る', () => {
    // Given
    saveResumeIdentity(RESUME);
    // When
    render(<App />);
    act(() => latestSocket().open());
    // Then
    expect(latestSocket().url).toMatch(/\/ws\?tool=topic$/);
    expect(latestSocket().sentJson()[0]).toEqual({
      command: 'room.join',
      code: 'R1',
      displayName: 'あや',
      resumeToken: 't1',
    });
  });

  it('Given 復帰の組が無い / When お題ツールを開く / Then 繋がずに玄関のそのルームへ送り返す', () => {
    // Given: 復帰の組が無い
    // When
    render(<App />);
    // Then
    expect(ScriptedWebSocket.instances).toHaveLength(0);
    expect(redirectTo).toHaveBeenCalledWith('/?room=R1');
  });

  it('Given 入れた / When いまのお題が届く / Then 画面にタイトルが出る', () => {
    // Given
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    // When
    act(() => {
      latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
      latestSocket().deliver({
        type: 'topic',
        state: { ...IDLE_STATE, topic: { title: 'FizzBuzz', body: '', source: 'manual' } },
      });
    });
    // Then
    expect(screen.getByRole('heading', { name: 'FizzBuzz' })).toBeInTheDocument();
  });

  it('Given ルームが消えていた / When ROOM_NOT_FOUND が返る / Then 組を捨てて、見つからないと伝える', () => {
    // Given
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    // When
    act(() => latestSocket().deliver({ type: 'error', code: 'ROOM_NOT_FOUND', message: 'x' }));
    // Then
    expect(loadResumeIdentity('R1')).toBeNull();
    expect(screen.getByRole('heading', { name: GONE_HEADING })).toBeInTheDocument();
  });

  it('Given 合言葉つきのルームで組が効かない / When 合言葉を求められる / Then 玄関のそのルームへ送り返す', () => {
    // Given
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    // When
    act(() => latestSocket().deliver({ type: 'error', code: 'PASSPHRASE_REQUIRED', message: 'x' }));
    // Then
    expect(redirectTo).toHaveBeenCalledWith('/?room=R1');
  });

  it('Given 混雑で拒まれた / When 待ち時間が過ぎる / Then 待つ間は送らず、過ぎたら入り直す', () => {
    // Given
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    const joins = () => latestSocket().sentJson().filter((m) => m['command'] === 'room.join');
    const delay = joinRetryDelayMs(1, () => 0.5)!;
    // When
    act(() => latestSocket().deliver({ type: 'error', code: 'JOIN_RATE_LIMITED', message: 'x' }));
    // Then その1: 知らせが出て、**待ち時間の手前ではまだ送らない**（即時に送り直す誤りを捕まえる）
    expect(screen.getByText(RETRY_WAITING_TEXT)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(delay - 1));
    expect(joins()).toHaveLength(1);
    // Then その2: 過ぎたら 1 通だけ送り直す
    act(() => vi.advanceTimersByTime(1));
    expect(joins()).toHaveLength(2);
  });

  it('Given 混雑で拒まれ続けた / When 試行を使い切る / Then 諦めたと伝え、それ以上は送らない', () => {
    // Given
    vi.useFakeTimers();
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    // When: 拒まれるたびに待ちを進める（`joinRetryDelayMs` が null を返すまで）
    for (let attempt = 1; joinRetryDelayMs(attempt) !== null; attempt += 1) {
      act(() => latestSocket().deliver({ type: 'error', code: 'JOIN_RATE_LIMITED', message: 'x' }));
      act(() => vi.advanceTimersByTime(60_000));
    }
    const sentBefore = latestSocket().sent.length;
    act(() => latestSocket().deliver({ type: 'error', code: 'JOIN_RATE_LIMITED', message: 'x' }));
    act(() => vi.advanceTimersByTime(60_000));
    // Then
    expect(screen.getByText(RETRY_EXHAUSTED_TEXT)).toBeInTheDocument();
    expect(latestSocket().sent.length).toBe(sentBefore);
  });

  it('Given 混雑の待ちの途中で切れた / When 繋ぎ直す / Then 入り直しは 1 通だけ送る', () => {
    // Given
    vi.useFakeTimers();
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    act(() => latestSocket().deliver({ type: 'error', code: 'JOIN_RATE_LIMITED', message: 'x' }));
    // When: 待ちの途中で切れ、待ち時間も再接続の待ちも過ぎてから開く
    act(() => latestSocket().drop());
    act(() => vi.advanceTimersByTime(60_000));
    act(() => latestSocket().open());
    // Then: 新しい接続で送った room.join は 1 通（待ちのタイマーの分がキューに溜まっていない）
    expect(latestSocket().sentJson().filter((m) => m['command'] === 'room.join')).toHaveLength(1);
  });

  it('Given 入れていた接続が切れた / When 繋ぎ直す / Then もう一度入る', () => {
    // Given
    vi.useFakeTimers();
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    act(() => latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' }));
    // When: 切れて、再接続の待ち（既定の上限 30 秒）が過ぎて、新しい接続が開く
    act(() => latestSocket().drop());
    act(() => vi.advanceTimersByTime(30_000));
    act(() => latestSocket().open());
    // Then
    expect(ScriptedWebSocket.instances).toHaveLength(2);
    expect(latestSocket().sentJson().some((m) => m['command'] === 'room.join')).toBe(true);
  });

  it('Given 入れた / When 契約に合わないフレームが届く / Then 同期できていないと伝える', () => {
    // Given
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    // When
    act(() => latestSocket().deliver({ type: 'topic', state: { topic: 'broken' } }));
    // Then
    expect(screen.getByText(STALE_TEXT)).toBeInTheDocument();
  });

  it('Given 合わないフレームで告知が出ている / When 正しいフレームが届く / Then 告知が下りる', () => {
    // Given
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    act(() => latestSocket().deliver({ type: 'topic', state: { topic: 'broken' } }));
    // When
    act(() => latestSocket().deliver({ type: 'topic', state: IDLE_STATE }));
    // Then
    expect(screen.queryByText(STALE_TEXT)).toBeNull();
  });

  it('Given 入れた / When 参加の応答が届く / Then 新しい復帰の組を名乗った名前のまま保存する', () => {
    // Given
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    // When: サーバーが新しいトークンを返した（復帰の組の更新）
    act(() => latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't2' }));
    // Then
    expect(loadResumeIdentity('R1')).toEqual({ ...RESUME, resumeToken: 't2' });
  });

  it('Given 切れている間に別のタブが組を捨てた / When 繋ぎ直す / Then 入ろうとせずに玄関へ送り返す', () => {
    // Given
    vi.useFakeTimers();
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    act(() => latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' }));
    act(() => latestSocket().drop());
    localStorage.clear();
    // When
    act(() => vi.advanceTimersByTime(30_000));
    act(() => latestSocket().open());
    // Then
    expect(latestSocket().sentJson().filter((m) => m['command'] === 'room.join')).toHaveLength(0);
    expect(redirectTo).toHaveBeenCalledWith('/?room=R1');
  });

  it('Given 入れた / When 別のタブで抜けた知らせが届く / Then 組を捨て、理由を持って玄関へ戻る', () => {
    // Given
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    act(() => latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' }));
    // When
    act(() => latestSocket().deliver({ type: 'error', code: 'LEFT_ROOM', message: 'x' }));
    // Then
    expect(loadResumeIdentity('R1')).toBeNull();
    expect(redirectTo).toHaveBeenCalledWith('/?room=R1&left=self');
  });

  it('Given 入れた / When 外された知らせが届く / Then 外された理由を持って玄関へ戻る', () => {
    // Given
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    // When
    act(() => latestSocket().deliver({ type: 'error', code: 'REMOVED_FROM_ROOM', message: 'x' }));
    // Then
    expect(redirectTo).toHaveBeenCalledWith('/?room=R1&left=removed');
  });
});
