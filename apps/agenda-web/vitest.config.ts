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
    // vi.fn() の呼び出しの記録を、テストごとに消す（#499）。この設定には restoreMocks / mockReset が無く、
    // vi.mock の工場で作った vi.fn() の記録は次のテストへ漏れる。mockClear は実装を残すので、工場の既定は残る。
    // mockReset にしないのは、mockReset が工場で後から付けた mockResolvedValue ほかを落とすため（vi.fn(impl) の impl には戻る）。
    // 注意: clearMocks は mockXxxOnce の待ち行列を消さない。*Once はそのテストの中で使い切ること。
    clearMocks: true,
    setupFiles: ['./tests/setup.ts'],
    // userEvent で組む画面を操作するテストは、CI の実行機が混むと既定 5 秒を超える（2026-10-23・PR #435:
    // 手元 0.4 秒のテストが CI で前回 3.9 秒・今回 5.6 秒で時間切れ。同じファイルのほかも CI で 3〜4 秒台）。
    // apps/timer-web/vitest.config.ts と同じ理由・同じ値。テストの中身は変えない
    testTimeout: 20000,
  },
});
