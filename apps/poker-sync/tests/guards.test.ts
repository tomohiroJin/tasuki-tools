/**
 * 接続・フレーム層の防御（Issue #63）。
 *
 * 内容の検証（Valibot）より手前で効く層を対象にする。
 * `src/server.ts` はモジュール読み込み時に `process.env` から config を読むので、
 * サブプロセス起動のこのテストでは上限値を環境変数で注入する
 * （詳しくは tests/helpers.ts の冒頭）。
 */
import net from 'node:net';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'bun:test';
import { isType, startServer, waitForLine, WsClient, type TestServer } from './helpers';
import { connectRaw, type RawWsClient } from './raw-ws-client';

/** この環境の非ループバックな IPv4。無ければ待ち受け範囲の検証はできない */
const EXTERNAL_IP = Object.values(os.networkInterfaces())
  .flat()
  .find((iface) => iface?.family === 'IPv4' && !iface.internal)?.address;

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

/**
 * 接続が受理されるまで短い間隔で試し、受理された接続を返す。
 * 受理の判定は「create-room に応答が返る」こと、拒否の判定は「close が届く」こと。
 */
async function connectUntilAccepted(
  port: number,
  name: string,
  timeoutMs = 8_000,
): Promise<RawWsClient> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const client = await raw(port, {});
    client.send({ type: 'create-room', name });
    const accepted = await Promise.race([
      client
        .nextText(500)
        .then(() => true)
        .catch(() => false),
      client
        .waitForClose(500)
        .then(() => false)
        .catch(() => false),
    ]);
    if (accepted) return client;
    client.close();
    if (Date.now() >= deadline) throw new Error('切断後も接続枠が解放されなかった');
  }
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

  it('許可されていない Origin の拒否は journal からも見える（S-4・reason=origin）', async () => {
    // Given: 1 つの Origin だけを許可したサーバー
    server = await startServer({ ALLOWED_ORIGINS: 'https://ok.example' });

    // When: 別の Origin から接続する
    const client = await raw(server.port, { origin: 'https://evil.example' });
    await client.waitForClose();

    // Then: client-address 拒否と同じ形の 1 行が出る（列挙値だけ。Origin の値は載らない）。
    // 運用者が journal から気づけないと #103・#66 でこの非対称に気づけない（S-4）。
    const line = await waitForLine(server.stdoutLines, (l) => l.includes('"conn-rejected"'));
    expect(line).toContain('"reason":"origin"');
    expect(line).not.toContain('evil.example');
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

describe('本番の fail-closed', () => {
  it('ALLOWED_ORIGINS が空のまま本番起動しようとするとサーバーは起動しない', async () => {
    // Given / When: 設定漏れのまま本番として起動する
    const startup = startServer({ NODE_ENV: 'production', ALLOWED_ORIGINS: '' });

    // Then: 黙って全 Origin を許可するのではなく、理由を出して落ちる。
    // 検証を config の単体テストで終わらせず、プロセスとして起動しないことまで見る
    await expect(startup).rejects.toThrow(/ALLOWED_ORIGINS/);
  });

  it('ALLOWED_ORIGINS があれば本番でも起動する', async () => {
    server = await startServer({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://ok.example' });

    // 本番はクライアント鍵の検査（#103）も有効になるため、Origin だけでなく
    // X-Forwarded-For も付ける（このテストの主眼は「起動する」ことであり、
    // クライアント鍵の検査は tests/fail-closed.test.ts が別途見る）。
    const client = await raw(server.port, {
      origin: 'https://ok.example',
      forwardedFor: '203.0.113.9',
    });
    client.send({ type: 'create-room', name: 'たろう' });
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

  it('フレーム上限を超えるものはプロトコル層で切断される（返答の余地が無い帯域）', async () => {
    // Given: メッセージ上限 200 バイト → フレーム上限は 2 倍の 400 バイト
    server = await startServer({ MAX_MESSAGE_BYTES: '200' });
    const client = await ws(server.port);

    // When: フレーム上限そのものを超える
    client.sendRaw('x'.repeat(500));

    // Then: ここはアプリに届かないため、エラー応答ではなく切断になる。
    // 「超過はエラー応答・接続維持」が成り立つのは上限〜フレーム上限の帯域まで
    await expect(client.waitForClose()).resolves.toBeUndefined();
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

    // When: 受理済みの接続を閉じてから張り直す。
    // クライアント側の切断をサーバーが観測するのは非同期なので、
    // 「受け入れられるまで試す」形にする。要件は「いつか枠が戻る」ことであって、
    // 「即座に戻る」ことではない（即時性を仮定すると実行環境の速度で揺れる）。
    first.close();

    // Then
    const replacement = await connectUntilAccepted(server.port, 'はなこ');
    expect(replacement).toBeDefined();
  });
});

describe('待ち受けアドレス', () => {
  /** 指定アドレスの TCP ポートに到達できるか。接続できれば true */
  function canReach(host: string, port: number, timeoutMs = 2_000): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.connect({ host, port });
      const done = (reachable: boolean): void => {
        socket.destroy();
        resolve(reachable);
      };
      socket.setTimeout(timeoutMs, () => done(false));
      socket.once('connect', () => done(true));
      socket.once('error', () => done(false));
    });
  }

  it.skipIf(EXTERNAL_IP === undefined)(
    '既定ではループバックのみで待ち受ける（Caddy を迂回した直接接続を塞ぐ）',
    async () => {
      // Given: HOST を指定しない既定の起動
      server = await startServer({});

      // Then: ループバックからは届くが、外向きのアドレスからは届かない
      expect(await canReach('127.0.0.1', server.port)).toBe(true);
      expect(await canReach(EXTERNAL_IP!, server.port)).toBe(false);
    },
  );

  it.skipIf(EXTERNAL_IP === undefined)('HOST を指定すればその範囲で待ち受ける', async () => {
    // Given: 全インタフェースを明示指定
    server = await startServer({ HOST: '0.0.0.0' });

    // Then: 上のテストが「そもそも到達できない環境だから緑」ではないことを示す対照
    expect(await canReach(EXTERNAL_IP!, server.port)).toBe(true);
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

  it(
    '自分自身への join-room 再送でルームが消えても、レジストリの枠は空いたままになる（#165 レビュー）',
    async () => {
      // Given: ルームは 1 つまで。host はこのルーム唯一の接続
      server = await startServer({ MAX_ROOMS: '1' });
      const host = await ws(server.port);
      host.send({ type: 'create-room', name: 'たろう' });
      const joined = (await host.nextMatching(isType('joined'))) as { roomId: string };

      // When: host が同じ socket・同じ roomId へ join-room を再送する（二重送信・SPA 遷移）。
      // detachFromCurrentRoom はこのルームの接続者が host だけなので即時破棄する経路を通る。
      // このルーム自体が消える（当人には joined が返るのにルームが無くなる）のは
      // 元からある経路の欠陥であり、振る舞い変更になるため本テストでは直さない。
      // ここで確かめるのは「レジストリの枠が空いたままになるか」だけ。
      host.send({ type: 'join-room', roomId: joined.roomId, name: 'たろう' });
      await host.nextMatching(isType('joined'));

      // Then: 枠は空いているので、別の接続が新しいルームを作れる
      const other = await ws(server.port);
      other.send({ type: 'create-room', name: 'はなこ' });
      expect(await other.nextMatching(isType('joined'))).toMatchObject({ type: 'joined' });
    },
  );
});

describe('起動ログ（listening）のフィールド（S-3）', () => {
  it('本番では requireClientAddress=true・loopbackOnly=true が listening 行に出る', async () => {
    server = await startServer({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://ok.example',
      HOST: '127.0.0.1',
    });
    const line = server.stdoutLines.find((l) => l.includes('"listening"'));
    expect(line).toBeDefined();
    const parsed = JSON.parse(line!) as Record<string, unknown>;
    expect(parsed['requireClientAddress']).toBe(true);
    expect(parsed['loopbackOnly']).toBe(true);
    expect(parsed['port']).toBe(server.port);
  });

  it('開発時は requireClientAddress=false が listening 行に出る', async () => {
    server = await startServer({});
    const line = server.stdoutLines.find((l) => l.includes('"listening"'));
    expect(line).toBeDefined();
    const parsed = JSON.parse(line!) as Record<string, unknown>;
    expect(parsed['requireClientAddress']).toBe(false);
  });
});
