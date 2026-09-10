// 契約シナリオ #1 #2 + room-not-found（US1）
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
  participantId: string;
  token: string;
}

interface RoomState {
  type: 'room-state';
  roomId: string;
  you: string;
  participants: Array<{ id: string; name: string }>;
}

describe('create-room（契約 #1）', () => {
  it('joined と room-state（参加者1人）が返る', async () => {
    // Given
    const host = await WsClient.connect(server.port);
    // When
    host.send({ type: 'create-room', name: 'たろう' });

    const joined = (await host.nextMatching(isType('joined'))) as Joined;
    // Then
    expect(joined.roomId).toMatch(/^[a-z0-9]{8}$/);
    expect(joined.participantId).toBeTruthy();
    expect(joined.token).toBeTruthy();

    const state = (await host.nextMatching(isType('room-state'))) as RoomState;
    expect(state.roomId).toBe(joined.roomId);
    expect(state.you).toBe(joined.participantId);
    expect(state.participants).toHaveLength(1);
    expect(state.participants[0]).toMatchObject({ name: 'たろう' });

    // **`room-state` に復帰トークンが混ざらない（SC-004）。**
    // 見るのは `room-state` だけである —— `joined` は本人宛にトークンを配る正当な
    // フレームなので、そちらへ同じ判定を掛けると必ず落ちる。
    //
    // #95 S4a まで、この性質は `poker-core` 側の
    // `expect(json).not.toContain('SECRET')`（`tests/snapshot.test.ts`）が見ていた。
    // 名簿が `@tasuki/room-core` へ移り、`createSnapshotBuilder` が受け取る
    // `ParticipantFragment` に `token` というフィールドが無くなったので、あちらは
    // **渡せる秘密が型に存在しない**（構造的に安全）状態になり、値の検査を落とした。
    // だが「組み立て側（`poker/application/handlers.ts` の `fragmentsOf`）が
    // **別の出所から**トークンを混ぜない」ことは型では保証されない。
    // **その番人はスタック全体でここ 1 本だけである。**
    expect(JSON.stringify(state)).not.toContain(joined.token);
    host.close();
  });
});

describe('join-room（契約 #2）', () => {
  it('2人目の参加が両者の room-state に配信される', async () => {
    // Given
    const host = await WsClient.connect(server.port);
    host.send({ type: 'create-room', name: 'たろう' });
    const joined = (await host.nextMatching(isType('joined'))) as Joined;
    await host.nextMatching(isType('room-state'));

    // When
    const guest = await WsClient.connect(server.port);
    guest.send({ type: 'join-room', roomId: joined.roomId, name: 'はなこ' });

    const guestJoined = (await guest.nextMatching(isType('joined'))) as Joined;
    // Then
    expect(guestJoined.roomId).toBe(joined.roomId);
    expect(guestJoined.participantId).not.toBe(joined.participantId);

    const guestState = (await guest.nextMatching(isType('room-state'))) as RoomState;
    const hostState = (await host.nextMatching(isType('room-state'))) as RoomState;
    for (const state of [guestState, hostState]) {
      expect(state.participants).toHaveLength(2);
      expect(state.participants.map((p) => p.name)).toEqual(['たろう', 'はなこ']);
    }
    // 受信者別の you
    expect(guestState.you).toBe(guestJoined.participantId);
    expect(hostState.you).toBe(joined.participantId);

    host.close();
    guest.close();
  });

  /**
   * 旧 `packages/poker-core/tests/room.test.ts` の
   * 「同名の参加者を別々の参加者として許容する（Edge Case）」を WS 越しへ移した 1 本。
   *
   * `joinRoom` が消えて名簿が `@tasuki/room-core` になったため、ドメイン単体では
   * 書けなくなった。**「`addParticipant` に名前を見る分岐が無い」はコードを読めば
   * 分かるという主張であってテストではない。**
   *
   * ⚠ **「どちらの参加口にも同名判定は無い」が現況である**（2026-09-10 実測）。
   * `conflictsWithExisting` を呼ぶのは timer の `application/handlers.ts` の
   * `participant.addProxy` と `participant.rename` だけで、`room.join` は
   * `command-handlers/room-join.ts` へ早期分岐し、そこは無条件に `addParticipant` する。
   *
   * だからこそ固定する価値がある。名簿が timer と 1 つになったいま、**改名・代理追加に
   * ある判定を「参加のときも揃えよう」と参加口へ広げる変更**は現実に起こりうる。
   * それが poker 側へ及ぶと、poker が同名を許すという契約（Edge Case）が黙って壊れる。
   *
   * @requirements FR-003
   */
  it('同名の参加者を別々の参加者として許容する（Edge Case）', async () => {
    // Given: 「たろう」がルームを作る
    const host = await WsClient.connect(server.port);
    host.send({ type: 'create-room', name: 'たろう' });
    const joined = (await host.nextMatching(isType('joined'))) as Joined;
    await host.nextMatching(isType('room-state'));

    // When: まったく同じ名前で 2 人目が参加する
    const twin = await WsClient.connect(server.port);
    twin.send({ type: 'join-room', roomId: joined.roomId, name: 'たろう' });
    const twinJoined = (await twin.nextMatching(isType('joined'))) as Joined;

    // Then: 拒否されず、別々の参加者として 2 人並ぶ
    const state = (await twin.nextMatching(isType('room-state'))) as RoomState;
    expect(state.participants).toHaveLength(2);
    expect(state.participants.map((p) => p.name)).toEqual(['たろう', 'たろう']);
    expect(twinJoined.participantId).not.toBe(joined.participantId);
    expect(new Set(state.participants.map((p) => p.id)).size).toBe(2);

    host.close();
    twin.close();
  });

  /**
   * @requirements FR-015, US1-AS3
   */
  it('存在しない roomId は room-not-found', async () => {
    // Given
    const client = await WsClient.connect(server.port);
    // When
    client.send({ type: 'join-room', roomId: 'zzzzzzzz', name: 'はなこ' });
    // Then
    expect(await client.next()).toMatchObject({ type: 'error', code: 'room-not-found' });
    client.close();
  });
});
