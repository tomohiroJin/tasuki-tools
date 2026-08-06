/**
 * timer が配信される公開パス（S4 / #19）。
 *
 * timer はルート（`/`）から `/timer/` 配下へ移設され、ルートは玄関 LP が占める。
 * 「自分がどのパスで配信されているか」を必要とする場所が複数あり（WS の接続先・
 * 招待 URL）、それぞれが別々に文字列を持つと、次の移設でまた片方だけ取り残される。
 * #19 では招待 URL がルート直下のまま残り、招待リンクが玄関 LP に着地していた（#76 F-1）。
 *
 * この値は配信設定と一致していなければならない。突き合わせはテストが機械的に行う。
 *
 * - `apps/timer-web/vite.config.ts` の `base`
 * - `deploy/timer/app.env` の `PUBLIC_PATH`
 * - `deploy/timer/caddy/30-timer-spa.conf` が受け持つパス
 */
export const PUBLIC_PATH = "/timer/";
