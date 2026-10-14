/**
 * 同期サーバーへ繋ぐ URL（#369 Task 2。5 つの web アプリの写しを 1 つにした）。
 *
 * **入口は `/ws` の 1 本で、ツールはクエリ（`?tool=`）が宣言する**（#95 S5c）。経路では
 * ツールを決められない。玄関（ハブ）は何も宣言しない（`tool` に null を渡す）。
 * `SYNC_PATH` は Caddy の断片（`deploy/landing/caddy/05-hub-ws.conf`）が受けるパスと一致させる
 * （`apps/timer-web/test/sync/sync-url.test.ts` が突き合わせる）。
 */

/** 同期サーバーの入口のパス。 */
export const SYNC_PATH = "/ws";

/** URL を組み立てるのに要る、ページの場所（`window.location` の一部）。 */
export interface SyncUrlLocation {
  readonly protocol: string;
  readonly host: string;
}

/** ページと同じホストの同期サーバーへの URL。https のページなら wss で繋ぐ。 */
export function buildSyncUrl(location: SyncUrlLocation, tool: string | null): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  const query = tool === null ? "" : `?tool=${tool}`;
  return `${scheme}//${location.host}${SYNC_PATH}${query}`;
}
