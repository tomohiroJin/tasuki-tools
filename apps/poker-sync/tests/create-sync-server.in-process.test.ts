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
// **このファイルには describe が 2 つある。** 上の 3 点を見る「起動と往復」に加えて、
// `PokerSyncServer.close()` そのものを直接検証する describe を末尾に置く（詳しい理由は
// そちらのコメントに書いた）。検証用のサーバーは**独立したインスタンス**にしてある。
// 冒頭の「唯一のテスト」は**ファイル単位の主張**で、`createSyncServer` を import している
// テストファイルはいまも このファイルだけである。
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

// `close()` の直接検証。timer-sync 側の先例（コミット 1ed19d4
// 「test: close() の恒真テストを機構の直接検証に置き換える（#62 レビュー対応）」）に倣う。
//
// **「close() が解決すること」を見ても何も証明できない。** `WsAdapter.close()` は
// `void server.stop(true)` を撃ってから `Promise.resolve()` を返すだけなので、
// その `void server.stop(true);` の行を丸ごと消しても必ず即座に解決する。
// 観測すべきは解決の速さではなく `stop(true)` の副作用そのもので、ここでは次の 2 点を見る。
//
//   1. 活線だった接続が切れる（クライアント側が close を観測する）
//   2. ポートが解放される（同じポートで listen し直せる）
//
// **変異検査（2026-08-18 実測）**: `src/adapters/ws-adapter.ts` から
// `void server.stop(true);` の行を削除すると 153 pass / 1 fail・終了コード 1 になり、
// **落ちるのはこの it だけである**（この it を足す前は 153 件が全件緑だった、の裏返し）。
// 落ちる場所は Then 1 で、Then 2 の bind 確認までは到達しない。
describe('createSyncServer の close()', () => {
  let server: PokerSyncServer | undefined;

  afterAll(async () => {
    // it が途中で落ちたときの後始末。成功時は it の中で undefined にしてあるので
    // 二重 close にはならない
    await server?.close();
  });

  it('close() は活線接続を切り、同じポートで即座に listen し直せる状態にする', async () => {
    // Given: PORT=0 で独立したサーバーを起動し、WS クライアントを 1 本繋いだ状態を作る。
    // 上の describe とはインスタンスを共有しない（afterAll との二重 close を避けるため）
    const config = loadPokerSyncConfig({ PORT: '0' });
    const target = createSyncServer(config);
    server = target;
    const port = target.port;
    expect(port).toBeGreaterThan(0);

    const client = await WsClient.connect(port);
    expect(client.isOpen).toBe(true);

    // close の観測は `close()` を呼ぶ**前に**仕掛ける（後から待つと取りこぼす）
    const clientSawClose = client
      .waitForClose(2_000)
      .then(() => true)
      .catch(() => false);

    // When
    await target.close();
    server = undefined; // afterAll の二重 close を避ける

    // Then 1: 活線だった接続が切れた（`stop(true)` の「既存接続を切る」副作用）
    expect(await clientSawClose).toBe(true);

    // Then 2: ポートが解放されている（`stop(true)` の「listen を畳む」副作用）。
    //
    // ⚠ **赤の出方について。** 先例（1ed19d4）のコメントは「bind 失敗はコンストラクタの
    // `process.exit(1)` になりうるので、素の `Bun.serve` を使えばテスト失敗として
    // 観測できる」と書いている。**この環境で確かめた結果は次のとおり**（Bun 1.3.14・
    // 2026-08-18 実測）。
    //
    //   - 塞がったポートへ `Bun.serve` すると `Error: Failed to start server. Is port N
    //     in use?` が **throw される**。`bun test` の中でも通常のテスト失敗として出る
    //   - `process.exit(1)` するのは timer-sync の `WsAdapter` が自前で持つエラー
    //     ハンドラ（`apps/timer-sync/src/adapters/ws-adapter.ts`）であって、
    //     `Bun.serve` 自体ではない。poker-sync 側に `process.exit` は 1 箇所も無い
    //
    // それでも検証に `createSyncServer` を使わないのは、失敗の原因を bind だけに
    // 絞るためである（`createSyncServer` は heartbeat の interval も張るので、
    // bind が通った場合に止め忘れの経路が増える）。
    const probe = Bun.serve({
      port,
      hostname: config.host,
      fetch: () => new Response('probe'),
    });
    try {
      expect(probe.port).toBe(port);
    } finally {
      // 立てたプローブは必ず止める（残すと以降のテストがこのポートを掴めない）
      probe.stop(true);
    }
  });
});
