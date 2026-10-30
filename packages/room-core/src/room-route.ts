/**
 * ルームの URL の解析と玄関への道（#470・#463-C1・`docs/adr/0018`）。
 *
 * **入口は玄関の札（`<base>/?room=CODE`）だけである。** 名乗りと合言葉の入力は玄関に 1 つだけあり、
 * ルームコードを伴わない URL には行き先が無いので玄関へ送る（知らない下位パスはコードを保って
 * 玄関のそのルームへ）。
 *
 * ルームコードには日本語が入りうるので、復号は `URLSearchParams` に任せる。
 * 遷移（`location.replace`）はここに置かない。副作用を持たない関数だけを置き、
 * 遷移は各アプリの `router.ts` の `redirectTo` に残す（テストが差し替える）。
 */
import { DEPARTURE_PARAM, type DepartureReason } from "./departure.js";

export type Route = { name: "room"; roomCode: string } | { name: "redirect"; to: string };

/**
 * URL からルートを決める。`base` はアプリの置き場（例 `/agenda`・末尾スラッシュ無し）。
 */
export function parseRoute(base: string, pathname: string, search = ""): Route {
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : null;
  // 空のコードでは入室させない（`?room=` だけが付いた URL も行き先が無い）。
  const roomCode = new URLSearchParams(search).get("room");
  if (rest !== "" && rest !== "/") {
    // 知らない下位パスでも、**ルームコードは落とさない**（玄関のそのルームへ送る。
    // 落とすと、玄関でコードを打ち直させることになる）。
    return { name: "redirect", to: roomCode ? hubPathFor(roomCode) : "/" };
  }
  return roomCode ? { name: "room", roomCode } : { name: "redirect", to: "/" };
}

/**
 * 玄関のそのルーム（参加用 URL と同じ形・`docs/adr/0018` 決定 2）。
 *
 * 抜けた・外されたときは理由を `?left=` で運ぶ（#290）。文言は玄関が引く。
 */
export function hubPathFor(roomCode: string, departure?: DepartureReason): string {
  const params = new URLSearchParams({ room: roomCode });
  if (departure !== undefined) params.set(DEPARTURE_PARAM, departure);
  return `/?${params.toString()}`;
}
