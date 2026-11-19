import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    // Node 25 以降の壊れたグローバル `localStorage` が jsdom のものを覆わないよう切る（#441）。
    execArgv: ['--no-experimental-webstorage'],
    // vi.fn() の呼び出しの記録を、テストごとに消す（#499）。この設定には restoreMocks / mockReset が無く、
    // vi.mock の工場で作った vi.fn() の記録は次のテストへ漏れる。mockClear は実装を残すので、工場の既定は残る。
    // mockReset にしないのは、mockReset が工場で後から付けた mockResolvedValue ほかを落とすため（vi.fn(impl) の impl には戻る）。
    // 注意: clearMocks は mockXxxOnce の待ち行列を消さない。*Once はそのテストの中で使い切ること。
    clearMocks: true,
  },
});
