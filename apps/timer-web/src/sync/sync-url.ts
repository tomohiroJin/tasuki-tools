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
export const SYNC_PATH = "/ws";

/** 統合サーバーへ渡すツールの宣言（クエリ文字列。timer 固定）。 */
export const SYNC_TOOL_QUERY = "tool=timer";

/** URL の組み立てに必要な location の一部。テストから差し替えられるようにする。 */
export interface SyncUrlLocation {
  /** `https:` / `http:` */
  readonly protocol: string;
  /** ホスト（ポートを含む） */
  readonly host: string;
}

export function buildSyncUrl(location: SyncUrlLocation): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}${SYNC_PATH}?${SYNC_TOOL_QUERY}`;
}
