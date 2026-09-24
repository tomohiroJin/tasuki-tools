import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 構成は apps/landing と同じ形。**`globals` は落とせない**（@testing-library/react の自動
// cleanup は `afterEach` がグローバルに居るときだけ登録される。poker-web の注釈を参照）。
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
