/**
 * サーバー主導の死活監視（Issue #63。timer の #25 と同じ設計）。
 *
 * ## 何を検証するか
 *
 * 「切断された」ことを内部状態ではなく **他の参加者から見た表示**（connected: false）で
 * 確かめる。#63 の受け入れ条件がその言葉で書かれており、利用者に届く結果だから。
 *
 * ## 待ち方
 *
 * 経過時間ではなく **サーバーが実際に ping を N 回送った** ことを待って先へ進む。
 * 固定 sleep は「間隔を長くしても緑のまま」になり、何も測らなくなる。
 *
 * ## pong を返さない接続の作り方
 *
 * 通常のクライアントでは作れない（Bun の WebSocket は `autoPong: false` を無視して
 * 必ず pong を返す）。ハンドシェイクを手で行う生 TCP クライアントで、
 * 「何回目の ping に pong を返すか」を直接指定する。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { isType, startServer, WsClient, type TestServer } from './helpers';
import { connectRaw, type RawWsClient } from './raw-ws-client';

/** 短い間隔で回し、2 回の欠落を許容する設定。3 回目の interval で切断に至る */
const FAST_HEARTBEAT = { HEARTBEAT_INTERVAL_MS: '30', HEARTBEAT_MAX_MISSES: '2' };

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

interface Participants {
  participants: Array<{ name: string; connected: boolean }>;
}

/** 名前で参加者を引く。見つからなければ undefined */
function participant(state: unknown, name: string): { connected: boolean } | undefined {
  return (state as Participants).participants.find((p) => p.name === name);
}

/**
 * ホスト役を 1 人置き、そこへ「pong の返し方を指定した」参加者を join させる。
 * 戻り値の host で、その参加者が他人からどう見えているかを観測する。
 */
async function roomWithGhost(
  port: number,
  shouldPong: (nth: number) => boolean,
): Promise<{ host: WsClient; ghost: RawWsClient }> {
  const host = await WsClient.connect(port);
  openWs.push(host);
  host.send({ type: 'create-room', name: 'ホスト' });
  const joined = (await host.nextMatching(isType('joined'))) as { roomId: string };

  const ghost = await connectRaw(port, { shouldPong });
  openRaw.push(ghost);
  ghost.send({ type: 'join-room', roomId: joined.roomId, name: 'ゆうれい' });
  await ghost.nextText(); // joined を待って参加成立を確定させる

  // ホスト側のキューを参加成立の配信まで読み進める。ここで捨てておかないと、
  // 以降の観測が create-room 時点の古い room-state（ゆうれい未参加）を拾ってしまう。
  await host.nextMatching(
    (msg) => isType('room-state')(msg) && participant(msg, 'ゆうれい') !== undefined,
  );

  return { host, ghost };
}

describe('死活監視', () => {
  it('pong を返さない参加者は、他の参加者から disconnected に見えるようになる', async () => {
    // Given: 短い間隔のハートビートと、pong を一切返さない参加者（半開き接続の再現）
    server = await startServer(FAST_HEARTBEAT);
    const { host } = await roomWithGhost(server.port, () => false);

    // When / Then: 欠落を重ねた末に切断され、その結果がホストの画面に届く
    const state = await host.nextMatching(
      (msg) => isType('room-state')(msg) && participant(msg, 'ゆうれい')?.connected === false,
      3_000,
    );
    expect(participant(state, 'ゆうれい')?.connected).toBe(false);
  });

  it('pong を返し続ける参加者は、許容回数を超えても connected のまま残る', async () => {
    // Given
    server = await startServer(FAST_HEARTBEAT);
    const { host, ghost } = await roomWithGhost(server.port, () => true);

    // When: 許容ミス回数（2 回）を大きく超える 10 回分の ping 往復を待つ
    await ghost.waitForPings(10);

    // Then: 配信を 1 つ起こして、そのときの見え方を確かめる
    // （「何も来ない」ことの確認は、配信が止まっているだけでも緑になるため使わない）
    host.send({ type: 'vote', card: { kind: 'number', value: 5 } });
    const state = await host.nextMatching(isType('room-state'));
    expect(participant(state, 'ゆうれい')?.connected).toBe(true);
  });

  it('1 回だけ pong が欠落しても切断しない（一時的な揺れで誤検出しない）', async () => {
    // Given: 2 回目の ping にだけ pong を返さない
    server = await startServer(FAST_HEARTBEAT);
    const { host, ghost } = await roomWithGhost(server.port, (nth) => nth !== 2);

    // When: 欠落を挟んで 8 回分の ping 往復を待つ
    await ghost.waitForPings(8);

    // Then
    host.send({ type: 'vote', card: { kind: 'number', value: 5 } });
    const state = await host.nextMatching(isType('room-state'));
    expect(participant(state, 'ゆうれい')?.connected).toBe(true);
  });
});
