/**
 * 起動ログ（`server.ts` の "listening" イベント）に出すフィールドのテスト
 * （#103 Task 7 レビュー S-3）。
 *
 * poker の listening 行はこれまで `{"event":"listening","port":N}` だけで、
 * 本番の fail-closed（requireClientAddress・loopbackOnly）が実際に有効かを
 * journal から確認する手段が無かった。timer-sync の `listening-log.ts` と
 * 同じ理由（`server.ts` は import 時に副作用が走るエントリポイント）で、
 * フィールドの組み立てだけを純粋関数として切り出す。
 */
import { describe, it, expect } from 'bun:test';
import { loadPokerSyncConfig } from '../src/config';
import { buildListeningLogFields } from '../src/listening-log';

describe('buildListeningLogFields', () => {
  it('port をそのまま含める', () => {
    // Given
    const config = loadPokerSyncConfig({});
    // When
    const fields = buildListeningLogFields(config, 12345);
    // Then
    expect(fields['port']).toBe(12345);
  });

  it('requireClientAddress を真偽値として含める（本番）', () => {
    // Given
    const config = loadPokerSyncConfig({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://tasuki.example.com',
      HOST: '127.0.0.1',
    });
    // When
    const fields = buildListeningLogFields(config, 1);
    // Then
    expect(fields['requireClientAddress']).toBe(true);
  });

  it('本番でなければ requireClientAddress=false', () => {
    // Given
    const config = loadPokerSyncConfig({});
    // When
    const fields = buildListeningLogFields(config, 1);
    // Then
    expect(fields['requireClientAddress']).toBe(false);
  });

  it.each(['127.0.0.1', 'localhost', '::1', '[::1]', '127.1.2.3'])(
    'loopbackOnly は isLoopbackHost と同じ判定になる（HOST=%s）',
    (host) => {
      // Given
      const config = loadPokerSyncConfig({
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: 'https://tasuki.example.com',
        HOST: host,
      });
      // When
      const fields = buildListeningLogFields(config, 1);
      // Then
      expect(fields['loopbackOnly']).toBe(true);
    },
  );

  it('ループバック外の HOST では loopbackOnly=false', () => {
    // Given
    const config = loadPokerSyncConfig({ HOST: '0.0.0.0' });
    // When
    const fields = buildListeningLogFields(config, 1);
    // Then
    expect(fields['loopbackOnly']).toBe(false);
  });
});
