/**
 * URL からルートを決める（#476・`docs/adr/0018`）。
 *
 * 入口は玄関の札（`/track/?room=CODE`）だけである。解析と玄関への道は `@tasuki/room-core` が持つ。
 * ここは BASE を渡す薄い結線と、`location` を触る `redirectTo`（テストが `vi.mock` で差し替える）だけを持つ。
 */
import { parseRoomRoute, type RoomRoute } from '@tasuki/room-core';

export { roomHubPath as hubPathFor } from '@tasuki/room-core';
/** `saved` = 「この端末の記録」（#476 第 2 段 B4）。ルームの接続を持たないので、ルームのコードが無くても開ける。 */
export type Route = RoomRoute | { name: 'saved'; roomCode: string | null };

const BASE = '/track';
const SAVED_VIEW = 'saved';

export function parseRoute(pathname: string, search = ''): Route {
  const params = new URLSearchParams(search);
  // アプリの置き場そのもの（`/track` か `/track/`）の `?view=saved` だけ。知らない下位パスは今までどおり玄関へ送る
  if (params.get('view') === SAVED_VIEW && (pathname === BASE || pathname === `${BASE}/`)) {
    // 戻る道のためだけに、ルームのコードを預かる（接続はしない）
    return { name: 'saved', roomCode: params.get('room') || null };
  }
  return parseRoomRoute(BASE, pathname, search);
}

/** 「この端末の記録」への URL。ルームの画面から行くときは、戻る道のためにコードを運ぶ。 */
export function savedPathFor(roomCode: string | null): string {
  const params = new URLSearchParams({ view: SAVED_VIEW });
  if (roomCode !== null) params.set('room', roomCode);
  return `${BASE}/?${params.toString()}`;
}

/**
 * 別の URL へ**置き換えて**移動する（履歴に残らない）。遷移はこのモジュールに閉じる。
 * `assign` だと戻るボタンで送り返しの往復になる（agenda-web の `router.ts` と同じ理由）。
 */
export function redirectTo(to: string): void {
  location.replace(to);
}
