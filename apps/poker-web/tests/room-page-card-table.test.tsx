/**
 * ゲームの間は、手札・結果・帯をテーブルに置き換える（#403・設計 §5.2）。
 *
 * @requirements #403 G-11
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { clearResumeIdentity, loadResumeIdentity, saveResumeIdentity } from '@tasuki/sync-client';
import type { RoomStateMessage, TableView } from '@tasuki/poker-core';
import { RoomPage } from '../src/pages/RoomPage';
import type { PokerSync } from '../src/hooks/useSync';

const ROOM_ID = 'ABCD1234';

function state(table?: TableView): RoomStateMessage {
  return {
    type: 'room-state',
    roomId: ROOM_ID,
    you: 'p2',
    participants: [
      { id: 'p1', name: 'あかり', connected: true, hasVoted: true, spectator: false },
      { id: 'p2', name: 'みなと', connected: true, hasVoted: true, spectator: false },
    ],
    round: { status: 'revealed', votes: [], stats: { average: null, modes: [{ kind: 'coffee' }] } },
    yourVote: { kind: 'coffee' },
    ...(table && { table }),
  };
}

let closeGame: ReturnType<typeof vi.fn<PokerSync['closeGame']>>;

function makeSync(snapshot: RoomStateMessage): PokerSync {
  return {
    status: 'open',
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
    exchangeCards: () => {},
    dealAgain: () => {},
    closeGame,
  };
}

const playing: TableView = {
  status: 'exchanging',
  players: [
    { participantId: 'p1', exchanged: false },
    { participantId: 'p2', exchanged: false },
  ],
  yourHand: ([2, 3, 4, 5, 6] as const).map((rank) => ({ suit: 'S', rank })),
  hands: [],
};

beforeEach(() => {
  localStorage.clear();
  saveResumeIdentity({ code: ROOM_ID, participantId: 'p2', resumeToken: 'tok-2', displayName: 'みなと' });
  closeGame = vi.fn<PokerSync['closeGame']>();
});
afterEach(cleanup);

describe('テーブルの出し分け（#403）', () => {
  it('Given ゲームが無い / When 描く / Then いつもの結果と帯で、入口らしいものは無い', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(state())} />);
    expect(screen.queryByRole('heading', { name: 'トランプのポーカー' })).toBeNull();
    expect(screen.getByRole('button', { name: '再投票' })).toBeTruthy();
  });

  it('Given ゲームの最中 / When 描く / Then テーブルが出て、見積もりの結果と帯は無い。席の一覧は残る', async () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(state(playing))} />);
    expect(await screen.findByRole('heading', { name: 'トランプのポーカー' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '再投票' })).toBeNull();
    expect(screen.queryByRole('button', { name: '票を公開する' })).toBeNull();
    expect(document.querySelector('.results')).toBeNull();
    expect(screen.getByRole('heading', { name: '参加者（2人）' })).toBeTruthy();
  });

  it('Given ゲームの最中 / When 「見積もりに戻る」 / Then closeGame', async () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(state(playing))} />);
    fireEvent.click(await screen.findByRole('button', { name: '見積もりに戻る' }));
    expect(closeGame).toHaveBeenCalledOnce();
  });
});
