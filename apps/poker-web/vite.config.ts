import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// サブパス /poker/ 配信（憲法 追加制約 / research R5）
export default defineConfig({
  base: '/poker/',
  plugins: [react()],
  server: {
    // 既定ポートを明示する。3 アプリを同時に起動するため、既定（5173）のままだと
    // 取り合いになって毎回別のポートに逃げ、起動手順を書けなくなる。
    port: 5174,
    // 全インターフェース(IPv4含む)で待受。コンテナ/WSL からホスト側ブラウザへ
    // ポートフォワードできるようにする（既定の localhost だと IPv6 [::1] のみで掴めない）。
    // dev スクリプトの --host と二重指定にならないよう、設定はここに一本化する。
    host: true,
    // WSL の Windows マウントでは FS イベントが届かないためポーリング監視にする
    watch: { usePolling: true, interval: 300 },
    proxy: {
      // 開発時: WS を統合 sync サーバーへ転送。本番は Caddy が担う。
      //
      // ⚠ **rewrite しない**（#95 S2）。統合サーバー（apps/tasuki-sync）は 1 つの
      // 待ち受けで timer と poker を捌き、振り分けをパスだけで決める。`/ws` へ剥がすと
      // timer 側のメッセージ層へ流れ、poker のコマンドが INVALID_COMMAND で弾かれる。
      // 本番の Caddy 断片（deploy/poker/caddy/20-poker.conf）も同じく剥がさない。
      //
      // ホストは IPv4 で確実に解決する 127.0.0.1 を指定（localhost の IPv6 解決差を回避）。
      '/poker/ws': {
        target: 'ws://127.0.0.1:8787',
        ws: true,
      },
    },
  },
});
