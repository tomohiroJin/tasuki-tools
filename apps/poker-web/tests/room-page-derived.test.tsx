/**
 * ルーム画面が導く値（#370 の特性テスト）。
 *
 * 純粋関数（`src/room-view.ts`）へ出す前に、**いまの表示を画面の単位で固定する**。
 * - 公開を投票中から見届けたときだけ、集計を札のめくりの後まで待たせる（#348）
 * - 公開後の票は、票のある席にだけ値が出て、票の無い席には「未投票」の印が出る
 * - 切断中は、札・公開・次のラウンドの操作を押させない
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { clearResumeIdentity, loadResumeIdentity, saveResumeIdentity } from '@tasuki/sync-client';
import { RoomPage } from '../src/pages/RoomPage';
import type { RoomStateMessage } from '@tasuki/poker-core';
import type { ConnectionStatus, PokerSync } from '../src/hooks/useSync';

const ROOM_ID = 'ABCD1234';

const participants = [
  { id: 'p1', name: 'あかり', connected: true, hasVoted: true },
  { id: 'p2', name: 'みなと', connected: true, hasVoted: false },
];

function voting(): RoomStateMessage {
  return { type: 'room-state', roomId: ROOM_ID, you: 'p2', participants, round: { status: 'voting' }, yourVote: null };
}

function revealed(): RoomStateMessage {
  return {
    type: 'room-state',
    roomId: ROOM_ID,
    you: 'p2',
    participants,
    round: {
      status: 'revealed',
      votes: [{ participantId: 'p1', card: { kind: 'number', value: 5 } }],
      stats: { average: 5, modes: [{ kind: 'number', value: 5 }] },
    },
    yourVote: null,
  } as RoomStateMessage;
}

function makeSync(snapshot: RoomStateMessage | null, status: ConnectionStatus = 'open'): PokerSync {
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
    nextRound: () => {},
  };
}

beforeEach(() => {
  localStorage.clear();
  saveResumeIdentity({ code: ROOM_ID, participantId: 'p2', resumeToken: 'tok-2', displayName: 'みなと' });
});

afterEach(() => {
  localStorage.clear();
});

const afterFlip = () => document.querySelector('.results')?.classList.contains('results--after-flip');

describe('公開を見届けたか', () => {
  it('Given 投票中を描いた / When 公開に変わる / Then 集計は札のめくりの後を待つ', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed())} />);
    expect(afterFlip()).toBe(true);
  });

  it('Given 最初から公開済み（再読み込み・途中入室） / When 描く / Then 集計を待たせない', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed())} />);
    expect(afterFlip()).toBe(false);
  });

  it('Given 入室を待っている（状態がまだ無い） / When 最初の状態が公開済みで届く / Then 集計を待たせない', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(null)} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed())} />);
    expect(afterFlip()).toBe(false);
  });

  it('Given 公開を見届けた / When 公開のまま別の状態が届く / Then 待ちの印はそのまま', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed(), 'closed')} />);
    expect(afterFlip()).toBe(true);
  });
});

describe('公開後の票', () => {
  it('票の無い席にだけ「未投票」の印が出る', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed())} />);
    const rows = Array.from(document.querySelectorAll('.participants li'));
    expect(rows.map((li) => li.querySelector('.no-vote') !== null)).toEqual([false, true]);
  });

  it('投票中は「未投票」の印を出さず、投票済みの印を出す', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    expect(document.querySelector('.no-vote')).toBeNull();
    expect(document.querySelectorAll('.badge.voted')).toHaveLength(1);
  });
});

describe('切断中の操作', () => {
  it.each<ConnectionStatus>(['closed', 'connecting'])('%s の間は、札と公開のボタンを押させない', (status) => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting(), status)} />);
    expect((screen.getByRole('button', { name: '票を公開する' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('繋がっていれば公開のボタンを押せる', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    expect((screen.getByRole('button', { name: '票を公開する' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('公開後も、切断中は次のラウンドへ進ませない', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed(), 'closed')} />);
    expect((screen.getByRole('button', { name: '次のラウンドへ' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('見積もりの割れ（#405・FR-010a）', () => {
  function revealedWith(votes: { participantId: string; card: { kind: 'number'; value: 2 | 5 | 8 } }[]): RoomStateMessage {
    const base = revealed();
    return { ...base, round: { status: 'revealed', votes, stats: { average: 5, modes: [] } } } as RoomStateMessage;
  }

  it('Given 2 段以上離れた票 / When 公開後を描く / Then 結果に最大と最小を出した人の名前つきの促しが出る', () => {
    render(
      <RoomPage
        roomId={ROOM_ID}
        sync={makeSync(
          revealedWith([
            { participantId: 'p1', card: { kind: 'number', value: 8 } },
            { participantId: 'p2', card: { kind: 'number', value: 2 } },
          ]),
        )}
      />,
    );
    const note = document.querySelector('.results .results-spread');
    expect(note?.textContent).toContain('8 を出した あかり');
    expect(note?.textContent).toContain('2 を出した みなと');
  });

  it('Given 隣同士の票 / When 公開後を描く / Then 促しは出ない', () => {
    render(
      <RoomPage
        roomId={ROOM_ID}
        sync={makeSync(
          revealedWith([
            { participantId: 'p1', card: { kind: 'number', value: 5 } },
            { participantId: 'p2', card: { kind: 'number', value: 8 } },
          ]),
        )}
      />,
    );
    expect(document.querySelector('.results')).not.toBeNull();
    expect(document.querySelector('.results-spread')).toBeNull();
  });
});
