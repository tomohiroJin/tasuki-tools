/**
 * 参加用 URL の `?room=` を読み書きする（#95 S5a・D11）。
 *
 * ルームコードには**ルーム名がそのまま入り、日本語も許される**（例: `朝会モブ-a1b2`）。
 * 素の文字列操作では壊れるので、`URL` に任せる。
 *
 * `apps/timer-web/src/ui/room-param.ts` に似た関数があるが、あちらは**消す側だけ**を持つ
 * （timer は URL からコードを読む経路を別に持っている）。S5c で timer の入口が消えるとき、
 * 向こうは役目を終える。**いま片方を直したらもう片方も見る、という関係には無い。**
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
