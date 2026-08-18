/**
 * 同期サーバーの配線（組み立て）を 1 箇所に閉じ込めた関数（docs/adr/0004 決定 4）。
 *
 * ⚠ **本番（`server.ts`）とテストが必ずこの関数を通ることが要点である。**
 * テスト側で同じ組み立てを書き写すと、写しが本番からずれた瞬間に
 * 「配線が繋がっているか」の検査が死ぬ。組み立ての知識はこのファイルだけが持つ。
 *
 * `server.ts` に残すのは、プロセスとしての振る舞い（設定の読み込み・起動ログ）だけである。
 */
import { randomBytes } from 'node:crypto';
import {
  createClientKeyDeriver,
  createTokenBucketLimiter,
  DEFAULT_CAPACITY,
  DEFAULT_REFILL_PER_SEC,
} from '@tasuki/rate-limit';
import { createInMemoryRoomStore } from './adapters/in-memory-room-store';
import { createPerformanceClock } from './adapters/performance-clock';
import { createCryptoIdGen } from './adapters/crypto-id-gen';
import { createWsBroadcaster } from './adapters/ws-broadcaster';
import { createWsAdapter } from './adapters/ws-adapter';
import { makeHandlers } from './application/handlers';
import { startHeartbeat } from './application/heartbeat';
import type { RoomStore } from './ports/room-store';
import type { PokerSyncConfig } from './config';

export interface PokerSyncServer {
  /** 実際に bind したポート（PORT=0 起動のときはここが正しい値） */
  readonly port: number;
  /** ルーム保管。検証から状態を覗くために公開する */
  readonly store: RoomStore;
  close(): Promise<void>;
}

export function createSyncServer(config: PokerSyncConfig): PokerSyncServer {
  const store = createInMemoryRoomStore();
  const clock = createPerformanceClock();
  const idGen = createCryptoIdGen();
  const broadcaster = createWsBroadcaster();

  // レート制限の相関ソルトはプロセス起動ごとに 1 度だけ。env にも設定にも置かない（ADR 0012 D3）
  const deriveClientKey = createClientKeyDeriver(randomBytes(32));
  /**
   * 入室失敗のレート制限（#103）。**数える単位は接続ではなくクライアント（IP の HMAC）**。
   * 接続単位だと再接続で窓がリセットされ、ルーム ID の総当たりを止められない。
   *
   * poker には合言葉が無く、`check-room` が存在確認そのものなので、
   * join と check は同じバケツを共有する。
   */
  const rateLimiter = createTokenBucketLimiter({
    capacity: DEFAULT_CAPACITY,
    refillPerSec: DEFAULT_REFILL_PER_SEC,
  });

  const handlers = makeHandlers({
    store,
    broadcaster,
    idGen,
    clock,
    rateLimiter,
    maxRooms: config.maxRooms,
  });

  const wsAdapter = createWsAdapter({ config, handlers, deriveClientKey });
  const stopHeartbeat = startHeartbeat(wsAdapter, config);

  return {
    port: wsAdapter.port,
    store,
    async close() {
      stopHeartbeat();
      await wsAdapter.close();
    },
  };
}
