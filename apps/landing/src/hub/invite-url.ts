/**
 * 参加用 URL（配るもの）を組み立てる（#95 S5a・D11・`docs/adr/0018` 決定 2）。
 *
 * **ルート直下の `?room=CODE` が正しい形である。** 入口が LP に一本化されたためで、
 * 旧リンク救済の断片（`deploy/timer/caddy/40-timer-legacy-room.conf`）は
 * **同じ段で撤去する** —— 残すと、この形の URL がタイマーへ 301 で飛ばされる。
 */
export function buildInviteUrl(origin: string, code: string): string {
  const url = new URL('/', origin);
  url.searchParams.set('room', code);
  return url.toString();
}
