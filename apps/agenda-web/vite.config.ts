import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { hubRedirectPlugin } from '@tasuki/dev-hub-redirect';

// サブパス /agenda/ 配信（#429）。公開パスは `apps/landing/src/tools.ts`・`deploy/agenda/app.env` の
// PUBLIC_PATH・`deploy/agenda/caddy/50-agenda.conf` と揃える（1 つでも取り残すと白画面か 404）。
export default defineConfig({
  base: '/agenda/',
  // hubRedirectPlugin: :5178 を直接開いたときの無限リロード対策（dev のみ・詳細は
  // @tasuki/dev-hub-redirect）。ルームコードを伴わない URL は `/` へ送り返すが、
  // :5178 では `/` がこのサーバー自身なので、`/` を玄関（:5175）へ送って断つ。
  plugins: [react(), hubRedirectPlugin()],
  server: {
    // 既定ポートを明示する。画面のアプリを同時に起動するため、既定のままだと取り合いになる。
    port: 5178,
    // 全インターフェースで待受（コンテナ/WSL からホスト側ブラウザへ転送するため）。
    host: true,
    // WSL の Windows マウントでは FS イベントが届かないためポーリング監視にする
    watch: { usePolling: true, interval: 300 },
    proxy: {
      // 本番と同じ `/ws` で繋ぐ。入口は玄関（5175）なので普段この中継は通らないが、
      // 5178 を直接開いたときに要る。ツールの宣言はクエリ（`?tool=agenda`）が持つ。
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true },
    },
  },
});
