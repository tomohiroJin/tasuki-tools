import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    // Node 25 以降の壊れたグローバル `localStorage` が jsdom のものを覆わないよう切る（#441）。
    execArgv: ['--no-experimental-webstorage'],
  },
});
