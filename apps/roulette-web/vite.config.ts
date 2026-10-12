import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { hubRedirectPlugin } from '@tasuki/dev-hub-redirect';

// サブパス /roulette/ 配信（#94）。公開パスは `apps/landing/src/tools.ts`・`deploy/roulette/app.env` の
// PUBLIC_PATH・`deploy/roulette/caddy/50-roulette.conf` と揃える（1 つでも取り残すと白画面か 404）。
export default defineConfig({
  base: '/roulette/',
  // hubRedirectPlugin: :5177 を直接開いたときの無限リロード対策（dev のみ・詳細は
  // @tasuki/dev-hub-redirect）。ルームコードを伴わない URL は `/` へ送り返すが、
  // :5177 では `/` がこのサーバー自身なので、`/` を玄関（:5175）へ送って断つ。
  plugins: [react(), hubRedirectPlugin()],
  server: {
    // 既定ポートを明示する。画面のアプリを同時に起動するため、既定のままだと取り合いになる。
    port: 5177,
    // 全インターフェースで待受（コンテナ/WSL からホスト側ブラウザへ転送するため）。
    host: true,
    // WSL の Windows マウントでは FS イベントが届かないためポーリング監視にする
    watch: { usePolling: true, interval: 300 },
    proxy: {
      // 本番と同じ `/ws` で繋ぐ。入口は玄関（5175）なので普段この中継は通らないが、
      // 5177 を直接開いたときに要る。ツールの宣言はクエリ（`?tool=roulette`）が持つ。
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true },
    },
  },
});
