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
import type { ToolId } from "./room.js";

/**
 * 「どの道具から玄関へ送られてきたか」を運ぶクエリの名前（#638）。
 *
 * 合言葉の付いたルームへ道具の URL から入ると、道具は玄関の参加画面へ送り返す（名乗りと合言葉は
 * 玄関に 1 つだけ・`docs/adr/0018`）。通ったあとに**元の道具へ戻す**ための印である。値は道具の ID で、
 * 玄関が自分の札の一覧と照らして行き先を決める（URL をそのまま信じて遷移しない）。
 * 退出の理由（{@link DEPARTURE_PARAM}）とは別の印で、並べて運べる。
 */
export const RETURN_PARAM = "from";

export type RoomRoute = { name: "room"; roomCode: string } | { name: "redirect"; to: string };

/**
 * URL からルートを決める。`base` はアプリの置き場（例 `/agenda`。末尾スラッシュは有っても無くても同じ）。
 */
export function parseRoomRoute(base: string, pathname: string, search = ""): RoomRoute {
  // base の末尾スラッシュは落として扱う（`/agenda/` を渡されても `/agenda` と同じ）。
  const root = base.replace(/\/+$/, "");
  // base が空（`""`・`"/"`）では「アプリの置き場」が無い。玄関（`/`）自身を入口と誤判定しないよう、
  // どのパスも入口にせず玄関へ送る（例外にはしない。ドメインは Result か値で返す決まり）。
  if (root === "") {
    const code = new URLSearchParams(search).get("room");
    return { name: "redirect", to: code ? roomHubPath(code) : "/" };
  }
  const rest = pathname.startsWith(root) ? pathname.slice(root.length) : null;
  // 空のコードでは入室させない（`?room=` だけが付いた URL も行き先が無い）。
  const roomCode = new URLSearchParams(search).get("room");
  if (rest !== "" && rest !== "/") {
    // 知らない下位パスでも、**ルームコードは落とさない**（玄関のそのルームへ送る。
    // 落とすと、玄関でコードを打ち直させることになる）。
    return { name: "redirect", to: roomCode ? roomHubPath(roomCode) : "/" };
  }
  return roomCode ? { name: "room", roomCode } : { name: "redirect", to: "/" };
}

/**
 * 玄関のそのルーム（参加用 URL と同じ形・`docs/adr/0018` 決定 2）。
 *
 * 抜けた・外されたときは理由を `?left=` で運ぶ（#290）。文言は玄関が引く。
 * 名乗り・合言葉のために送り返すときは、元の道具を `?from=` で運ぶ（#638。通ったら玄関が元の道具へ戻す）。
 */
export function roomHubPath(roomCode: string, departure?: DepartureReason, returnTo?: ToolId): string {
  const params = new URLSearchParams({ room: roomCode });
  if (departure !== undefined) params.set(DEPARTURE_PARAM, departure);
  if (returnTo !== undefined) params.set(RETURN_PARAM, returnTo);
  return `/?${params.toString()}`;
}
