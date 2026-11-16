// poker のハンドラが「順序」で守っている契約（#596）。
//
// 型では表せない順序（コメントだけで守られていたもの）を、実 WS の in-process サーバーで観測できる形にして守る。
//
// 1. `completeJoin`（`poker-handlers.ts`）: socket 登録 → 接続状態の更新 → joined 送信 → 保管と配信。
//    観測: 入った本人に `joined` が最初の `room-state` より先に届き、その `room-state` が自分を在席（connected）で載せる。
//    順序を崩すと、joined より先に room-state が届く（送信が登録・保管より前に動く）か、
//    自分の room-state が届かない（socket 登録が配信より後になる）。create / 復帰 / 新規 join の 3 経路すべてで見る。
// 2. `handleParticipantRemoved`: 名簿を**呼び出し側が更新し終えた後**に呼ぶ。
//    観測: 幽霊を外した後に届く `room-state` は幽霊を載せず、保管の名簿からも消えている（古い名簿を書き戻して復活させない）。
import { afterEach, describe, expect, it } from 'bun:test';
import {
  startLiveSyncServer,
  type LivePokerClient,
  type LiveSyncServer,
} from '../support/live-sync-server.js';

let server: LiveSyncServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

interface PokerJoined {
  type: 'joined';
  roomId: string;
  participantId: string;
  token: string;
}
interface PokerState {
  type: 'room-state';
  you: string;
  participants: Array<{ id: string; connected: boolean }>;
}

const types = (c: LivePokerClient): string[] => c.received.map((m) => m.type);
const stateOf = (m: unknown) => m as unknown as PokerState;

/** 本人の `joined` と、その後の最初の `room-state` を取り、届いた順序も返す */
async function joinedThenState(c: LivePokerClient): Promise<{ joined: PokerJoined; state: PokerState }> {
  const joined = (await c.take((m) => m.type === 'joined', 'joined')) as unknown as PokerJoined;
  const state = stateOf(await c.take((m) => m.type === 'room-state', 'room-state'));
  return { joined, state };
}

describe('poker の join 完了の順序（completeJoin）', () => {
  it('WHEN ルームを作る THE サーバー SHALL joined を room-state より先に送り、room-state は本人を在席で載せる', async () => {
    server = startLiveSyncServer();
    const host = await server.connectPoker('host');

    host.send({ type: 'create-room', name: 'あ' });
    const { joined, state } = await joinedThenState(host);

    expect(types(host).indexOf('joined')).toBeLessThan(types(host).indexOf('room-state'));
    expect(state.you).toBe(joined.participantId);
    expect(state.participants.find((p) => p.id === joined.participantId)?.connected).toBe(true);
  });

  it('WHEN 新規に参加する THE サーバー SHALL joined を room-state より先に送り、room-state は本人を在席で載せる', async () => {
    server = startLiveSyncServer();
    const host = await server.connectPoker('host');
    host.send({ type: 'create-room', name: 'あ' });
    const created = (await host.take((m) => m.type === 'joined', 'joined')) as unknown as PokerJoined;
    const guest = await server.connectPoker('guest');

    guest.send({ type: 'join-room', roomId: created.roomId, name: 'い' });
    const { joined, state } = await joinedThenState(guest);

    expect(types(guest).indexOf('joined')).toBeLessThan(types(guest).indexOf('room-state'));
    expect(state.you).toBe(joined.participantId);
    expect(state.participants.find((p) => p.id === joined.participantId)?.connected).toBe(true);
  });

  it('WHEN 復帰の組で戻る THE サーバー SHALL joined を room-state より先に送り、同じ参加者を在席で載せる', async () => {
    server = startLiveSyncServer();
    const host = await server.connectPoker('host');
    host.send({ type: 'create-room', name: 'あ' });
    const created = (await host.take((m) => m.type === 'joined', 'joined')) as unknown as PokerJoined;
    const back = await server.connectPoker('back');

    back.send({ type: 'join-room', roomId: created.roomId, name: 'あ', token: created.token });
    const { joined, state } = await joinedThenState(back);

    expect(types(back).indexOf('joined')).toBeLessThan(types(back).indexOf('room-state'));
    expect(joined.participantId).toBe(created.participantId);
    expect(state.participants.find((p) => p.id === created.participantId)?.connected).toBe(true);
  });
});

describe('poker の退出の後始末の順序（handleParticipantRemoved）', () => {
  it('WHEN 幽霊を外す THE 後始末 SHALL 更新後の名簿で配信し、幽霊を保管へ書き戻して復活させない', async () => {
    server = startLiveSyncServer();
    const a = await server.connectPoker('a');
    a.send({ type: 'create-room', name: 'あ' });
    const aJoined = (await a.take((m) => m.type === 'joined', 'joined')) as unknown as PokerJoined;
    const b = await server.connectPoker('b');
    b.send({ type: 'join-room', roomId: aJoined.roomId, name: 'い' });
    const bJoined = (await b.take((m) => m.type === 'joined', 'joined')) as unknown as PokerJoined;
    await b.close();
    // B の切断が名簿に反映された（幽霊になった）room-state を待つ
    await a.take(
      (m) =>
        m.type === 'room-state' &&
        stateOf(m).participants.some((p) => p.id === bJoined.participantId && !p.connected),
      'B が幽霊になった room-state',
    );
    a.send({ type: 'remove-participant', participantId: bJoined.participantId });
    // 順序の基準: 削除を反映した最初の room-state（幽霊を載せていないもの）。それより前に届いた room-state は
    // 削除の処理より前に送られたものなので、幽霊を載せていてよい（基準にしない）
    const first = await a.take(
      (m) => m.type === 'room-state' && !stateOf(m).participants.some((p) => p.id === bJoined.participantId),
      '幽霊が消えた room-state',
    );
    // 少し待って、その後に届くものも集める（古い名簿での配信が遅れて来ないことを見る）
    a.send({ type: 'vote', card: { kind: 'number', value: 5 } });
    await a.take(
      (m) => m.type === 'room-state' && stateOf(m).participants.some((p) => p.id === aJoined.participantId),
      '削除の後の最初の操作への room-state',
    );

    // 基準から後に届いたどの room-state も幽霊を載せない（古い名簿での配信が混ざらない）
    const after = a.received.slice(a.received.indexOf(first)).filter((m) => m.type === 'room-state');
    expect(after.length).toBeGreaterThan(0);
    for (const m of after) {
      expect(stateOf(m).participants.map((p) => p.id)).not.toContain(bJoined.participantId);
    }
    // 保管の名簿からも消えたまま（後始末が古い名簿を書き戻していない）
    expect(server.store.get(aJoined.roomId)!.participants.map((p) => p.id)).not.toContain(bJoined.participantId);
  });
});
