/**
 * 参加用 URL の読み書き（#95 S5a・D11）。
 */
import { describe, it, expect } from 'vitest';
import { readRoomParam, stripRoomParam } from '../../src/hub/room-param.js';
import { buildInviteUrl } from '../../src/hub/invite-url.js';

describe('room クエリの読み取り', () => {
  it('Given 参加用 URL / When room を読む / Then ルームコードが取れる', () => {
    expect(readRoomParam('https://tasuki.example/?room=ABC123')).toBe('ABC123');
  });

  it('Given 日本語を含むルームコード / When room を読む / Then 復号して取れる', () => {
    // Given（準備）: ルーム名がそのままコードに入る（例: 朝会モブ-a1b2）
    const href = 'https://tasuki.example/?room=%E6%9C%9D%E4%BC%9A%E3%83%A2%E3%83%96-a1b2';

    // When / Then（操作）
    expect(readRoomParam(href)).toBe('朝会モブ-a1b2');
  });

  it('Given room の無い URL / When room を読む / Then null', () => {
    expect(readRoomParam('https://tasuki.example/')).toBeNull();
  });

  it('Given room が空文字 / When room を読む / Then null（空のコードで参加させない）', () => {
    expect(readRoomParam('https://tasuki.example/?room=')).toBeNull();
  });

  it('Given 参加用 URL / When room を取り除く / Then 入口の URL に戻る', () => {
    expect(stripRoomParam('https://tasuki.example/?room=ABC123')).toBe('https://tasuki.example/');
  });
});

describe('参加用 URL の組み立て', () => {
  it('Given オリジンとコード / When 組み立てる / Then ルート直下の ?room= になる', () => {
    // Given（準備）: 配る URL の形（D11・ADR-0018 決定 2）

    // When（操作）
    const url = buildInviteUrl('https://tasuki.example', 'ABC123');

    // Then: **ツールの配下ではない**。入口は LP に一本化された
    expect(url).toBe('https://tasuki.example/?room=ABC123');
  });

  it('Given 日本語を含むコード / When 組み立てる / Then 符号化される', () => {
    // Given（準備）: 素の文字列連結では壊れる
    const url = buildInviteUrl('https://tasuki.example', '朝会モブ-a1b2');

    // When / Then（操作）: 読み返すと元のコードに戻る
    expect(readRoomParam(url)).toBe('朝会モブ-a1b2');
  });
});
