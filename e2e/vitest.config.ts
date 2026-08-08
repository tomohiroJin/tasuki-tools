import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // vitest の既定 include は `**/*.{test,spec}.?(c|m)[jt]s?(x)` で、
    // **Playwright のシナリオ（specs/*.spec.ts）まで拾ってしまう**。
    // 拾うと Playwright の test 関数が vitest 上で実行され、意味不明な失敗になる。
    // ここで明示的に tests/ の *.test.ts だけに絞る。
    include: ['tests/**/*.test.ts'],
  },
});
