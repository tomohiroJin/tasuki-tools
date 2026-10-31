/**
 * `@tasuki/web-kit/room` —— ルームの画面向けの部品（#471・#463-C2）。画面から読んでよい（同期の入口 `./sync` とは別）。
 * sync-client は型（`import type`）だけを読む。
 *
 * **`export *` を書かない**（`scripts/audit-public-surface.mjs`）。
 */
export { ConnectionBanner } from './connection-banner.js';
export { connectionNotice, type ConnectionNotice } from './connection-notice.js';
