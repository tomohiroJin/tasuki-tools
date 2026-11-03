import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'jsdom',
    globals: true,
    // vi.fn() の呼び出しの記録を、テストごとに消す（#499）。restoreMocks / restoreAllMocks は vi.spyOn の
    // 復元だけで vi.fn() の記録を消さないので、vi.mock の工場で作った vi.fn() の記録が次のテストへ漏れる。
    // 実装（mockResolvedValue ほか）は残す。消すと工場の既定が失われるので mockReset にはしない。
    clearMocks: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
