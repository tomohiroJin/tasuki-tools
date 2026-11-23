/**
 * うちわけの同期フック（#476）。**サーバーは立てない**（実サーバーとの配線は同期サーバーの側の試験が受け持つ）。
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadResumeIdentity, saveResumeIdentity } from '@tasuki/sync-client';
import { TrackCommandSchema } from '@tasuki/track-core';
import * as v from 'valibot';
import { trackSyncUrl, useTrackSync } from '../src/hooks/use-track-sync';
import { EMPTY_TRACK, JOINED, RESUME, ROSTER_FRAME, ScriptedWebSocket, latestSocket, runningTrack, trackFrame } from './support/track-states';

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  window.history.replaceState(null, '', '/track/?room=R1');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** 入室済みのフックを用意する。 */
function joinedHook() {
  saveResumeIdentity(RESUME);
  const hook = renderHook(() => useTrackSync('R1'));
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
 * @requirements #476 設計 §4（?tool=track の接続）
 */
describe('うちわけのルームへの入り方', () => {
  it('Given 復帰の組がある / When 繋ぐ / Then うちわけの入口へ繋ぎ、保存済みの組で入る', () => {
    saveResumeIdentity(RESUME);
    renderHook(() => useTrackSync('R1'));
    act(() => latestSocket().open());
    expect(latestSocket().url).toMatch(/\/ws\?tool=track$/);
    expect(trackSyncUrl({ protocol: 'https:', host: 'x.example' })).toMatch(/\/ws\?tool=track$/);
    expect(latestSocket().sentJson()[0]).toEqual({ command: 'room.join', code: 'R1', displayName: 'あや', resumeToken: 't1' });
  });

  it('Given 復帰の組が無い / When 繋ぐ / Then 繋がずに玄関へ戻す印を立てる', () => {
    const { result } = renderHook(() => useTrackSync('R1'));
    expect(ScriptedWebSocket.instances).toHaveLength(0);
    expect(result.current.needsHub).toBe(true);
  });

  it('Given ルームが消えていた / When ROOM_NOT_FOUND が返る / Then 組を捨てて、消えたと分かる', () => {
    saveResumeIdentity(RESUME);
    const { result } = renderHook(() => useTrackSync('R1'));
    act(() => latestSocket().open());
    act(() => latestSocket().deliver({ type: 'error', code: 'ROOM_NOT_FOUND', message: 'x' }));
    expect(result.current.gone).toBe(true);
    expect(loadResumeIdentity('R1')).toBeNull();
  });

  it.each([
    ['LEFT_ROOM', 'self'],
    ['REMOVED_FROM_ROOM', 'removed'],
  ] as const)('Given 入れた / When %s が届く / Then 理由 %s を持つ', (code, reason) => {
    const { result } = joinedHook();
    act(() => latestSocket().deliver({ type: 'error', code, message: 'x' }));
    expect(result.current.departed).toBe(reason);
  });

  it('Given 契約に合わないフレームが届いた / When 正しいフレームが届く / Then 同期できていない印が立ち、下りる', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result } = joinedHook();
    act(() => latestSocket().deliver({ type: 'track', state: { rev: 1 } }));
    expect(result.current.syncStale).toBe(true);
    act(() => latestSocket().deliver(trackFrame(EMPTY_TRACK)));
    expect(result.current.syncStale).toBe(false);
  });
});

/**
 * 写しは送る時点の位置（`nowMs`）と取り消しの残りを運ぶ。受け取った時刻は**フレームを受けるたびに**取り直す。
 *
 * @requirements #476 設計 §4.1
 */
describe('受け取った写しの保持', () => {
  it('Given 写しを受けた / When 次の写しを受ける / Then 写しも受け取った時刻も新しくなる', () => {
    const now = vi.spyOn(performance, 'now');
    const { result } = joinedHook();
    expect(result.current.track).toBeNull();
    now.mockReturnValue(1000);
    act(() => latestSocket().deliver(trackFrame(runningTrack(100))));
    expect(result.current.receivedAt).toBe(1000);
    now.mockReturnValue(2500);
    act(() => latestSocket().deliver(trackFrame(runningTrack(1600))));
    expect(result.current.receivedAt).toBe(2500);
    expect(result.current.track?.nowMs).toBe(1600);
  });

  it('Given お題と名簿が届く / When 受ける / Then お題と名簿を持つ', () => {
    const { result } = joinedHook();
    const topic = { topic: { title: 'FizzBuzz', body: '', source: 'manual' }, generating: false, degraded: false, aiUnlocked: false };
    act(() => latestSocket().deliver({ type: 'topic', state: topic }));
    act(() => latestSocket().deliver(ROSTER_FRAME));
    expect(result.current.topic?.topic?.title).toBe('FizzBuzz');
    expect(result.current.roster?.participants).toHaveLength(2);
  });
});

