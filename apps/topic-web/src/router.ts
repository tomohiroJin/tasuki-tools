/**
 * URL からルートを決める（#91・`docs/adr/0018`）。
 *
 * **入口は玄関の札（`/topic/?room=CODE`）だけである。** 名乗りと合言葉の入力は玄関に 1 つだけあり、
 * ルームコードを伴わない URL には行き先が無いので玄関へ送る。新しいアプリなので、poker の
 * 旧リンク（`/poker/room/<id>`）のような救済は持たない。
 *
 * ルームコードには日本語が入りうるので、復号は `URLSearchParams` に任せる。
 */
import { DEPARTURE_PARAM, type DepartureReason } from '@tasuki/room-core';

export type Route = { name: 'room'; roomCode: string } | { name: 'redirect'; to: string };

const BASE = '/topic';

export function parseRoute(pathname: string, search = ''): Route {
  const rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : null;
  if (rest !== '' && rest !== '/') return { name: 'redirect', to: '/' };
  const roomCode = new URLSearchParams(search).get('room');
  return roomCode ? { name: 'room', roomCode } : { name: 'redirect', to: '/' };
}

/**
 * 玄関のそのルーム（参加用 URL と同じ形・`docs/adr/0018` 決定 2）。
 *
 * 抜けた・外されたときは理由を `?left=` で運ぶ（#290）。文言は玄関が `@tasuki/room-core` から引く
 * （timer の `ui/entry.ts` の `hubRoomPath` と同じ形）。
 */
export function hubPathFor(roomCode: string, departure?: DepartureReason): string {
  const params = new URLSearchParams({ room: roomCode });
  if (departure !== undefined) params.set(DEPARTURE_PARAM, departure);
  return `/?${params.toString()}`;
}

/**
 * 別の URL へ**置き換えて**移動する（履歴に残らない）。遷移はこのモジュールに閉じる
 * （テストは `vi.mock` で差し替える）。`assign` だと戻るボタンで送り返しの往復になる
 * （poker-web の `router.ts` と同じ理由）。
 */
export function redirectTo(to: string): void {
  location.replace(to);
}
