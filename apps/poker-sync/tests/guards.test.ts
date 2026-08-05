/**
 * 接続・フレーム層の防御（Issue #63）。
 *
 * 内容の検証（Valibot）より手前で効く層を対象にする。
 * サーバーは in-process に起動できない（Bun.serve は Bun ランタイム専用）ため、
 * 上限値はサブプロセスの環境変数で注入する。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { isType, startServer, WsClient, type TestServer } from './helpers';
import { connectRaw, type RawWsClient } from './raw-ws-client';

let server: TestServer | undefined;
const openRaw: RawWsClient[] = [];
const openWs: WsClient[] = [];

afterEach(async () => {
  for (const client of openRaw) client.close();
  openRaw.length = 0;
  for (const client of openWs) client.close();
  openWs.length = 0;
  await server?.stop();
  server = undefined;
});

async function raw(port: number, options?: Parameters<typeof connectRaw>[1]): Promise<RawWsClient> {
  const client = await connectRaw(port, options);
  openRaw.push(client);
  return client;
}

async function ws(port: number): Promise<WsClient> {
  const client = await WsClient.connect(port);
  openWs.push(client);
  return client;
}

describe('Origin 検査', () => {
  it('許可されていない Origin の接続は 1008 で閉じられる', async () => {
    // Given: 1 つの Origin だけを許可したサーバー
    server = await startServer({ ALLOWED_ORIGINS: 'https://ok.example' });

    // When: 別の Origin から接続する
    const client = await raw(server.port, { origin: 'https://evil.example' });

    // Then: 理由を伴った close がクライアントに届く
    // （ハンドシェイクを拒否すると「接続失敗」としか見えず、理由が届かない）
    const closed = await client.waitForClose();
    expect(closed.code).toBe(1008);
  });

  it('許可された Origin の接続は通常どおり利用できる', async () => {
    // Given
    server = await startServer({ ALLOWED_ORIGINS: 'https://ok.example' });

    // When
    const client = await raw(server.port, { origin: 'https://ok.example' });
    client.send({ type: 'create-room', name: 'たろう' });

    // Then
    expect(await client.nextText()).toMatchObject({ type: 'joined' });
  });

  it('ALLOWED_ORIGINS が未設定なら Origin を送らない接続も通す（開発時の既定）', async () => {
    // Given: 本番以外では全許可。fail-closed は config が本番でのみ強制する
    server = await startServer({});

    // When
    const client = await raw(server.port, {});
    client.send({ type: 'create-room', name: 'たろう' });

    // Then
    expect(await client.nextText()).toMatchObject({ type: 'joined' });
  });
});

describe('メッセージサイズ制限', () => {
  it('上限を超えるメッセージは message-too-large になり、接続は保たれる', async () => {
    // Given: 上限 200 バイト
    server = await startServer({ MAX_MESSAGE_BYTES: '200' });
    const client = await ws(server.port);

    // When: 上限を超える生テキストを送る
    client.sendRaw('x'.repeat(300));

    // Then: エラーが返る
    expect(await client.next()).toMatchObject({ type: 'error', code: 'message-too-large' });

    // And: 接続は切られておらず、通常の操作を続けられる（切断ではなくエラー応答）
    client.send({ type: 'create-room', name: 'たろう' });
    expect(await client.nextMatching(isType('joined'))).toMatchObject({ type: 'joined' });
  });

  it('上限は文字数ではなくバイト数で測る（日本語で制限が緩まない）', async () => {
    // Given: 上限 200 バイト
    server = await startServer({ MAX_MESSAGE_BYTES: '200' });
    const client = await ws(server.port);

    // When: 100 文字の日本語 = 300 バイト。文字数で測る実装なら 100 で通ってしまう
    client.sendRaw('あ'.repeat(100));

    // Then
    expect(await client.next()).toMatchObject({ type: 'error', code: 'message-too-large' });
  });

  it('上限以下のメッセージはそのまま処理される', async () => {
    // Given
    server = await startServer({ MAX_MESSAGE_BYTES: '200' });
    const client = await ws(server.port);

    // When
    client.send({ type: 'create-room', name: 'たろう' });

    // Then
    expect(await client.next()).toMatchObject({ type: 'joined' });
  });
});

describe('同時接続数の上限', () => {
  it('上限を超えた接続は 1013 で拒否される', async () => {
    // Given: 同時 1 接続まで
    server = await startServer({ MAX_CONNECTIONS: '1' });
    const first = await raw(server.port, {});
    first.send({ type: 'create-room', name: 'たろう' });
    await first.nextText(); // 1 本目が受理されたことを確定させてから 2 本目を張る

    // When
    const second = await raw(server.port, {});

    // Then: 再試行を促す 1013（Try Again Later）で閉じられる
    const closed = await second.waitForClose();
    expect(closed.code).toBe(1013);
  });

  it('拒否された接続は上限の枠を占有しない（切断後に新しい接続を受け入れられる）', async () => {
    // Given
    server = await startServer({ MAX_CONNECTIONS: '1' });
    const first = await raw(server.port, {});
    first.send({ type: 'create-room', name: 'たろう' });
    await first.nextText();
    const rejected = await raw(server.port, {});
    await rejected.waitForClose();

    // When: 受理済みの接続を閉じてから張り直す
    first.close();
    const replacement = await raw(server.port, {});
    replacement.send({ type: 'create-room', name: 'はなこ' });

    // Then
    expect(await replacement.nextText()).toMatchObject({ type: 'joined' });
  });
});

describe('ルーム数の上限', () => {
  it('上限に達した状態での create-room は server-busy になる', async () => {
    // Given: ルームは 1 つまで
    server = await startServer({ MAX_ROOMS: '1' });
    const host = await ws(server.port);
    host.send({ type: 'create-room', name: 'たろう' });
    await host.nextMatching(isType('joined'));

    // When: 別の接続がもう 1 つルームを作ろうとする
    const other = await ws(server.port);
    other.send({ type: 'create-room', name: 'はなこ' });

    // Then
    expect(await other.next()).toMatchObject({ type: 'error', code: 'server-busy' });
  });

  it('上限に達していても既存ルームへの参加は妨げられない', async () => {
    // Given
    server = await startServer({ MAX_ROOMS: '1' });
    const host = await ws(server.port);
    host.send({ type: 'create-room', name: 'たろう' });
    const joined = (await host.nextMatching(isType('joined'))) as { roomId: string };

    // When
    const guest = await ws(server.port);
    guest.send({ type: 'join-room', roomId: joined.roomId, name: 'はなこ' });

    // Then: 上限は新規作成だけを止める
    expect(await guest.nextMatching(isType('joined'))).toMatchObject({ type: 'joined' });
  });
});
