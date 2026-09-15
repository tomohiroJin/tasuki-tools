import type { Plugin } from "vite";

/**
 * 玄関（apps/landing）の dev サーバーのポート。
 *
 * timer / poker の vite.config.ts はこの値を「`/` へ来たときの送り先」として使い、
 * 玄関自身（apps/landing/vite.config.ts）もこの値を `server.port` として使う。
 * 3 つの vite.config.ts に別々にポート番号を書くと、玄関のポートを変えたときに
 * timer / poker 側だけ古い値のまま残って黙って壊れる
 * （このリポジトリが繰り返し踏んできた「同じ値を複数ファイルに持つと食い違う」型）。
 * 値はここ 1 箇所だけに持つ。
 */
export const HUB_PORT = 5175;

/**
 * dev サーバーへの `/` へのアクセスを玄関（{@link HUB_PORT}）へ 302 で送り返す
 * Vite プラグイン（#95 S5c 追補）。
 *
 * **原因の連鎖**: #95 S5c で旧入口（timer の Setup/Join 等）を撤去し、ルームコードを
 * 伴わずに開いたツールは玄関（`/`）へ送り返すようになった
 * （`apps/timer-web/src/ui/entry.ts` の `decideEntry` → `platform/location.ts` の
 * `redirectTo` が `location.replace("/")` する）。ところが timer / poker の
 * dev サーバーを直接開くと、そのサーバーにとって `/` は自分自身であり玄関ではない
 * —— Vite が `/` を base（`/timer/` 等）へ 302 で戻すため、「`/` へ送る → base が
 * `/timer/` へ戻す → decideEntry が再び `/` へ送る」の無限ループになる
 * （実測: 8 秒で timer 65 回・poker 157 回）。
 *
 * このプラグインを Vite の内部 middleware（base リダイレクト）より**前**に挿し込み、
 * `/` へ来た時点でプロセスの外（玄関）へ送ってしまえば、内部 middleware に
 * 到達する前にループを断てる。
 *
 * **順序が命**: `configureServer` フックの中で `server.middlewares.use(...)` を
 * 直接呼ぶと、Vite はまだ内部 middleware を積んでいないため、この呼び出しが先に
 * 積まれ、結果としてリクエスト処理でも内部 middleware より先に呼ばれる。
 * フックから関数を `return` すると、その関数は内部 middleware を積み終えた**後**に
 * 呼ばれる（Vite の仕様）ため、base リダイレクトの後段に置かれてしまい一生呼ばれない。
 * どちらが正しいかは `curl -D - http://localhost:5173/` の `Location` で実測して選んだ
 * （直接呼ぶ形でのみ `Location: http://localhost:5175/` が返る）。
 *
 * 本番ビルドに影響させないため `apply: "serve"` を付ける。
 * 対象は `/` そのものだけ（`/timer/...` や `/@vite/...`、HMR のソケット等は
 * pathname が `/` と一致しないため `next()` で素通しする）。クエリは保って転送する。
 */
export function hubRedirectPlugin(): Plugin {
  return {
    name: "tasuki-dev-hub-redirect",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) {
          next();
          return;
        }

        const url = new URL(req.url, "http://placeholder");
        if (url.pathname !== "/") {
          next();
          return;
        }

        // ホスト名は受けたリクエストのものをそのまま使う（`host: true` で全
        // インターフェース待受のため、WSL のポートフォワード等で localhost 以外の
        // 名で届くことがある）。ポートだけ玄関のものへ差し替える。
        const hostname = (req.headers.host ?? `localhost:${HUB_PORT}`).split(":")[0];
        res.statusCode = 302;
        res.setHeader("Location", `http://${hostname}:${HUB_PORT}/${url.search}`);
        res.end();
      });
    },
  };
}
