// 特性テスト（#165 PR-2）。**振る舞いを固定するためだけに存在する。**
//
// エラー型から message を外す（docs/adr/0016 決定 2 項目 3）作業の前に、
// WS で送っている文言をここへ写し取る。poker-core のテストは code しか見ておらず、
// このファイルが無いと文言を書き換えても全テストが緑のまま通る（2026-08-17 実測）。
//
// **RoomError の文言はここに無い。** protocol.ts の NameSchema が room.ts の
// validateName と同じ規則なので、不正な名前は境界で弾かれ WS には届かない（実測）。
// そちらは packages/poker-core 側の特性テストで固定する。
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { startServer, WsClient, isType, type TestServer } from './helpers';

let server: TestServer;

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await server.stop();
});

/** ホスト 1 人のルームを作る（1 人なので投票すると即 revealed になる） */
async function soloRoom() {
  const host = await WsClient.connect(server.port);
  host.send({ type: 'create-room', name: 'たろう' });
  await host.nextMatching(isType('joined'));
  await host.nextMatching(isType('room-state'));
  return host;
}

/** ホストとゲストが居るルームを作る（どちらも未投票） */
async function pairRoom() {
  const host = await WsClient.connect(server.port);
  host.send({ type: 'create-room', name: 'たろう' });
  const joined = (await host.nextMatching(isType('joined'))) as { roomId: string };
  await host.nextMatching(isType('room-state'));

  const guest = await WsClient.connect(server.port);
  guest.send({ type: 'join-room', roomId: joined.roomId, name: 'はなこ' });
  await guest.nextMatching(isType('joined'));
  await guest.nextMatching(isType('room-state'));
  await host.nextMatching(isType('room-state'));
  return { host, guest };
}

describe('WS が送るドメインエラーの文言（特性テスト）', () => {
  it('公開後の vote は not-voting「現在は投票を受け付けていません」', async () => {
    // Given: 1 人だけのルームで投票し、自動公開まで進める
    const host = await soloRoom();
    host.send({ type: 'vote', card: { kind: 'number', value: 5 } });
    await host.nextMatching(
      (m) => (m as { round?: { status?: string } }).round?.status === 'revealed',
    );

    // When: 公開後にもう一度投票する
    host.send({ type: 'vote', card: { kind: 'number', value: 8 } });

    // Then
    expect(await host.nextMatching(isType('error'))).toEqual({
      type: 'error',
      code: 'not-voting',
      message: '現在は投票を受け付けていません',
    });
    host.close();
  });

  it('公開後の reveal は not-voting「すでに公開されています」', async () => {
    // Given: 公開済みのルーム
    const host = await soloRoom();
    host.send({ type: 'vote', card: { kind: 'number', value: 5 } });
    await host.nextMatching(
      (m) => (m as { round?: { status?: string } }).round?.status === 'revealed',
    );

    // When: もう一度公開する
    host.send({ type: 'reveal' });

    // Then: 同じ not-voting でも文言が違う（code だけでは復元できない）
    expect(await host.nextMatching(isType('error'))).toEqual({
      type: 'error',
      code: 'not-voting',
      message: 'すでに公開されています',
    });
    host.close();
  });

  it('非ホストの reveal は not-host「ホストのみが公開できます」', async () => {
    // Given
    const { host, guest } = await pairRoom();

    // When
    guest.send({ type: 'reveal' });

    // Then
    expect(await guest.nextMatching(isType('error'))).toEqual({
      type: 'error',
      code: 'not-host',
      message: 'ホストのみが公開できます',
    });
    host.close();
    guest.close();
  });

  it('非ホストの next-round は not-host「ホストのみが次のラウンドを開始できます」', async () => {
    // Given
    const { host, guest } = await pairRoom();

    // When
    guest.send({ type: 'next-round' });

    // Then: 同じ not-host でも文言が違う
    expect(await guest.nextMatching(isType('error'))).toEqual({
      type: 'error',
      code: 'not-host',
      message: 'ホストのみが次のラウンドを開始できます',
    });
    host.close();
    guest.close();
  });

  it('投票中の next-round は not-revealed「票の公開後にのみ次のラウンドを開始できます」', async () => {
    // Given: まだ公開していないルーム
    const host = await soloRoom();

    // When
    host.send({ type: 'next-round' });

    // Then
    expect(await host.nextMatching(isType('error'))).toEqual({
      type: 'error',
      code: 'not-revealed',
      message: '票の公開後にのみ次のラウンドを開始できます',
    });
    host.close();
  });
});
