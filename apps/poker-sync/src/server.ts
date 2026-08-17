/**
 * 同期サーバーのエントリポイント。
 *
 * ここが受け持つのは「プロセスとしての振る舞い」だけである。
 * 依存の組み立ては `create-sync-server.ts` の `createSyncServer()` が持つ。
 * テストも同じ関数を通ることで、配線がずれたときにテストが本当に落ちる。
 */
import { loadPokerSyncConfig } from './config';
import { createSyncServer } from './create-sync-server';
import { buildListeningLogFields } from './listening-log';

const config = loadPokerSyncConfig(process.env);
const server = createSyncServer(config);

// この 1 行は tests/helpers.ts と e2e/harness/sync.ts が JSON.parse して実ポートを
// 受け取る機械可読な契約である。形式を変えるとテストが全滅する
// （helpers.ts が '"listening"' を含む行を探す）。port は実際に bind したポート
// （PORT=0 起動時は config.port ではなくこちらが正しい値。S-3）。
console.log(JSON.stringify({ event: 'listening', ...buildListeningLogFields(config, server.port) })); // log-hygiene:allow テストハーネスとの契約
