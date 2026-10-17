/**
 * 開票後の 2 操作とアイテム名の欄・記録の欄（#93・spec §4.3）。
 *
 * @requirements #93
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { clearResumeIdentity, loadResumeIdentity, saveResumeIdentity } from '@tasuki/sync-client';
import type { RoomStateMessage } from '@tasuki/poker-core';
import { RoomPage } from '../src/pages/RoomPage';
import type { PokerSync } from '../src/hooks/useSync';
import {
  ESTIMATE_ITEM_LABEL,
  ESTIMATE_LOG_EMPTY,
  ESTIMATE_LOG_HEADING,
  ESTIMATE_POINTS_LABEL,
  NEXT_ITEM,
  REVOTE,
} from '../src/estimate-copy';

const ROOM_ID = 'ABCD1234';
const participants = [
  { id: 'p1', name: 'あかり', connected: true, hasVoted: true },
  { id: 'p2', name: 'みなと', connected: true, hasVoted: true },
];

function snapshot(status: 'voting' | 'revealed', withEstimate = true): RoomStateMessage {
  const base = { type: 'room-state', roomId: ROOM_ID, you: 'p2', participants, yourVote: null } as const;
  const round =
    status === 'voting'
      ? { status: 'voting' as const }
      : {
          status: 'revealed' as const,
          votes: [{ participantId: 'p1', card: { kind: 'number' as const, value: 5 as const } }],
          stats: { average: 5, modes: [{ kind: 'number' as const, value: 5 as const }] },
        };
  return {
    ...base,
    round,
    ...(withEstimate ? { estimate: { item: 'PROJ-1', log: [] } } : {}),
  } as RoomStateMessage;
}

function makeSync(snap: RoomStateMessage, over: Partial<PokerSync> = {}): PokerSync {
  return {
    status: 'open',
    everConnected: true,
    failedAttempts: 0,
    storedIdentity: loadResumeIdentity,
    forgetIdentity: clearResumeIdentity,
    inviteUrl: (id: string) => `https://example.test/?room=${id}`,
    snapshot: snap,
    topic: null,
    joinedThisConnection: true,
    error: null,
    syncStale: false,
    clearError: () => {},
    joinRoom: () => {},
    checkRoom: () => {},
    vote: () => {},
    reveal: () => {},
    setItem: vi.fn(),
    revote: vi.fn(),
    nextItem: vi.fn(),
    setPoints: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
  saveResumeIdentity({ code: ROOM_ID, participantId: 'p2', resumeToken: 'tok-2', displayName: 'みなと' });
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('開票後の操作', () => {
  it('再投票が主で最後、その前に ポイント（任意） と 次のアイテムへ', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(snapshot('revealed'))} />);
    const dock = document.querySelector('.ui-actions--dock')!;
    const controls = Array.from(dock.querySelectorAll('select, button'));
    expect(controls.map((el) => el.getAttribute('aria-label') ?? el.textContent)).toEqual([
      ESTIMATE_POINTS_LABEL,
      NEXT_ITEM,
      REVOTE,
    ]);
    const revote = screen.getByRole('button', { name: REVOTE });
    expect(revote.className).not.toContain('secondary');
    expect(screen.getByRole('button', { name: NEXT_ITEM }).className).toContain('secondary');
  });

  it('再投票 → revote が 1 回', () => {
    const sync = makeSync(snapshot('revealed'));
    render(<RoomPage roomId={ROOM_ID} sync={sync} />);
    fireEvent.click(screen.getByRole('button', { name: REVOTE }));
    expect(sync.revote).toHaveBeenCalledTimes(1);
    expect(sync.nextItem).not.toHaveBeenCalled();
  });

  it('ポイント 5 を選んで次のアイテムへ → nextItem(5)、選択は空へ戻る', () => {
    const sync = makeSync(snapshot('revealed'));
    render(<RoomPage roomId={ROOM_ID} sync={sync} />);
    const select = screen.getByRole('combobox', { name: ESTIMATE_POINTS_LABEL }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: NEXT_ITEM }));
    expect(sync.nextItem).toHaveBeenCalledTimes(1);
    expect(sync.nextItem).toHaveBeenCalledWith(5);
    expect(select.value).toBe('');
  });

  it('選ばずに次のアイテムへ → nextItem(null)', () => {
    const sync = makeSync(snapshot('revealed'));
    render(<RoomPage roomId={ROOM_ID} sync={sync} />);
    fireEvent.click(screen.getByRole('button', { name: NEXT_ITEM }));
    expect(sync.nextItem).toHaveBeenCalledWith(null);
    expect(sync.revote).not.toHaveBeenCalled();
  });
});

describe('アイテム名の欄と記録', () => {
  it('投票中は手札の上にアイテム名の欄が出る', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(snapshot('voting'))} />);
    const label = screen.getByText(ESTIMATE_ITEM_LABEL);
    const hand = screen.getByRole('heading', { name: 'あなたのカード' });
    expect(label.compareDocumentPosition(hand) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('開票後も欄は出て、確定すると setItem', () => {
    const sync = makeSync(snapshot('revealed'));
    render(<RoomPage roomId={ROOM_ID} sync={sync} />);
    expect(screen.getByText(ESTIMATE_ITEM_LABEL)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /PROJ-1/ }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'PROJ-2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(sync.setItem).toHaveBeenCalledWith('PROJ-2');
  });

  it('ドックの空の選択肢は見える文言（ポイント（任意））を持つ', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(snapshot('revealed'))} />);
    const select = screen.getByRole('combobox', { name: ESTIMATE_POINTS_LABEL });
    expect((select.querySelector('option[value=""]') as HTMLOptionElement).textContent).toBe(ESTIMATE_POINTS_LABEL);
  });

  it('estimate の無い snapshot（古いサーバー）の開票後も描け、記録は空の表示', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(snapshot('revealed', false))} />);
    expect(screen.getByRole('button', { name: REVOTE })).toBeTruthy();
    // 脇と足の 2 か所に描かれる（#93 Task 6）。脇で確かめる
    expect(within(document.querySelector('.room-log--side') as HTMLElement).getByText(ESTIMATE_LOG_EMPTY)).toBeTruthy();
  });

  it('estimate の無い snapshot（古いサーバー）でも描け、記録は空の表示', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(snapshot('voting', false))} />);
    const side = within(document.querySelector('.room-log--side') as HTMLElement);
    expect(side.getByRole('heading', { name: ESTIMATE_LOG_HEADING })).toBeTruthy();
    expect(side.getByText(ESTIMATE_LOG_EMPTY)).toBeTruthy();
  });
});
