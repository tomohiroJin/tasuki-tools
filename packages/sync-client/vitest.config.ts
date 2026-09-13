import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // **`localStorage` を使うテストがあるので jsdom を敷く**（#95 S5b で端末側の
    // 同一性の保存がこのパッケージへ来た）。WebSocket は各テストが差し替えるので、
    // そちらは実物のグローバル（Node 22 が持つ）にも jsdom にも依存しない。
    environment: 'jsdom',
  },
});
