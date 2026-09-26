/**
 * ルーム画面がいまのお題を出すことを固定する（#91 PR 3・spec §5.5・T4）。
 *
 * poker はお題を読むだけで、設定はしない（設定はお題ツールの仕事）。
 * 本文は畳んでおき、開けるようにする —— **jsdom の `<details>` は閉じていても
 * 中身を Testing Library のクエリから隠さない**ので、「畳まれている」の判定は
 * `.open` プロパティで行う（テキストの有無では確かめられない）。
 *
 * @requirements #91
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { clearResumeIdentity, loadResumeIdentity, saveResumeIdentity } from '@tasuki/sync-client';
import type { RoomStateMessage } from '@tasuki/poker-core';
import type { Topic } from '@tasuki/topic-core';
import { RoomPage } from '../src/pages/RoomPage';
import type { PokerSync } from '../src/hooks/useSync';
import { TOPIC_BODY_TOGGLE, TOPIC_HEADING } from '../src/components/CurrentTopic';

const ROOM_ID = 'ABCD1234';

function votingSnapshot(): RoomStateMessage {
  return {
    type: 'room-state',
    roomId: ROOM_ID,
    you: 'p1',
    participants: [{ id: 'p1', name: 'あかり', connected: true, hasVoted: false }],
    round: { status: 'voting' },
    yourVote: null,
  };
}

function makeSync(topic: Topic | null): PokerSync {
  return {
    status: 'open',
    everConnected: true,
    failedAttempts: 0,
    storedIdentity: loadResumeIdentity,
    forgetIdentity: clearResumeIdentity,
    inviteUrl: (roomId: string) => `https://example.test/?room=${roomId}`,
    snapshot: votingSnapshot(),
    topic,
    joinedThisConnection: true,
    error: null,
    syncStale: false,
    clearError: vi.fn(),
    joinRoom: vi.fn(),
    checkRoom: vi.fn(),
    vote: vi.fn(),
    reveal: vi.fn(),
    nextRound: vi.fn(),
  };
}

beforeEach(() => {
  localStorage.clear();
  // 入室済み画面を描くための前提（#95 S5c・R9）。
  saveResumeIdentity({
    code: ROOM_ID,
    participantId: 'p1',
    resumeToken: 'tok-1',
    displayName: 'あかり',
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('poker のルーム画面がいまのお題を出す(#91)', () => {
  it('Given お題がある / When ルーム画面を開く / Then 見出しとタイトルが出て、本文は畳まれている', () => {
    // Given
    const topic: Topic = { title: 'FizzBuzz', body: '# 振る舞い\n3 のときは Fizz', source: 'manual' };
    // When
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(topic)} />);
    // Then
    expect(screen.getByRole('heading', { name: TOPIC_HEADING })).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'FizzBuzz' })).not.toBeNull();
    const details = document.querySelector('details.topic-details');
    expect(details).not.toBeNull();
    expect((details as HTMLDetailsElement).open).toBe(false);
  });

  it('Given お題がある / When 「説明を見る」を開く / Then 本文が読める', () => {
    // Given
    const topic: Topic = { title: 'FizzBuzz', body: '# 振る舞い\n3 のときは Fizz', source: 'manual' };
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(topic)} />);
    const details = document.querySelector('details.topic-details') as HTMLDetailsElement;
    // When: <summary> をクリックすると <details> が開く（jsdom もこの既定動作を持つ）
    fireEvent.click(screen.getByText(TOPIC_BODY_TOGGLE));
    // Then
    expect(details.open).toBe(true);
    expect(screen.getByText('3 のときは Fizz')).not.toBeNull();
  });

  it('Given お題が無い / When ルーム画面を開く / Then 「お題」の見出しは出ない', () => {
    // Given / When
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(null)} />);
    // Then（#91 E16）
    expect(screen.queryByRole('heading', { name: TOPIC_HEADING })).toBeNull();
  });
});
