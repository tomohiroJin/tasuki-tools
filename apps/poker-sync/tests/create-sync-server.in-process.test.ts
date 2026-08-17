// `createSyncServer()` を **import して in-process で起動する**唯一のテスト。
//
// 設計正本（docs/superpowers/specs/2026-08-17-poker-sync-ports-and-adapters-design.md）の
// 完了条件 2 の逐語:
//
// > `server.ts` とテストの**両方**が `createSyncServer()` を経由する（テスト側は import で示す）
//
// **「経由する」だけなら既存テストも満たしている。** `tests/helpers.ts` の `startServer` は
// `bun run src/server.ts` をサブプロセス起動するので、`server.ts` 経由で
// `createSyncServer()` が呼ばれる。正本が指定しているのは主張ではなく**手段**
// （テスト側の import）であり、それを満たすファイルが 1 つも無かった。
// ファイル名が紛らわしいが `tests/create-sync-server.substitution.test.ts` は
// `makeHandlers` の差し替えテストで、`createSyncServer` を import していない。
//
// **儀式にしないための線引き**: 「import できた」ことは何も証明しない。ここで観測するのは
// **in-process で組み立てた同期サーバーが、実際に WS を受け付けて往復できること**である。
// 具体的には次の 3 つで、どれか 1 つでも組み立て（create-sync-server.ts の配線）が
// 切れれば落ちる。
//
//   1. `createSyncServer(config)` の返り値の `port` が実際に bind されたポートである
//      （`PORT=0` を渡すので、config の値をそのまま返す実装では接続できない）
//   2. その `port` へ WS 接続し、`create-room` → `joined` → `room-state` の往復が成立する
//      （WsAdapter → Handlers → RoomStore → Broadcaster の 4 段がすべて繋がっていないと届かない）
//   3. `store`（`RoomStore` ポート）に、いま作られたルームが実在する
//      （in-process だからこそサーバー内部の状態を直接覗ける。サブプロセス起動では見えない）
//
// 既存テストとポートが衝突しないよう `PORT=0` で起動し、`afterAll` で必ず `close()` する。
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { loadPokerSyncConfig } from '../src/config';
import { createSyncServer, type PokerSyncServer } from '../src/create-sync-server';
// 接続部分だけは既存の WS テストクライアントを流用する（`startServer` はサブプロセス
// 起動なのでここでは使わない。`WsClient` はポート番号しか要求しない）。
import { isType, WsClient } from './helpers';

describe('createSyncServer を in-process で起動する', () => {
  let server: PokerSyncServer;

  beforeAll(() => {
    // Given: env は明示的な最小の記録から作る（process.env に依存させない）。
    // PORT=0 は「任意の空きポート」の意味で、config.port は 0 のまま残る
    const config = loadPokerSyncConfig({ PORT: '0' });
    expect(config.port).toBe(0);
    server = createSyncServer(config);
  });

  afterAll(async () => {
    // 止め損ねるとハートビートの interval が残ってテストプロセスが終わらない
    await server.close();
  });

  it('返り値の port は実際に bind されたポートで、そこへ WS 接続して部屋を作れる', async () => {
    // Then: PORT=0 を渡したのに 0 ではない（config の値をそのまま返していない）
    expect(server.port).toBeGreaterThan(0);

    // When: 実際に WS で繋いで最小限の往復をする
    const host = await WsClient.connect(server.port);
    try {
      host.send({ type: 'create-room', name: 'たろう' });
      const joined = (await host.nextMatching(isType('joined'))) as {
        roomId: string;
        participantId: string;
      };

      // Then: 応答が返り、続けてスナップショットも届く（配信まで繋がっている）
      expect(joined.roomId).toMatch(/^[a-z0-9]+$/);
      const state = (await host.nextMatching(isType('room-state'))) as {
        roomId: string;
        participants: unknown[];
      };
      expect(state.roomId).toBe(joined.roomId);
      expect(state.participants).toHaveLength(1);

      // Then: サーバー内部の RoomStore にも実在する。
      // **これは in-process でしか見られない**（サブプロセス起動では store に触れない）
      expect(server.store.has(joined.roomId)).toBe(true);
      expect(server.store.get(joined.roomId)?.participants[0]?.id).toBe(joined.participantId);
    } finally {
      host.close();
    }
  });
});
