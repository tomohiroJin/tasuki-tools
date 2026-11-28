/**
 * ツールの部屋の同期（#369 Task 5）。お題・ルーレットの同期フックの共通部分。
 *
 * お題・ルーレットの同期フックのテスト（各アプリ）が、配線と画面の側から同じ振る舞いを見ている。
 * ここは共通の部品そのものを、ツールに依存しない形（フレームは `{ type }` だけ）で固定する。
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { joinRetryDelayMs, loadResumeIdentity, saveResumeIdentity } from '@tasuki/sync-client';
import { useToolRoomSync, type ToolRoomFrameHandlers } from '../src/sync/use-tool-room-sync.js';
import { ScriptedWebSocket, latestSocket } from '@tasuki/test-css/scripted-web-socket';

type Frame =
  | { type: 'room.joined'; code: string; participantId: string; resumeToken: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'state'; value: number };

const RESUME = { code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' };
const TEXTS = { defaultError: '既定の文', retryWaiting: '待っています', retryExhausted: '諦めました' };

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

/** 呼びかけの知らせの見分け（本物は各画面の純粋な層。ここは web-kit が wire を読まない形の代役）。 */
function parseCall(raw: string): { tool: string; fromName: string } | null {
  try {
    const value = JSON.parse(raw) as { type?: unknown; call?: { tool?: unknown; fromName?: unknown } };
    if (value.type !== 'room.call' || typeof value.call?.tool !== 'string' || typeof value.call.fromName !== 'string') return null;
    return value.call as { tool: string; fromName: string };
  } catch {
    return null;
  }
}

function setup() {
  const states: number[] = [];
  const onFrame = (frame: Frame, handlers: ToolRoomFrameHandlers): void => {
    switch (frame.type) {
      case 'room.joined':
        handlers.joined(frame);
        return;
      case 'error':
        handlers.failed(frame.code, frame.message);
        return;
      case 'state':
        states.push(frame.value);
        handlers.clearError();
        return;
    }
  };
  const hook = renderHook(() =>
    useToolRoomSync<Frame>({
      roomCode: 'R1',
      syncUrl: (location) => `ws://${location.host}/ws?tool=x`,
      parseCall,
      parse: (raw) => {
        const value = JSON.parse(raw) as { type?: unknown };
        return typeof value.type === 'string' ? (value as Frame) : null;
      },
      onFrame,
      texts: TEXTS,
    }),
  );
  return { hook, states };
}

