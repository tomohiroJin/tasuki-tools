/**
 * #95 S3: poker からホストの概念を落とし、参加者を全員同格にする。
 *
 * かつては `snapshot.participants[].isHost` の真偽で公開・次ラウンドの導線を
 * 出し分けていたが、`packages/poker-core` からホストが撤去され（#95 S3）、
 * `reveal` / `nextRound` は在室者なら誰でも呼べるようになった。ここでは
 * **作成者ではない参加者**の視点で、公開のボタンが実際に出ることを固定する。
 *
 * 対照としてホストバッジ（`<span className="badge host">ホスト</span>`）が
 * どこにも描かれないことも固定する。バッジは `ParticipantList` にあった
 * `isHost` 分岐ごと削除したので、ここは「消えたことを確かめる」テストである。
 *
 * @requirements #95
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoomPage } from '../src/pages/RoomPage';
import type { RoomStateMessage } from '@tasuki/poker-core';
import type { PokerSync } from '../src/hooks/useSync';

const ROOM_ID = 'ABCD1234';

/** 投票中のルーム。you は作成者（p1）ではなく 2 人目の参加者（p2）。 */
function votingSnapshot(): RoomStateMessage {
  return {
    type: 'room-state',
    roomId: ROOM_ID,
    you: 'p2',
    participants: [
      { id: 'p1', name: 'あかり', connected: true, hasVoted: false },
      { id: 'p2', name: 'みなと', connected: true, hasVoted: false },
    ],
    round: { status: 'voting' },
    yourVote: null,
  };
}

function makeSync(snapshot: RoomStateMessage | null): PokerSync {
  return {
    status: 'open',
    everConnected: true,
    failedAttempts: 0,
    self: null,
    snapshot,
    joinedThisConnection: true,
    error: null,
    syncStale: false,
    clearError: () => {},
    createRoom: () => {},
    joinRoom: () => {},
    checkRoom: () => {},
    vote: () => {},
    reveal: () => {},
    nextRound: () => {},
  };
}

describe('#95 S3: poker は全員が同格である', () => {
  it('作成者でない参加者にも公開のボタンが出る', () => {
    // Given: 作成者（p1）ではなく 2 人目（p2）の視点の投票中スナップショット
    const sync = makeSync(votingSnapshot());
    // When
    render(<RoomPage roomId={ROOM_ID} sync={sync} />);
    // Then
    expect(screen.getByRole('button', { name: /公開/ })).toBeTruthy();
  });

  it('ホストのバッジをどこにも描かない', () => {
    // Given
    const sync = makeSync(votingSnapshot());
    // When
    render(<RoomPage roomId={ROOM_ID} sync={sync} />);
    // Then: まず描画されたことを陽性側で確かめてから、バッジの不在を確かめる。
    // 陽性を確かめずに queryByText(null) だけを見ると、描画自体に失敗していても
    // 同じ結果になり、テストが何も検証していないのと区別できない。
    expect(screen.getByText('みなと')).toBeTruthy();
    expect(screen.queryByText('ホスト')).toBeNull();
  });
});
