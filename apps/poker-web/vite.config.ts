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
      // 開発時も本番と同じ `/ws` で繋ぐ（本番は Caddy の 05-hub-ws.conf が担う）。
      // ツールの宣言はクエリ（`?tool=poker`）が持つので、パスを触る必要はない。
      // 入口は玄関（5175）なので普段この中継は通らないが、5174 を直接開いたときに要る。
      //
      // ホストは IPv4 で確実に解決する 127.0.0.1 を指定（localhost の IPv6 解決差を回避）。
      '/ws': {
        target: 'ws://127.0.0.1:8787',
        ws: true,
      },
    },
  },
});
