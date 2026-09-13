import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // ブラウザ環境は要らない。WebSocket は各テストが差し替えるので、
    // 実物のグローバル（Node 22 が持つ）にも jsdom にも依存しない。
    environment: 'node',
  },
});
