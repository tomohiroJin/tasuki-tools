/**
 * web の同期フックが共有する部品（#369）。**画面はここを直接読まない**（同期フックだけが読む。
 * 各アプリの `screens-do-not-import-sync-client` のテストが固定する。`docs/adr/0015`）。
 *
 * **`export *` を書かない**（`scripts/audit-public-surface.mjs`）。公開する記号はここに列挙する。
 */
export { useJoinRetry, type JoinRetry, type JoinRetryTexts } from './use-join-retry.js';
export {
  useToolRoomSync,
  type ToolRoomDeparture,
  type ToolRoomFrameHandlers,
  type ToolRoomJoined,
  type ToolRoomSync,
  type ToolRoomSyncOptions,
} from './use-tool-room-sync.js';
