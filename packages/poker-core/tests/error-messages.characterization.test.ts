// 特性テスト（#165 PR-2）。**振る舞いを固定するためだけに存在する。**
//
// RoomError の文言は WS に届かない。protocol.ts の NameSchema が name.ts の
// validateName と同じ規則（NAME_MAX_LENGTH を共有）なので、不正な名前は境界で
// 弾かれ、handleCreateRoom / handleJoinRoom の isErr() 分岐には到達しない（2026-08-17 実測）。
//
// それでもこの分岐は残す（docs/adr/0005 が境界検証とドメイン検証の両方を MUST としている）。
// 残す以上、文言も固定しておく。
//
// **#95 S4a で入口が `createRoom` / `joinRoom` の 2 つから `validateName` の 1 つになった。**
// 名簿は `@tasuki/room-core` へ移ったが、名前規則と文言は poker の境界の規則として
// そのまま残っている（値も文言も移設前と同一）。
import { describe, expect, it } from 'vitest';
import { messageForRoomError } from '../src/error-messages';
import { NAME_MAX_LENGTH, validateName } from '../src/name';

describe('RoomError の文言（特性テスト）', () => {
  it('名前が空なら invalid-name と定型文を返す', () => {
    // Given: 空の名前を渡す呼び出し自体が前提の指定を兼ねる
    // When
    const result = validateName('   ');

    // Then
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ code: 'invalid-name' });
    expect(messageForRoomError(result._unsafeUnwrapErr())).toBe(
      `名前は 1〜${NAME_MAX_LENGTH} 文字で入力してください`,
    );
  });

  it('名前が長すぎるなら invalid-name と定型文を返す', () => {
    // Given: 上限を 1 文字超える名前を渡す呼び出し自体が前提の指定を兼ねる
    // When
    const result = validateName('あ'.repeat(NAME_MAX_LENGTH + 1));

    // Then
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ code: 'invalid-name' });
    expect(messageForRoomError(result._unsafeUnwrapErr())).toBe(
      `名前は 1〜${NAME_MAX_LENGTH} 文字で入力してください`,
    );
  });
});
