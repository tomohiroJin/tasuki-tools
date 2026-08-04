import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// S3（#18）では暫定パス /home/ で配信し、既存 URL には触れない。
// S4（#19）でルート（/）へ移す。
export default defineConfig({
  base: '/home/',
  plugins: [react()],
  server: {
    // WSL の Windows マウントでは FS イベントが届かないためポーリング監視にする
    watch: { usePolling: true, interval: 300 },
  },
});
