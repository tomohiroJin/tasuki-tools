/**
 * 参加用 URL の `?room=` を読み書きする（#95 S5a・D11）。
 *
 * ルームコードには**ルーム名がそのまま入り、日本語も許される**（例: `朝会モブ-a1b2`）。
 * 素の文字列操作では壊れるので、`URL` に任せる。
 *
 * かつて `apps/timer-web/src/ui/room-param.ts` に似た関数（**消す側だけ**）があったが、
 * #95 S5c で timer の旧入口を撤去した際に役目を終えて消えた —— 自己退出の行き先が
 * 玄関そのものになり、いま居る URL から `?room=` を落とす必要が無くなったためである。
 * **いまここは 1 本しかない。**
 */

/** `?room=` を読む。無い・空なら null（空のコードで参加させない）。 */
export function readRoomParam(href: string): string | null {
  const value = new URL(href).searchParams.get('room');
  return value === null || value === '' ? null : value;
}

/** `?room=` を取り除いた URL を返す（入口へ戻すとき）。 */
export function stripRoomParam(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('room');
  return url.toString();
}
