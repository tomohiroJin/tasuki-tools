/**
 * RoomPage のヘッダに「選択画面へ戻る」導線があることを確かめる。
 *
 * #95 S5c で旧入口（poker のトップ画面等）を畳むと、ツールへ入った人が選択画面へ
 * 戻る手段を失う（利用者の申し送り・2026-09-14）。行き先は**同じルームの選択画面**
 * （`/?room=CODE`）——玄関まで戻すと、ルームから出たことになってしまう。
 *
 * 招待リンク（`InviteLink`）が配る URL も同じ選択画面の URL なので（#95 D11・
 * `docs/adr/0018` 決定 2）、戻る導線は `sync.inviteUrl(roomId)` を再利用する
 * （組み立ては `@tasuki/sync-client` に 1 つだけ・画面は同期クライアントを直接
 * import しない・`docs/adr/0015` MUST 2）。
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoomPage } from '../src/pages/RoomPage';
import type { RoomStateMessage } from '@tasuki/poker-core';
import type { PokerSync } from '../src/hooks/useSync';

const ROOM_ID = 'ABCD1234';

/** 投票中のルーム。ヘッダの描画に必要な最小限のスナップショット。 */
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

function makeSync(): PokerSync {
  return {
    status: 'open',
    everConnected: true,
    failedAttempts: 0,
    self: null,
    storedIdentity: () => null,
    forgetIdentity: () => {},
    inviteUrl: (roomId: string) => `https://example.test/?room=${roomId}`,
    snapshot: votingSnapshot(),
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

describe('RoomPage のヘッダ', () => {
  it('Given ルームに入っている / When ヘッダを描く / Then 選択画面へ戻る道がある', () => {
    // Given
    const sync = makeSync();

    // When
    render(<RoomPage roomId={ROOM_ID} sync={sync} />);

    // Then: 行き先は同じルームの選択画面。玄関まで戻すと、ルームから出たことになる
    // （`@testing-library/jest-dom` は入れていないので `getAttribute` で見る）
    expect(screen.getByRole('link', { name: '選択画面へ戻る' }).getAttribute('href')).toBe(
      'https://example.test/?room=ABCD1234',
    );
  });
});
