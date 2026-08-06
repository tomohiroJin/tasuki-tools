/**
 * 同期サーバーへの WebSocket URL を組み立てる（S4 / #19）。
 *
 * timer は `/timer/` 配下で配信されるため、WS も同じ配下に置く。Caddy が
 * `/timer/ws` を受けて sync サーバーの `/ws` へ rewrite する
 * （`deploy/timer/caddy/10-timer-ws.conf`）。
 *
 * ルート直下（`/ws`）に繋いではいけない。ルートは LP の包括フォールバックが
 * 持っているので、WebSocket にならず index.html が 200 で返る。
 */

import { PUBLIC_PATH } from "../public-path.js";

/** 公開パス配下の WS エンドポイント。Caddy 断片と一致していること。 */
export const SYNC_PATH = `${PUBLIC_PATH}ws`;

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
