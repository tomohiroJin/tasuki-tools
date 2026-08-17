// 招待リンクの生死をその場で知る（#76 J-1）
//
// これまで、終了したルームの招待リンクを開いても参加フォームが出て、名前を入れて
// 「参加する」を押して初めて「ルームが見つかりません」になった。参加を試みるまで
// サーバーへ問い合わせないためで、死んだリンクと生きたリンクが見分けられなかった。
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { startServer, WsClient, isType, type TestServer } from './helpers';

let server: TestServer;

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await server.stop();
});

interface Joined {
  type: 'joined';
  roomId: string;
}

interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

describe('check-room（#76 J-1）', () => {
  it('存在しないルームの照会には room-not-found を返す', async () => {
    // Given: 終了した（または存在しない）ルームの招待リンク
    const guest = await WsClient.connect(server.port);

    // When: 参加する前に生死を尋ねる
    guest.send({ type: 'check-room', roomId: 'deadbeef' });

    // Then: 名前を入れる前に、無いと分かる
    const err = (await guest.nextMatching(isType('error'))) as ErrorMessage;
    expect(err.code).toBe('room-not-found');
    guest.close();
  });

  it('存在するルームの照会には何も返さない（参加フォームをそのまま出す）', async () => {
    // Given: 生きているルーム
    const host = await WsClient.connect(server.port);
    host.send({ type: 'create-room', name: 'たろう' });
    const joined = (await host.nextMatching(isType('joined'))) as Joined;

    // When: 別の人が参加する前に生死を尋ねる
    const guest = await WsClient.connect(server.port);
    guest.send({ type: 'check-room', roomId: joined.roomId });

    // Then: エラーは返らない。無音＝生きている
    // （生存を伝える新しいメッセージを足さずに済ませる。画面は参加フォームのままでよい）
    await expect(guest.nextMatching(isType('error'), 400)).rejects.toThrow();
    host.close();
    guest.close();
  });

  it('照会だけでは参加者にならない', async () => {
    // Given: 生きているルーム
    const host = await WsClient.connect(server.port);
    host.send({ type: 'create-room', name: 'たろう' });
    const joined = (await host.nextMatching(isType('joined'))) as Joined;
    await host.nextMatching(isType('room-state'));

    // When: 別の人が照会する
    const guest = await WsClient.connect(server.port);
    guest.send({ type: 'check-room', roomId: joined.roomId });

    // Then: 参加者は増えない。照会は読み取りだけで、
    // 招待リンクを開いただけの人が席に着いてしまってはいけない
    await expect(host.nextMatching(isType('room-state'), 400)).rejects.toThrow();
    host.close();
    guest.close();
  });

  it('参加中のソケットが照会しても、そのルームから切り離されない', async () => {
    // Given: すでに参加している
    const host = await WsClient.connect(server.port);
    host.send({ type: 'create-room', name: 'たろう' });
    const joined = (await host.nextMatching(isType('joined'))) as Joined;
    await host.nextMatching(isType('room-state'));

    // When: 同じ接続で別ルームの生死を尋ねる（SPA で別の招待リンクを踏む等）
    host.send({ type: 'check-room', roomId: 'deadbeef' });
    await host.nextMatching(isType('error'));

    // Then: 元のルームでの操作は引き続き通る（照会は参加状態に触れない）
    host.send({ type: 'vote', card: { kind: 'number', value: 5 } });
    const state = (await host.nextMatching(isType('room-state'))) as { roomId: string };
    expect(state.roomId).toBe(joined.roomId);
    host.close();
  });
});
