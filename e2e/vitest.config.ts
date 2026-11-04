import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // vitest の既定 include は `**/*.{test,spec}.?(c|m)[jt]s?(x)` で、
    // **Playwright のシナリオ（specs/*.spec.ts）まで拾ってしまう**。
    // 拾うと Playwright の test 関数が vitest 上で実行され、意味不明な失敗になる。
    // ここで明示的に tests/ の *.test.ts だけに絞る。
    include: ['tests/**/*.test.ts'],
    // vi.fn() の呼び出しの記録を、テストごとに消す（#499）。この設定には restoreMocks / mockReset が無く、
    // vi.mock の工場で作った vi.fn() の記録は次のテストへ漏れる。mockClear は実装を残すので、工場の既定は残る。
    // mockReset にしないのは、mockReset が工場で後から付けた mockResolvedValue ほかを落とすため（vi.fn(impl) の impl には戻る）。
    // 注意: clearMocks は mockXxxOnce の待ち行列を消さない。*Once はそのテストの中で使い切ること。
    clearMocks: true,
  },
});
