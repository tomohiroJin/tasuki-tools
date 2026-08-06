import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// LP はルート（/）を占める玄関（S4 / #19）。各ツールはサブパスへ移した。
// base は Caddy 断片（90-landing.conf）と app.env の PUBLIC_PATH と揃っていること。
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    // 既定ポートを明示する。3 アプリを同時に起動するため、既定（5173）のままだと
    // 取り合いになって毎回別のポートに逃げ、起動手順を書けなくなる。
    port: 5175,
    // 全インターフェース(IPv4含む)で待受。コンテナ/WSL からホスト側ブラウザへ
    // ポートフォワードできるようにする（既定の localhost だと IPv6 [::1] のみで掴めない）。
    // dev スクリプトの --host と二重指定にならないよう、設定はここに一本化する。
    host: true,
    // WSL の Windows マウントでは FS イベントが届かないためポーリング監視にする
    watch: { usePolling: true, interval: 300 },
    proxy: {
      // 開発時、LP は本番の Caddy と同じ「玄関」の役割を担う。
      //
      // これが無いと、LP の札（/timer/ ・ /poker/ を指す）をクリックしても
      // Vite の SPA フォールバックが LP 自身の index.html を 200 で返すため、
      // LP が再描画されるだけで移動できない（エラーにならないので気づきにくい）。
      //
      // 各ツールの dev サーバーへそのまま転送する。WS も通す必要があるため
      // ws: true を付ける（/timer/ws は 5173 側がさらに sync の /ws へ rewrite する）。
      '/timer': { target: 'http://127.0.0.1:5173', changeOrigin: true, ws: true },
      '/poker': { target: 'http://127.0.0.1:5174', changeOrigin: true, ws: true },
    },
  },
});