/**
 * @requirements #476 設計 §4.3・§6（コマンドに、誰が操作したかを表す項目は無い）
 */
describe('うちわけの操作', () => {
  it('Given 入れた / When 各操作を呼ぶ / Then 対応するコマンドを送る（「いまから」は backMin を載せない）', () => {
    const { result } = joinedHook();
    act(() => {
      result.current.start('Build', 'work');
      result.current.start('', 'break', 5);
      result.current.stop();
      result.current.stop(15);
      result.current.undo(7);
      result.current.setSegment('g-1', 'Review', 'work');
      result.current.adjustSegment('g-1', 'end', 60_000);
      result.current.splitSegment('g-1', 30_000, 'Test', 'work');
      result.current.insertSegment(0, 60_000, 'Plan', 'work');
      result.current.removeSegment('g-2');
      result.current.pin('Build', true);
      result.current.dismissOffer();
      result.current.clear();
    });
    const sent = latestSocket().sentJson().slice(1);
    expect(sent).toEqual([
      { command: 'track.start', label: 'Build', kind: 'work' },
      { command: 'track.start', label: '', kind: 'break', backMin: 5 },
      { command: 'track.stop' },
      { command: 'track.stop', backMin: 15 },
      { command: 'track.undo', rev: 7 },
      { command: 'track.segment.set', id: 'g-1', label: 'Review', kind: 'work' },
      { command: 'track.segment.adjust', id: 'g-1', edge: 'end', atMs: 60_000 },
      { command: 'track.segment.split', id: 'g-1', atMs: 30_000, label: 'Test', kind: 'work' },
      { command: 'track.segment.insert', startMs: 0, endMs: 60_000, label: 'Plan', kind: 'work' },
      { command: 'track.segment.remove', id: 'g-2' },
      { command: 'track.pin', label: 'Build', pinned: true },
      { command: 'track.offer.dismiss' },
      { command: 'track.clear' },
    ]);
    // 送った形は、サーバーの境界のスキーマ（余計な項目を拒む）をそのまま通る
    expect(sent.map((cmd) => v.safeParse(TrackCommandSchema, cmd).success)).toEqual(sent.map(() => true));
  });
});

describe('操作の失敗', () => {
  const FULL = { type: 'error', code: 'TRACK_FULL', message: '区切りは 200 件までです' };

  it('Given 操作が失敗した / When 他の人の操作の写しが届く / Then 失敗の文は残す', () => {
    const { result } = joinedHook();
    act(() => result.current.start('Build', 'work'));
    act(() => latestSocket().deliver(FULL));
    expect(result.current.error).toBe('区切りは 200 件までです');
    act(() => latestSocket().deliver(trackFrame(runningTrack(2000))));
    expect(result.current.error).toBe('区切りは 200 件までです');
  });

  it('Given 操作が失敗した / When 次の操作を送り、その写しが届く / Then 下ろす', () => {
    const { result } = joinedHook();
    act(() => result.current.start('Build', 'work'));
    act(() => latestSocket().deliver(FULL));
    act(() => result.current.stop());
    act(() => latestSocket().deliver(trackFrame(EMPTY_TRACK)));
    expect(result.current.error).toBeNull();
  });
});

/**
 * 裏のタブは時計が止まる・待たされる。表に戻ったら写しを取り直す（`track.sync`）。
 *
 * @requirements #476 設計 §4.1・§7 非機能（表に戻って 1 秒以内に正しい値）
 */
describe('表に戻ったときの取り直し', () => {
  afterEach(() => {
    Reflect.deleteProperty(document, 'visibilityState');
  });

  it('Given 入れた / When タブが表に戻る / Then track.sync を 1 通送る', () => {
    joinedHook();
    act(() => setVisibility('visible'));
    expect(commandsOf().filter((c) => c === 'track.sync')).toHaveLength(1);
  });

  it('Given 入れた / When タブが裏に回る / Then 何も送らない', () => {
    joinedHook();
    act(() => setVisibility('hidden'));
    expect(commandsOf()).not.toContain('track.sync');
  });

  it('Given まだ入れていない / When タブが表に戻る / Then 送らない', () => {
    saveResumeIdentity(RESUME);
    renderHook(() => useTrackSync('R1'));
    act(() => latestSocket().open());
    act(() => setVisibility('visible'));
    expect(commandsOf()).not.toContain('track.sync');
  });

  it('Given 入れた / When フックを外す / Then 付けた visibilitychange の聞き手を同じもので外す', () => {
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
