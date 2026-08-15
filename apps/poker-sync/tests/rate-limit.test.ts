/**
 * poker-sync の入室失敗レート制限（#103）。
 *
 * poker には合言葉が無く、`check-room` が「無いときだけ応える」形の存在確認である。
 * ルーム ID の総当たりに対する防御はここしか無い。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { DEFAULT_CAPACITY } from '@tasuki/rate-limit';
import { startServer, type TestServer } from './helpers';
import { connectRaw } from './raw-ws-client';


let server: TestServer | undefined;
afterEach(async () => {
  await server?.stop();
  server = undefined;
});

async function startProdServer(): Promise<TestServer> {
  return startServer({
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: 'https://example.com',
    HOST: '127.0.0.1',
  });
}

describe('入室失敗のレート制限', () => {
  it('容量を超えた join-room は rate-limited になる', async () => {
    server = await startProdServer();
    const client = await connectRaw(server.port, {
      origin: 'https://example.com',
      forwardedFor: '203.0.113.7',
    });

    for (let i = 0; i < DEFAULT_CAPACITY; i++) {
      client.send({ type: 'join-room', roomId: `nope${i}`, name: '侵入者' });
      const msg = (await client.nextText()) as { code: string };
      expect(msg.code, `${i} 回目`).toBe('room-not-found');
    }

    client.send({ type: 'join-room', roomId: 'nope-final', name: '侵入者' });
    const msg = (await client.nextText()) as { code: string };

    expect(msg.code).toBe('rate-limited');
    client.close();
  });

  it('check-room も同じバケツを消費する', async () => {
    server = await startProdServer();
    const client = await connectRaw(server.port, {
      origin: 'https://example.com',
      forwardedFor: '203.0.113.7',
    });

    for (let i = 0; i < DEFAULT_CAPACITY; i++) {
      client.send({ type: 'check-room', roomId: `nope${i}` });
      await client.nextText();
    }

    client.send({ type: 'check-room', roomId: 'nope-final' });
    const msg = (await client.nextText()) as { code: string };

    expect(msg.code).toBe('rate-limited');
    client.close();
  });

  it('join-room と check-room を交互に送っても、合算で同じバケツが尽きる', async () => {
    server = await startProdServer();
    const client = await connectRaw(server.port, {
      origin: 'https://example.com',
      forwardedFor: '203.0.113.7',
    });

    // join-room を半分、check-room を残り半分。命令の種類をまたいで
    // 合計 DEFAULT_CAPACITY 回で尽きるなら、バケツが 1 つしか無い証拠になる。
    // バケツが命令ごとに分かれていると、この時点ではまだどちらも尽きない。
    for (let i = 0; i < DEFAULT_CAPACITY; i++) {
      if (i % 2 === 0) {
        client.send({ type: 'join-room', roomId: `nope${i}`, name: '侵入者' });
      } else {
        client.send({ type: 'check-room', roomId: `nope${i}` });
      }
      const msg = (await client.nextText()) as { code: string };
      expect(msg.code, `${i} 回目`).toBe('room-not-found');
    }

    client.send({ type: 'check-room', roomId: 'nope-final' });
    const msg = (await client.nextText()) as { code: string };

    expect(msg.code).toBe('rate-limited');
    client.close();
  });

  it('接続を張り直しても、同じ IP なら残量は引き継がれる', async () => {
    server = await startProdServer();
    const first = await connectRaw(server.port, {
      origin: 'https://example.com',
      forwardedFor: '203.0.113.7',
    });
    for (let i = 0; i < DEFAULT_CAPACITY; i++) {
      first.send({ type: 'join-room', roomId: `nope${i}`, name: '侵入者' });
      await first.nextText();
    }
    first.close();

    // 同じ IP で新しい接続を張る（従来はここで窓がリセットされていた）
    const second = await connectRaw(server.port, {
      origin: 'https://example.com',
      forwardedFor: '203.0.113.7',
    });
    second.send({ type: 'join-room', roomId: 'nope-final', name: '侵入者' });
    const msg = (await second.nextText()) as { code: string };

    expect(msg.code).toBe('rate-limited');
    second.close();
  });

  it('X-Real-Ip を変えても、X-Forwarded-For が同じなら鍵は変わらない（X-Real-Ip は鍵の材料にならない）', async () => {
    server = await startProdServer();
    const first = await connectRaw(server.port, {
      origin: 'https://example.com',
      forwardedFor: '203.0.113.7',
      xRealIp: '198.51.100.1',
    });
    for (let i = 0; i < DEFAULT_CAPACITY; i++) {
      first.send({ type: 'join-room', roomId: `nope${i}`, name: '侵入者' });
      await first.nextText();
    }
    first.close();

    // 同じ X-Forwarded-For・別の X-Real-Ip で繋ぎ直す（従来の X-Real-Ip 経路の壊し方なら
    // ここで鍵が変わり、残量がまっさらに戻ってしまう）
    const second = await connectRaw(server.port, {
      origin: 'https://example.com',
      forwardedFor: '203.0.113.7',
      xRealIp: '203.0.113.99',
    });
    second.send({ type: 'join-room', roomId: 'nope-final', name: '侵入者' });
    const msg = (await second.nextText()) as { code: string };

    expect(msg.code).toBe('rate-limited');
    second.close();
  });

  it('別の IP は独立している', async () => {
    server = await startProdServer();
    const a = await connectRaw(server.port, {
      origin: 'https://example.com',
      forwardedFor: '203.0.113.7',
    });
    for (let i = 0; i < DEFAULT_CAPACITY; i++) {
      a.send({ type: 'join-room', roomId: `nope${i}`, name: '侵入者' });
      await a.nextText();
    }

    const b = await connectRaw(server.port, {
      origin: 'https://example.com',
      forwardedFor: '198.51.100.9',
    });
    b.send({ type: 'join-room', roomId: 'nope-final', name: '通行人' });
    const msg = (await b.nextText()) as { code: string };

    expect(msg.code).toBe('room-not-found');
    a.close();
    b.close();
  });

  it('残量が無いとき、実在するルームでも rate-limited を返す（照会より前に判定する）', async () => {
    server = await startProdServer();
    const host = await connectRaw(server.port, {
      origin: 'https://example.com',
      forwardedFor: '198.51.100.1',
    });
    host.send({ type: 'create-room', name: 'ホスト' });
    const joined = (await host.nextText()) as { type: string; roomId: string };
    expect(joined.type).toBe('joined');

    const attacker = await connectRaw(server.port, {
      origin: 'https://example.com',
      forwardedFor: '203.0.113.7',
    });
    for (let i = 0; i < DEFAULT_CAPACITY; i++) {
      attacker.send({ type: 'join-room', roomId: `nope${i}`, name: '侵入者' });
      await attacker.nextText();
    }

    attacker.send({ type: 'join-room', roomId: joined.roomId, name: '侵入者' });
    const msg = (await attacker.nextText()) as { code: string };

    expect(msg.code).toBe('rate-limited');
    host.close();
    attacker.close();
  });
});
