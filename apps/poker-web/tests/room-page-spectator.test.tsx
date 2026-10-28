/**
 * 自分の見学の切り替え（#419・設計 §5.2）。
 *
 * @requirements #419 spec §5.2
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { clearResumeIdentity, loadResumeIdentity, saveResumeIdentity } from '@tasuki/sync-client';
import type { RoomStateMessage } from '@tasuki/poker-core';
import { RoomPage } from '../src/pages/RoomPage';
import type { ConnectionStatus, PokerSync } from '../src/hooks/useSync';

const ROOM_ID = 'ABCD1234';

const people = (youSpectator: boolean) => [
  { id: 'p1', name: 'あかり', connected: true, hasVoted: false, spectator: false },
  { id: 'p2', name: 'みなと', connected: true, hasVoted: false, spectator: youSpectator },
  { id: 'p3', name: 'いずみ', connected: true, hasVoted: false, spectator: !youSpectator },
];

function state(youSpectator: boolean, revealed: boolean): RoomStateMessage {
  return {
    type: 'room-state',
    roomId: ROOM_ID,
    you: 'p2',
    participants: people(youSpectator),
    round: revealed
      ? { status: 'revealed', votes: [{ participantId: 'p1', card: { kind: 'number', value: 5 } }], stats: { average: 5, modes: [{ kind: 'number', value: 5 }] } }
      : { status: 'voting' },
    yourVote: null,
  } as RoomStateMessage;
}

let setSpectator: ReturnType<typeof vi.fn<PokerSync['setSpectator']>>;

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
    setSpectator,
    removeParticipant: () => {},
    setTableSeat: () => {},
    dealHands: () => {},
    showHands: () => {},
    departed: null,
    setRecording: () => {},
    renameGroup: () => {},
  };
}

beforeEach(() => {
  localStorage.clear();
  saveResumeIdentity({ code: ROOM_ID, participantId: 'p2', resumeToken: 'tok-2', displayName: 'みなと' });
  setSpectator = vi.fn<PokerSync['setSpectator']>();
});
afterEach(cleanup);

describe('RoomPage の見学の切り替え', () => {
  it('Given 自分が投票者 / When 描く / Then 「見学する」があり、押すと setSpectator(true)', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(state(false, false))} />);
    expect(screen.queryByRole('button', { name: '投票に加わる' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '見学する' }));
    expect(setSpectator).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('Given 自分が見学者・投票中 / When 描く / Then 「投票に加わる」と一文があり、手札は無い。押すと setSpectator(false)', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(state(true, false))} />);
    expect(screen.getByText('見学中です。投票には加わりません。')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'あなたのカード' })).toBeTruthy();
    expect(document.querySelector('.card-hand')).toBeNull();
    expect(screen.queryByRole('button', { name: '見学する' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '投票に加わる' }));
    expect(setSpectator).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('Given 投票者・投票中 / When 描く / Then 手札があり一文は無い', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(state(false, false))} />);
    expect(document.querySelector('.card-hand')).not.toBeNull();
    expect(screen.queryByText('見学中です。投票には加わりません。')).toBeNull();
  });

  it('Given 開票後 / When 描く / Then 切り替えのボタンが出る', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(state(false, true))} />);
    expect(screen.getByRole('button', { name: '見学する' })).toBeTruthy();
    cleanup();
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(state(true, true))} />);
    expect(screen.getByRole('button', { name: '投票に加わる' })).toBeTruthy();
  });

  it('Given 切断中 / When 描く / Then 押せない', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(state(false, false), 'closed')} />);
    const button = screen.getByRole('button', { name: '見学する' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('Given 見学者が 1 人 / When 描く / Then 見出しは「参加者（3人・見学1人）」', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(state(false, false))} />);
    expect(screen.getByRole('heading', { name: '参加者（3人・見学1人）' })).toBeTruthy();
  });

  it('Given 開票後・見学者 1 人は票なし / When 描く / Then --seat-count は札を持つ席の数 2', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(state(false, true))} />);
    const results = document.querySelector<HTMLElement>('.results') as HTMLElement;
    expect(results.style.getPropertyValue('--seat-count')).toBe('2');
  });

  it('Given 開票後・見学者が票を持つ / When 描く / Then --seat-count は 3', () => {
    const snap = state(false, true);
    if (snap.round.status !== 'revealed') throw new Error('revealed の造作ではない');
    snap.round.votes.push({ participantId: 'p3', card: { kind: 'number', value: 8 } });
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(snap)} />);
    const results = document.querySelector<HTMLElement>('.results') as HTMLElement;
    expect(results.style.getPropertyValue('--seat-count')).toBe('3');
  });
});