describe('useToolRoomSync', () => {
  it('Given 復帰の組がある / When 繋ぐ / Then 渡した URL へ繋ぎ、保存済みの組で入る', () => {
    // Given
    saveResumeIdentity(RESUME);
    // When
    setup();
    act(() => latestSocket().open());
    // Then
    expect(latestSocket().url).toMatch(/\/ws\?tool=x$/);
    expect(latestSocket().sentJson()[0]).toEqual({ command: 'room.join', code: 'R1', displayName: 'あや', resumeToken: 't1' });
  });

  it('Given 復帰の組が無い / When 開く / Then 繋がずに玄関へ戻す印を立てる', () => {
    const { hook } = setup();
    expect(ScriptedWebSocket.instances).toHaveLength(0);
    expect(hook.result.current.needsHub).toBe(true);
  });

  it('Given 入った / When 参加の応答が届く / Then 入れた・自分の ID を覚え、名乗った名前で組を保存する', () => {
    // Given
    saveResumeIdentity(RESUME);
    const { hook } = setup();
    act(() => latestSocket().open());
    // When
    act(() => latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p9', resumeToken: 't2' }));
    // Then
    expect(hook.result.current.joined).toBe(true);
    expect(hook.result.current.selfId).toBe('p9');
    expect(loadResumeIdentity('R1')).toEqual({ ...RESUME, participantId: 'p9', resumeToken: 't2' });
  });

  it('Given 入った / When ツールのフレームと契約に合わないフレームが届く / Then ツールへ渡し、合わないものは同期が古い印にする', () => {
    // Given
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    saveResumeIdentity(RESUME);
    const { hook, states } = setup();
    act(() => latestSocket().open());
    // When
    act(() => latestSocket().deliver({ type: 'state', value: 1 }));
    act(() => latestSocket().deliver({ nope: true }));
    // Then
    expect(states).toEqual([1]);
    expect(hook.result.current.syncStale).toBe(true);
    expect(hook.result.current.notice).toBe('stale');
  });

  it('Given 入った / When 未知の失敗が届き、次に状態が届く / Then サーバーの文を見せ、状態で下ろす', () => {
    // Given
    saveResumeIdentity(RESUME);
    const { hook } = setup();
    act(() => latestSocket().open());
    // When
    act(() => latestSocket().deliver({ type: 'error', code: 'X', message: '失敗しました' }));
    // Then
    expect(hook.result.current.error).toBe('失敗しました');
    act(() => latestSocket().deliver({ type: 'state', value: 2 }));
    expect(hook.result.current.error).toBeNull();
  });

  it.each([
    ['ROOM_NOT_FOUND', 'gone'],
    ['LEFT_ROOM', 'self'],
    ['REMOVED_FROM_ROOM', 'removed'],
  ] as const)('Given 入った / When %s が届く / Then 組を捨て、接続を畳む（%s）', (code, outcome) => {
    // Given
    vi.useFakeTimers();
    saveResumeIdentity(RESUME);
    const { hook } = setup();
    act(() => latestSocket().open());
    // When
    act(() => latestSocket().deliver({ type: 'error', code, message: 'x' }));
    // Then
    expect(loadResumeIdentity('R1')).toBeNull();
    if (outcome === 'gone') expect(hook.result.current.gone).toBe(true);
    else expect(hook.result.current.departed).toBe(outcome);
    act(() => latestSocket().drop());
    act(() => vi.advanceTimersByTime(30_000));
    expect(ScriptedWebSocket.instances).toHaveLength(1);
  });

  it('Given 混雑で拒まれ、待っている / When 待ちの途中で切れて繋ぎ直す / Then 入り直しは 1 通だけ（待ちの分がキューに溜まらない）', () => {
    // Given
    vi.useFakeTimers();
    saveResumeIdentity(RESUME);
    setup();
    act(() => latestSocket().open());
    act(() => latestSocket().deliver({ type: 'error', code: 'JOIN_RATE_LIMITED', message: 'x' }));
    // When
    act(() => latestSocket().drop());
    act(() => vi.advanceTimersByTime(60_000));
    act(() => latestSocket().open());
    // Then
    expect(latestSocket().sentJson().filter((m) => m['command'] === 'room.join')).toHaveLength(1);
  });

  it('Given 混雑で試行を使い切った / When 繋ぎ直す / Then 試行の数は戻り、知らせは下りる', () => {
    // Given
    vi.useFakeTimers();
    saveResumeIdentity(RESUME);
    const { hook } = setup();
    act(() => latestSocket().open());
    for (let attempt = 1; joinRetryDelayMs(attempt) !== null; attempt += 1) {
      act(() => latestSocket().deliver({ type: 'error', code: 'JOIN_RATE_LIMITED', message: 'x' }));
      act(() => vi.advanceTimersByTime(60_000));
    }
    act(() => latestSocket().deliver({ type: 'error', code: 'JOIN_RATE_LIMITED', message: 'x' }));
    expect(hook.result.current.retryNotice).toBe(TEXTS.retryExhausted);
    // When
    act(() => latestSocket().drop());
    act(() => vi.advanceTimersByTime(60_000));
    act(() => latestSocket().open());
    // Then
    expect(hook.result.current.retryNotice).toBeNull();
    act(() => latestSocket().deliver({ type: 'error', code: 'JOIN_RATE_LIMITED', message: 'x' }));
    expect(hook.result.current.retryNotice).toBe(TEXTS.retryWaiting);
  });

  it('Given 入った / When コマンドを送る / Then 操作の失敗の知らせを下ろしてから送る', () => {
    // Given
    saveResumeIdentity(RESUME);
    const { hook } = setup();
    act(() => latestSocket().open());
    act(() => latestSocket().deliver({ type: 'error', code: 'X', message: '失敗しました' }));
    // When
    act(() => hook.result.current.send({ command: 'x.do' }));
    // Then
    expect(hook.result.current.error).toBeNull();
    expect(latestSocket().sentJson().at(-1)).toEqual({ command: 'x.do' });
  });
});

describe('useToolRoomSync の呼びかけの知らせ（#677）', () => {
  const CALL = { type: 'room.call', call: { tool: 'poker', fromParticipantId: 'p2', fromName: 'あや' } };

  function setupWithSpy() {
    const parsed: string[] = [];
    const hook = renderHook(() =>
      useToolRoomSync<Frame>({
        roomCode: 'R1',
        syncUrl: (location) => `ws://${location.host}/ws?tool=x`,
        parseCall,
        parse: (raw) => {
          parsed.push(raw);
          const value = JSON.parse(raw) as { type?: unknown };
          return typeof value.type === 'string' ? (value as Frame) : null;
        },
        onFrame: () => undefined,
        texts: TEXTS,
      }),
    );
    return { hook, parsed };
  }

  function open() {
    saveResumeIdentity(RESUME);
    const sut = setupWithSpy();
    act(() => latestSocket().open());
    return sut;
  }

  it('Given 入った / When 呼びかけの知らせが届く / Then call に持つ', () => {
    const { hook } = open();
    expect(hook.result.current.call).toBeNull();
    act(() => latestSocket().deliver(CALL));
    expect(hook.result.current.call).toEqual(CALL.call);
  });

  it('Given 呼びかけを持っている / When 2 通目が届く / Then 最新の 1 つに置き換わる', () => {
    const { hook } = open();
    act(() => latestSocket().deliver(CALL));
    act(() => latestSocket().deliver({ type: 'room.call', call: { tool: 'topic', fromParticipantId: 'p3', fromName: 'いお' } }));
    expect(hook.result.current.call).toEqual({ tool: 'topic', fromParticipantId: 'p3', fromName: 'いお' });
  });

  it('Given 呼びかけを持っている / When dismissCall を呼ぶ / Then call が消える', () => {
    const { hook } = open();
    act(() => latestSocket().deliver(CALL));
    act(() => hook.result.current.dismissCall());
    expect(hook.result.current.call).toBeNull();
  });

  it('Given 呼びかけの知らせ / When 届く / Then 道具の parse には渡らない', () => {
    const { parsed } = open();
    act(() => latestSocket().deliver(CALL));
    expect(parsed).toEqual([]);
    act(() => latestSocket().deliver({ type: 'state', value: 1 }));
    expect(parsed).toHaveLength(1);
  });

  it('Given 契約に合わないフレームで同期が古い / When 呼びかけの知らせが届く / Then 同期の告知は下ろさず、呼びかけは持つ（状態は古いまま）', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { hook } = open();
    act(() => latestSocket().deliver({ nope: true }));
    expect(hook.result.current.syncStale).toBe(true);
    act(() => latestSocket().deliver(CALL));
    expect(hook.result.current.syncStale).toBe(true);
    expect(hook.result.current.notice).not.toBe('none');
    expect(hook.result.current.call).toEqual(CALL.call);
  });

  it('Given 同期が古くない / When 呼びかけの知らせが届く / Then 告知を立てない', () => {
    const { hook } = open();
    act(() => latestSocket().deliver(CALL));
    expect(hook.result.current.syncStale).toBe(false);
  });

  it.each([
    ['ROOM_NOT_FOUND'],
    ['LEFT_ROOM'],
    ['REMOVED_FROM_ROOM'],
  ] as const)('Given 呼びかけを持っている / When %s が届く / Then 呼びかけを消す（消えたルーム・抜けたルームの「移る」を残さない）', (code) => {
    saveResumeIdentity(RESUME);
    const { hook } = setup();
    act(() => latestSocket().open());
    act(() => latestSocket().deliver(CALL));
    expect(hook.result.current.call).toEqual(CALL.call);

    act(() => latestSocket().deliver({ type: 'error', code, message: 'x' }));

    expect(hook.result.current.call).toBeNull();
  });

  it('Given 呼びかけを持っている / When 別のルームに変わる / Then 前のルームの呼びかけを消す', () => {
    saveResumeIdentity(RESUME);
    saveResumeIdentity({ ...RESUME, code: 'R2' });
    const hook = renderHook(
      ({ roomCode }: { roomCode: string }) =>
        useToolRoomSync<Frame>({
          roomCode,
          syncUrl: (location) => `ws://${location.host}/ws?tool=x`,
          parseCall,
          parse: (raw) => JSON.parse(raw) as Frame,
          onFrame: () => undefined,
          texts: TEXTS,
        }),
      { initialProps: { roomCode: 'R1' } },
    );
    act(() => latestSocket().open());
    act(() => latestSocket().deliver(CALL));
    expect(hook.result.current.call).toEqual(CALL.call);

    hook.rerender({ roomCode: 'R2' });

    expect(hook.result.current.call).toBeNull();
  });
});
