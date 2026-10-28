/**
 * 隠しの入口とテーブルの出し分け（#403・設計 §5.1・§5.2）。
 *
 * @requirements #403 T-1 T-2 T-10
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { clearResumeIdentity, loadResumeIdentity, saveResumeIdentity } from '@tasuki/sync-client';
import type { RoomStateMessage, TableView } from '@tasuki/poker-core';
import { RoomPage } from '../src/pages/RoomPage';
import type { ConnectionStatus, PokerSync } from '../src/hooks/useSync';
import { KONAMI_CODE } from '../src/secret-entry';

const ROOM_ID = 'ABCD1234';

function state(table?: TableView): RoomStateMessage {
  return {
    type: 'room-state',
    roomId: ROOM_ID,
    you: 'p2',
    participants: [
      { id: 'p1', name: 'あかり', connected: true, hasVoted: false, spectator: false },
      { id: 'p2', name: 'みなと', connected: true, hasVoted: false, spectator: false },
    ],
    round: { status: 'voting' },
    yourVote: null,
    ...(table && { table }),
  };
}

let setTableSeat: ReturnType<typeof vi.fn<PokerSync['setTableSeat']>>;

function makeSync(snapshot: RoomStateMessage, status: ConnectionStatus = 'open'): PokerSync {
  return {
    status,
    everConnected: true,
    failedAttempts: 0,
    storedIdentity: loadResumeIdentity,
    forgetIdentity: clearResumeIdentity,
    inviteUrl: (roomId: string) => `https://example.test/?room=${roomId}`,
    snapshot,
    topic: null,
    joinedThisConnection: true,
    error: null,
    syncStale: false,
    clearError: () => {},
    joinRoom: () => {},
    checkRoom: () => {},
    vote: () => {},
    reveal: () => {},
    setItem: () => {},
    revote: () => {},
    nextItem: () => {},
    setPoints: () => {},
    setSpectator: () => {},
    removeParticipant: () => {},
    departed: null,
    setRecording: () => {},
    renameGroup: () => {},
    setTableSeat,
    dealHands: () => {},
    showHands: () => {},
  };
}

const heading = () => screen.getByRole('heading', { name: '参加者（2人）' });

beforeEach(() => {
  localStorage.clear();
  saveResumeIdentity({ code: ROOM_ID, participantId: 'p2', resumeToken: 'tok-2', displayName: 'みなと' });
  setTableSeat = vi.fn<PokerSync['setTableSeat']>();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('隠しの入口（#403 §5.1）', () => {
  it('Given 普段の画面 / When 描く / Then テーブルも入口らしいボタンも無い', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(state())} />);
    expect(screen.queryByRole('heading', { name: 'トランプのポーカー' })).toBeNull();
    expect(heading().closest('button')).toBeNull();
  });

  it('Given 参加者の見出し / When 2 秒以内に 5 回押す / Then 席に着く（1 回だけ）', () => {
    vi.useFakeTimers();
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(state())} />);
    for (let i = 0; i < 4; i++) {
      fireEvent.click(heading());
      vi.advanceTimersByTime(300);
    }
    expect(setTableSeat).not.toHaveBeenCalled();
    fireEvent.click(heading());
    expect(setTableSeat).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('Given 参加者の見出し / When ゆっくり 5 回押す / Then 何も起きない', () => {
    vi.useFakeTimers();
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(state())} />);
    for (let i = 0; i < 5; i++) {
      fireEvent.click(heading());
      vi.advanceTimersByTime(600);
    }
    expect(setTableSeat).not.toHaveBeenCalled();
  });

  it('Given 画面 / When コナミコマンドを打つ / Then 席に着く', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(state())} />);
    for (const key of KONAMI_CODE) fireEvent.keyDown(document.body, { key });
    expect(setTableSeat).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('Given 入力欄の中 / When コナミコマンドを打つ / Then 何も起きない（打ち込みを奪わない）', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(state())} />);
    // 画面のどの入力欄でも同じ（判定は要素の種類で行う）。ここでは素の入力欄を置いて打つ
    const field = document.createElement('input');
    document.body.append(field);
    for (const key of KONAMI_CODE) fireEvent.keyDown(field, { key });
    field.remove();
    expect(setTableSeat).not.toHaveBeenCalled();
  });

  it('Given 切断中 / When コナミコマンドを打つ / Then 何も送らない', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(state(), 'closed')} />);
    for (const key of KONAMI_CODE) fireEvent.keyDown(document.body, { key });
    expect(setTableSeat).not.toHaveBeenCalled();
  });
});

describe('テーブルの出し分け（#403 T-2）', () => {
  it('Given 自分が席に着いている / When 描く / Then テーブルが出て、「閉じる」で席を離れる', async () => {
    render(
      <RoomPage
        roomId={ROOM_ID}
        sync={makeSync(state({ status: 'idle', seats: ['p2'], yourHand: null, hands: [], winners: [] }))}
      />,
    );
    expect(await screen.findByRole('heading', { name: 'トランプのポーカー' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    });
    expect(setTableSeat).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('Given 他の人だけが席に着いている / When 描く / Then テーブルは出ない', async () => {
    render(
      <RoomPage
        roomId={ROOM_ID}
        sync={makeSync(state({ status: 'idle', seats: ['p1'], yourHand: null, hands: [], winners: [] }))}
      />,
    );
    // 遅延読み込みの待ちを越えてから「無い」を見る
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.queryByRole('heading', { name: 'トランプのポーカー' })).toBeNull();
  });
});
