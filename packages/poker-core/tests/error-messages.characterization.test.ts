// 特性テスト（#165 PR-2）。**振る舞いを固定するためだけに存在する。**
//
// RoomError の文言は WS に届かない。protocol.ts の NameSchema が room.ts の
// validateName と同じ規則（NAME_MAX_LENGTH を共有）なので、不正な名前は境界で
// 弾かれ、handleCreateRoom / handleJoinRoom の isErr() 分岐には到達しない（2026-08-17 実測）。
//
// それでもこの分岐は残す（docs/adr/0005 が境界検証とドメイン検証の両方を MUST としている）。
// 残す以上、文言も固定しておく。
import { describe, expect, it } from 'vitest';
import { createRoom, joinRoom, NAME_MAX_LENGTH } from '../src/room';

const ids = { participantId: 'p1', token: 't1' };

describe('RoomError の文言（特性テスト）', () => {
  it('createRoom の名前が空なら invalid-name と定型文を返す', () => {
    // Given / When
    const result = createRoom('room1', '   ', ids);

    // Then
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'invalid-name',
      message: `名前は 1〜${NAME_MAX_LENGTH} 文字で入力してください`,
    });
  });

  it('joinRoom の名前が長すぎるなら invalid-name と定型文を返す', () => {
    // Given
    const room = createRoom('room1', 'たろう', ids)._unsafeUnwrap().room;

    // When
    const result = joinRoom(room, 'あ'.repeat(NAME_MAX_LENGTH + 1), {
      participantId: 'p2',
      token: 't2',
    });

    // Then
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'invalid-name',
      message: `名前は 1〜${NAME_MAX_LENGTH} 文字で入力してください`,
    });
  });
});
