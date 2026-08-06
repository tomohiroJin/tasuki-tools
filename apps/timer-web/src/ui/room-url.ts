/**
 * ルームへの参加 URL（招待リンク・QR）を組み立てる（#76 F-1）。
 *
 * ルート直下の `?room=CODE` に向けてはいけない。ルートは玄関 LP の包括フォールバックが
 * 持っているので、コードを持ったまま LP が表示され、参加画面へ行けない。
 * 本番には旧リンク救済の 301（`deploy/timer/caddy/40-timer-legacy-room.conf`）があるが、
 * それは古いリンクのための保険であって、いま配る招待 URL が頼るものではない。
 *
 * App.tsx に直書きされていた頃はテストから触れず、移設漏れを検出する手段が無かった。
 * sync-url.ts と同じく関数として切り出し、公開パスとの一致をテストで固定する。
 */
import { PUBLIC_PATH } from "../public-path.js";

/**
 * オリジンとルームコードから参加 URL を組み立てる。
 *
 * ルームコードにはルーム名がそのまま入り、日本語も許される（例: `朝会モブ-a1b2`）。
 * 素の文字列連結では壊れるため、クエリとして符号化する。
 */
export function buildRoomUrl(origin: string, code: string): string {
  const url = new URL(PUBLIC_PATH, origin);
  url.searchParams.set("room", code);
  return url.toString();
}
