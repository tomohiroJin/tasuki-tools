// 契約テスト観点 #10: 不正メッセージ / join 前の操作はエラー応答（接続維持）
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, WsClient, type TestServer } from './helpers';

let server: TestServer;

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await server.stop();
});

describe('不正メッセージ（FR-015 / 憲法原則 IV）', () => {
  it('JSON でないテキストは invalid-message エラーになり、接続は維持される', async () => {
    const client = await WsClient.connect(server.port);
    client.sendRaw('not-json{{');
    const first = await client.next();
    expect(first).toMatchObject({ type: 'error', code: 'invalid-message' });

    // 接続維持の確認: 続けて送ってもまた応答が返る
    client.sendRaw(JSON.stringify({ type: 'hack' }));
    const second = await client.next();
    expect(second).toMatchObject({ type: 'error', code: 'invalid-message' });
    expect(client.isOpen).toBe(true);
    client.close();
  });

  it('スキーマ違反（デッキ外のカード値）は invalid-message になる', async () => {
    const client = await WsClient.connect(server.port);
    client.send({ type: 'vote', card: { kind: 'number', value: 4 } });
    expect(await client.next()).toMatchObject({ type: 'error', code: 'invalid-message' });
    client.close();
  });
});

describe('join 前の操作は not-joined', () => {
  it.each(['vote', 'reveal', 'next-round'] as const)('%s → not-joined', async (op) => {
    const client = await WsClient.connect(server.port);
    client.send(op === 'vote' ? { type: 'vote', card: { kind: 'coffee' } } : { type: op });
    expect(await client.next()).toMatchObject({ type: 'error', code: 'not-joined' });
    client.close();
  });
});
