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
      // 開発時: WS を同期サーバー（別ポート）へ転送。本番は Caddy が担う
      '/poker/ws': {
        target: 'ws://localhost:3311',
        ws: true,
        rewrite: (path) => path.replace(/^\/poker\/ws/, '/ws'),
      },
    },
  },
});
