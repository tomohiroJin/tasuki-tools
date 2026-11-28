/**
 * poker が呼びかけの知らせ（`room.call` フレーム）を受け取り、画面に出すことを固定する（#677）。
 *
 * **知らせは poker の契約（`parseServerMessage`）には無い。** 先に見分けないと未知の `type` として落とされ、
 * #212 の「同期できていません」が立つ（お題の `topic` フレームと同じ）。ここではそれが起きないこと、
 * 知らせが poker の契約の処理（`room-state`・`error` の扱い）へ渡らないことも固定する。
 *
 * @requirements #677
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import { usePokerSync } from '../src/hooks/useSync';
import { FakeListenerSocket } from './support/fakes';

const ROOM_ID = 'ABCD1234';

const CALL = { tool: 'agenda', fromParticipantId: 'p2', fromName: 'いお' };
const callFrame = (tool = 'agenda', fromName = 'いお') => ({
  type: 'room.call',
  call: { tool, fromParticipantId: 'p2', fromName },
});

function deliver(frame: unknown): void {
  act(() => {
    FakeListenerSocket.latest().fire('message', { data: JSON.stringify(frame) });
  });
}

function open(): void {
  act(() => {
    FakeListenerSocket.latest().readyState = FakeListenerSocket.OPEN;
    FakeListenerSocket.latest().fire('open');
  });
}

beforeEach(() => {
  FakeListenerSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeListenerSocket);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  localStorage.clear();
  saveResumeIdentity({ code: ROOM_ID, participantId: 'p-stored', resumeToken: 'tok-1', displayName: 'はなこ' });
  window.history.replaceState(null, '', `/poker/?room=${ROOM_ID}`);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('poker が呼びかけの知らせを読む（同期フック）', () => {
  it('Given 接続済み / When 呼びかけの知らせが届く / Then roomCall に入り、syncStale は立たない', () => {
    const { result } = renderHook(() => usePokerSync());
    open();

    deliver(callFrame());

    expect(result.current.roomCall).toEqual(CALL);
    expect(result.current.syncStale).toBe(false);
    expect(result.current.notice).toBe('none');
  });

  it('Given 知らせが出ている / When 新しい知らせが届く / Then 最新の 1 つに置き換わる', () => {
    const { result } = renderHook(() => usePokerSync());
    open();
    deliver(callFrame('agenda'));

    deliver(callFrame('topic', 'うみ'));

    expect(result.current.roomCall).toEqual({ tool: 'topic', fromParticipantId: 'p2', fromName: 'うみ' });
  });

  it('Given 知らせが出ている / When 閉じる / Then roomCall は null に戻る', () => {
    const { result } = renderHook(() => usePokerSync());
    open();
    deliver(callFrame());

    act(() => result.current.dismissRoomCall());

    expect(result.current.roomCall).toBeNull();
  });

  it('Given 契約に合わないフレームで同期できていない / When 呼びかけの知らせが届く / Then 告知はそのまま（知らせは契約を満たすフレームの数に入れない）', () => {
    const { result } = renderHook(() => usePokerSync());
    open();
    deliver({ type: 'unknown' });
    expect(result.current.syncStale).toBe(true);

    deliver(callFrame());

    expect(result.current.syncStale).toBe(true);
  });

  it('Given 知らせが出ている / When ルームから抜けた知らせが届く / Then roomCall も畳む（抜けたルームへの「移る」を残さない）', () => {
    const { result } = renderHook(() => usePokerSync());
    open();
    deliver(callFrame());

    deliver({ type: 'error', code: 'LEFT_ROOM', message: '退出しました' });

    expect(result.current.roomCall).toBeNull();
  });

  it('Given 知らせが出ている / When 別のルームに入り直す / Then roomCall を消す（前のルームの「移る」を新しいルームに残さない）', () => {
    const { result } = renderHook(() => usePokerSync());
    open();
    deliver(callFrame());
    expect(result.current.roomCall).toEqual(CALL);

    act(() => result.current.joinRoom('ZZZZ9999', 'はなこ'));

    expect(result.current.roomCall).toBeNull();
  });
});

describe('poker の画面に呼びかけの知らせを出す', () => {
  it('Given ルームの画面 / When 呼びかけの知らせが届く / Then 名前と道具の名前と、同じルームへ移るリンクが出る', () => {
    render(<App />);
    open();

    deliver(callFrame());

    const notice = document.querySelector('.ui-call') as HTMLElement;
    expect(notice.textContent).toContain('いおさんが Agenda Timer に呼んでいます');
    expect(within(notice).getByRole('link', { name: '移る' }).getAttribute('href')).toBe(`/agenda/?room=${ROOM_ID}`);
  });

  it('Given 呼びかけの知らせ / When 届く / Then 「同期できていません」の告知は出ない', () => {
    render(<App />);
    open();

    deliver(callFrame());

    expect(document.querySelector('.ui-banner')).toBeNull();
  });

  it('Given 知らせが出ている / When 閉じる / Then 知らせは消える', () => {
    render(<App />);
    open();
    deliver(callFrame());

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

    expect(document.querySelector('.ui-call')).toBeNull();
  });

  it('Given 知らない道具の知らせ / When 届く / Then 何も出さない', () => {
    render(<App />);
    open();

    deliver(callFrame('unknown-tool'));

    expect(document.querySelector('.ui-call')).toBeNull();
  });
});
