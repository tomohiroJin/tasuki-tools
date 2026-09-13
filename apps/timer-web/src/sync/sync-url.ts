/**
 * 同期サーバーへの WebSocket URL を組み立てる（S4 / #19・#95 S5c）。
 *
 * **入口は玄関と同じ `/ws` 1 本で、ツールはクエリが宣言する**（#95 S5c）。
 * S5b までは `/timer/ws` という経路そのものが宣言だった。入口を畳んだ以上、
 * 経路ではツールを決められない。
 *
 * ここで組み立てるパスは Caddy 断片（`deploy/landing/caddy/05-hub-ws.conf`）が受ける
 * `/ws` と一致していること。食い違うと WS が繋がらないのに、どちらのファイルも
 * 正しく見える。`test/sync/sync-url.test.ts` と
 * `apps/landing/tests/caddy-fragment-port.test.ts` がこの一致を機械的に固定している。
 */
export const SYNC_PATH = "/ws?tool=timer";

/** URL の組み立てに必要な location の一部。テストから差し替えられるようにする。 */
export interface SyncUrlLocation {
  /** `https:` / `http:` */
  readonly protocol: string;
  /** ホスト（ポートを含む） */
  readonly host: string;
}

export function buildSyncUrl(location: SyncUrlLocation): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}${SYNC_PATH}`;
}
