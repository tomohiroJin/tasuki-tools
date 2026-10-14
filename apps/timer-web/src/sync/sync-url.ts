/**
 * 同期サーバーへの WebSocket URL を組み立てる（S4 / #19・#95 S5c）。
 *
 * **入口は玄関と同じ `/ws` 1 本で、ツールはクエリが宣言する**（#95 S5c）。
 * S5b までは `/timer/ws` という経路そのものが宣言だった。入口を畳んだ以上、
 * 経路ではツールを決められない。
 *
 * **パスとクエリを別の定数に分けている。** 両者は別のものと突き合わされるため
 * （#95 S4b の教訓「同じ string の意味を変えるなら改名する」）。
 *
 * - `SYNC_PATH`（`/ws`）: Caddy 断片（`deploy/landing/caddy/05-hub-ws.conf`）が
 *   受けるパスと一致していること。Caddy の `handle` はパスだけで振り分け、
 *   クエリは見ずにそのまま上流へ渡す。食い違うと WS が繋がらないのに、
 *   どちらのファイルも正しく見える。`test/sync/sync-url.test.ts` と
 *   `apps/landing/tests/caddy-fragment-port.test.ts` がこの一致を機械的に固定している。
 * - `SYNC_TOOL_QUERY`（`tool=timer`）: 統合サーバーがメッセージ層を振り分けるための
 *   ツール宣言（`apps/tasuki-sync/src/adapters/ws-adapter.ts`）。Caddy 断片は関与しない。
 */
// 入口のパスと URL の組み立ての正本は `@tasuki/sync-client`（#369。5 つの web アプリの写しを寄せた）。
import { SYNC_PATH, buildSyncUrl as buildToolSyncUrl, type SyncUrlLocation } from "@tasuki/sync-client";

export { SYNC_PATH };
export type { SyncUrlLocation };

/** timer が宣言するツール。 */
const TIMER_TOOL = "timer";

/** ツールの宣言（クエリ）。統合サーバーがメッセージ層を振り分けるのに使う。 */
export const SYNC_TOOL_QUERY = `tool=${TIMER_TOOL}`;

/** timer の同期サーバーへの URL。 */
export function buildSyncUrl(location: SyncUrlLocation): string {
  return buildToolSyncUrl(location, TIMER_TOOL);
}
