/**
 * poker-sync の本番 fail-closed（#103・設計正本 D6）。
 * timer-sync と同じ規律を poker にも入れる。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { loadPokerSyncConfig } from '../src/config';
import { startServer, type TestServer } from './helpers';
import { connectRaw } from './raw-ws-client';

let server: TestServer | undefined;
afterEach(async () => {
  await server?.stop();
  server = undefined;
});

describe('起動時の fail-closed（HOST）', () => {
  it('本番でループバック以外を指定すると起動を拒否する', () => {
    expect(() =>
      loadPokerSyncConfig({
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: 'https://example.com',
        HOST: '0.0.0.0',
      }),
    ).toThrow(/HOST/);
  });

  it('本番でも 127.0.0.1 なら通る', () => {
    const config = loadPokerSyncConfig({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://example.com',
      HOST: '127.0.0.1',
    });
    expect(config.host).toBe('127.0.0.1');
  });

  it('本番以外なら 0.0.0.0 でも通る', () => {
    expect(loadPokerSyncConfig({ HOST: '0.0.0.0' }).host).toBe('0.0.0.0');
  });
});

describe('接続時の fail-closed（X-Forwarded-For）', () => {
  it('本番でヘッダが無い接続は Origin 拒否とは違う理由で閉じられる', async () => {
    server = await startServer({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://example.com',
      HOST: '127.0.0.1',
    });
    const client = await connectRaw(server.port);

    const closed = await client.waitForClose();

    expect(closed.code).toBe(1008);
    expect(closed.reason).toBe('Client address required');
  });

  it('本番でヘッダがあれば繋がる', async () => {
    server = await startServer({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://example.com',
      HOST: '127.0.0.1',
    });
    const client = await connectRaw(server.port, {
      origin: 'https://example.com',
      forwardedFor: '203.0.113.7',
    });

    client.send({ type: 'create-room', name: 'テスト' });
    const msg = (await client.nextText()) as { type: string };

    expect(msg.type).toBe('joined');
    client.close();
  });
});
