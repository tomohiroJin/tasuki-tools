/**
 * URL からルートを決める（#476・`docs/adr/0018`）。
 *
 * 入口は玄関の札（`/track/?room=CODE`）だけである。解析と玄関への道は `@tasuki/room-core` が持つ。
 * ここは BASE を渡す薄い結線と、`location` を触る `redirectTo`（テストが `vi.mock` で差し替える）だけを持つ。
 */
import { parseRoomRoute, type RoomRoute } from '@tasuki/room-core';

export { roomHubPath as hubPathFor } from '@tasuki/room-core';
export type Route = RoomRoute;

const BASE = '/track';

export function parseRoute(pathname: string, search = ''): Route {
  return parseRoomRoute(BASE, pathname, search);
}

/**
 * 別の URL へ**置き換えて**移動する（履歴に残らない）。遷移はこのモジュールに閉じる。
 * `assign` だと戻るボタンで送り返しの往復になる（agenda-web の `router.ts` と同じ理由）。
 */
export function redirectTo(to: string): void {
  location.replace(to);
}
