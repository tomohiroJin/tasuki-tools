/**
 * 統合サーバーの本番 fail-closed を **poker の入口（`/poker/ws`）から**確かめる
 * （#103・設計正本 D6）。
 *
 * 起動時の検査（HOST・ALLOWED_ORIGINS）は `test/fail-closed.test.ts` と同じ
 * `loadSyncConfig` を見るので重なる。**残しているのは接続時の検査のほう**で、
 * こちらは生ソケット（`raw-ws-client.ts`）で `/poker/ws` へ繋ぐ。#95 S2 の統合で
 * 接続層は 1 つになったが、**パスの振り分けを含めて塞がっていること**は
 * timer 側の入口を見るテストでは確かめられない。
 */
import { describe, it, expect, afterEach } from 'bun:test';
import { loadSyncConfig } from '../../src/config.js';
import { startServer, type TestServer } from './helpers';
import { connectRaw } from './raw-ws-client';

let server: TestServer | undefined;
afterEach(async () => {
  await server?.stop();
  server = undefined;
});

describe('起動時の fail-closed（HOST）', () => {
  it('本番でループバック以外を指定すると起動を拒否する', () => {
    // Given: 渡す NODE_ENV・ALLOWED_ORIGINS・HOST 自体が前提の指定を兼ねる
    // When / Then（読み込みが throw するので操作と検証が同じ式になる）
    expect(() =>
      loadSyncConfig({
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: 'https://example.com',
        HOST: '0.0.0.0',
      }),
    ).toThrow(/HOST/);
  });

  it('本番でも 127.0.0.1 なら通る', () => {
    // Given: 渡す NODE_ENV・ALLOWED_ORIGINS・HOST 自体が前提の指定を兼ねる
    // When
    const config = loadSyncConfig({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://example.com',
      HOST: '127.0.0.1',
    });
    // Then
    expect(config.host).toBe('127.0.0.1');
  });

  it('本番以外なら 0.0.0.0 でも通る', () => {
    expect(loadSyncConfig({ HOST: '0.0.0.0' }).host).toBe('0.0.0.0');
  });
});

describe('接続時の fail-closed（X-Forwarded-For）', () => {
  it('本番でヘッダが無い接続は Origin 拒否とは違う理由で閉じられる', async () => {
    // Given
    server = await startServer({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://example.com',
      HOST: '127.0.0.1',
    });
    const client = await connectRaw(server.port);

    // When
    const closed = await client.waitForClose();

    // Then
    expect(closed.code).toBe(1008);
    expect(closed.reason).toBe('Client address required');
  });

  it('本番で X-Real-Ip だけを付けても、X-Forwarded-For が無ければ拒否される（X-Real-Ip は鍵の材料にならない）', async () => {
    // Given
    server = await startServer({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://example.com',
      HOST: '127.0.0.1',
    });
    const client = await connectRaw(server.port, {
      origin: 'https://example.com',
      xRealIp: '203.0.113.7',
    });

    // When
    const closed = await client.waitForClose();

    // Then
    expect(closed.code).toBe(1008);
    expect(closed.reason).toBe('Client address required');
  });

  it('本番でヘッダがあれば繋がる', async () => {
    // Given
    server = await startServer({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://example.com',
      HOST: '127.0.0.1',
    });
    const client = await connectRaw(server.port, {
      origin: 'https://example.com',
      forwardedFor: '203.0.113.7',
    });

    // When
    client.send({ type: 'create-room', name: 'テスト' });
    const msg = (await client.nextText()) as { type: string };

    // Then
    expect(msg.type).toBe('joined');
    client.close();
  });
});
