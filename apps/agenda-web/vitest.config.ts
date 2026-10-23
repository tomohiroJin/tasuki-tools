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
    // userEvent で組む画面を操作するテストは、CI の実行機が混むと既定 5 秒を超える（2026-10-23・PR #435:
    // 手元 0.4 秒のテストが CI で前回 3.9 秒・今回 5.6 秒で時間切れ。同じファイルのほかも CI で 3〜4 秒台）。
    // apps/timer-web/vitest.config.ts と同じ理由・同じ値。テストの中身は変えない
    testTimeout: 20000,
  },
});
