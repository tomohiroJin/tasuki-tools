import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    // vi.fn() の呼び出しの記録を、テストごとに消す（#499）。実装は残す。
    clearMocks: true,
  },
});
