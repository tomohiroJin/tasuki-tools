import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { hubRedirectPlugin } from "@tasuki/dev-hub-redirect";

// vite 8 は `configLoader: 'native'` を将来の既定にする予定で、その下では `__dirname` が
// 使えない（build 時に警告が出る）。`import.meta.dirname` は Node 20.11 以降で使え、
// ルートの engines.node は >=22.22.2 なので条件を満たす。
const coreRoot = path.resolve(import.meta.dirname, "../../packages/timer-core/src");

// サブパス /timer/ 配信（S4 / #19）。ルートは玄関 LP が占める。
// base は Caddy 断片（30-timer-spa.conf）と app.env の PUBLIC_PATH と揃っていること。
export default defineConfig({
  base: "/timer/",
  // hubRedirectPlugin: :5173 を直接開いたときの無限リロード対策（dev のみ・詳細は
  // @tasuki/dev-hub-redirect）。旧入口撤去（#95 S5c）で行き場の無い URL は `/` へ
  // 送られるが、:5173 では `/` はこのサーバー自身（base リダイレクトで `/timer/` へ
  // 戻る）なのでループする。`/` を玄関（:5175）へ送って断つ。
  plugins: [react(), hubRedirectPlugin()],
  resolve: {
    alias: [
      { find: "@tasuki/timer-core/aggregate", replacement: path.join(coreRoot, "aggregate.ts") },
      { find: "@tasuki/timer-core/events", replacement: path.join(coreRoot, "events.ts") },
      { find: "@tasuki/timer-core/errors", replacement: path.join(coreRoot, "errors.ts") },
      { find: "@tasuki/timer-core/decide", replacement: path.join(coreRoot, "decide.ts") },
      { find: "@tasuki/timer-core/evolve", replacement: path.join(coreRoot, "evolve.ts") },
      { find: "@tasuki/timer-core/schemas", replacement: path.join(coreRoot, "schemas.ts") },
      { find: "@tasuki/timer-core/records", replacement: path.join(coreRoot, "records.ts") },
      { find: "@tasuki/timer-core", replacement: path.join(coreRoot, "index.ts") },
    ],
  },
  server: {
    // 全インターフェース(IPv4含む)で待受。コンテナ/WSL からホスト側ブラウザへ
    // ポートフォワードできるようにする（既定の localhost だと IPv6 [::1] のみで掴めない）。
    host: true,
    port: 5173,
    proxy: {
      // 開発時も本番と同じ `/ws` で繋ぐ（本番は Caddy の 05-hub-ws.conf が担う）。
      // ツールの宣言はクエリ（`?tool=timer`）が持つので、パスを触る必要はない。
      // 入口は玄関（5175）なので普段この中継は通らないが、5173 を直接開いたときに要る。
      "/ws": {
        // sync サーバーは IPv4 で確実に解決する 127.0.0.1 を指定（localhost の IPv6 解決差を回避）
        target: "ws://127.0.0.1:8787",
        ws: true,
      },
    },
  },
});
