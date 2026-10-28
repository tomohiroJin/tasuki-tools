/**
 * テーブルの読み込みに失敗しても、ルーム画面は消えず、見積もりに戻れる（#403・コードレビュー 1）。
 *
 * 古いタブを開いたまま本番が更新される（塊の名前が変わる）・読み込みの途中で通信が切れる、で起きる。
 *
 * @requirements #403 G-10
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { clearResumeIdentity, loadResumeIdentity, saveResumeIdentity } from '@tasuki/sync-client';
import type { RoomStateMessage } from '@tasuki/poker-core';
import { RoomPage } from '../src/pages/RoomPage';
import type { PokerSync } from '../src/hooks/useSync';

vi.mock('../src/components/CardTable', () => {
  throw new Error('塊を読み込めない（テストの造作）');
});

const ROOM_ID = 'ABCD1234';

const snapshot: RoomStateMessage = {
  type: 'room-state',
  roomId: ROOM_ID,
  you: 'p1',
  participants: [{ id: 'p1', name: 'あかり', connected: true, hasVoted: true, spectator: false }],
  round: { status: 'revealed', votes: [], stats: { average: null, modes: [] } },
  yourVote: null,
  table: { status: 'exchanging', players: [{ participantId: 'p1', exchanged: false }], yourHand: null, hands: [] },
};

let closeGame: ReturnType<typeof vi.fn<PokerSync['closeGame']>>;

function makeSync(): PokerSync {
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

beforeEach(() => {
  localStorage.clear();
  saveResumeIdentity({ code: ROOM_ID, participantId: 'p1', resumeToken: 'tok-1', displayName: 'あかり' });
  closeGame = vi.fn<PokerSync['closeGame']>();
  // React は捕まえた描画のエラーを console.error にも書く。期待どおりの失敗なので黙らせる
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('テーブルの読み込みに失敗したとき（#403）', () => {
  it('Given 塊を読み込めない / When ゲームが始まる / Then 画面は残り、伝える一文と「見積もりに戻る」「読み込み直す」が出る', async () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync()} />);
    expect(await screen.findByText('トランプのポーカーを読み込めませんでした')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'プランニングポーカー' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '読み込み直す' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '見積もりに戻る' }));
    expect(closeGame).toHaveBeenCalledOnce();
  });
});
