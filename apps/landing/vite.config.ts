import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// LP はルート（/）を占める玄関（S4 / #19）。各ツールはサブパスへ移した。
// base は Caddy 断片（90-landing.conf）と app.env の PUBLIC_PATH と揃っていること。
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    // WSL の Windows マウントでは FS イベントが届かないためポーリング監視にする
    watch: { usePolling: true, interval: 300 },
  },
});
