/**
 * URL からルートを決める（#94・`docs/adr/0018`）。
 *
 * 入口は玄関の札（`/roulette/?room=CODE`）だけである。解析と玄関への道は
 * `@tasuki/room-core` に寄せてある（#470）。ここは BASE を渡す薄い結線と、
 * `location` を触る `redirectTo`（テストが `vi.mock` で差し替える）だけを持つ。
 */
import { parseRoomRoute, type RoomRoute } from '@tasuki/room-core';

export { roomHubPath as hubPathFor } from '@tasuki/room-core';
export type Route = RoomRoute;

const BASE = '/roulette';

export function parseRoute(pathname: string, search = ''): Route {
  return parseRoomRoute(BASE, pathname, search);
}

/**
 * 別の URL へ**置き換えて**移動する（履歴に残らない）。遷移はこのモジュールに閉じる
 * （テストは `vi.mock` で差し替える）。`assign` だと戻るボタンで送り返しの往復になる
 * （poker-web の `router.ts` と同じ理由）。
 */
export function redirectTo(to: string): void {
  location.replace(to);
}
