/**
 * URL からルートを決める（#476・`docs/adr/0018`）。
 *
 * 入口は玄関の札（`/track/?room=CODE`）だけである。解析と玄関への道は `@tasuki/room-core` が持つ。
 * ここは BASE を渡す薄い結線と、`location` を触る `redirectTo`（テストが `vi.mock` で差し替える）だけを持つ。
 */
import { parseRoomRoute, type RoomRoute } from '@tasuki/room-core';

export { roomHubPath as hubPathFor } from '@tasuki/room-core';
/** `?view=display` つきの札は、映す画面（読むだけ・設計 §5 D1）。 */
export type Route = RoomRoute | { name: 'display'; roomCode: string };

const BASE = '/track';
const DISPLAY_VIEW = 'display';

export function parseRoute(pathname: string, search = ''): Route {
  const route = parseRoomRoute(BASE, pathname, search);
  if (route.name === 'room' && new URLSearchParams(search).get('view') === DISPLAY_VIEW) return { name: 'display', roomCode: route.roomCode };
  return route;
}

/** 映す画面の URL（ルームの画面から新しいタブで開く）。 */
export function displayPathFor(roomCode: string): string {
  return `${BASE}/?room=${encodeURIComponent(roomCode)}&view=${DISPLAY_VIEW}`;
}

/**
 * 別の URL へ**置き換えて**移動する（履歴に残らない）。遷移はこのモジュールに閉じる。
 * `assign` だと戻るボタンで送り返しの往復になる（agenda-web の `router.ts` と同じ理由）。
 */
export function redirectTo(to: string): void {
  location.replace(to);
}
