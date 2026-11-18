import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // vi.fn() の呼び出しの記録を、テストごとに消す（#499）。restoreMocks は vi.spyOn の復元だけで、
    // vi.mock の工場で作った vi.fn() の記録は次のテストへ漏れる。mockClear は実装を残すので、工場の既定は残る。
    // mockReset にしないのは、mockReset が工場で後から付けた mockResolvedValue ほかを落とすため（vi.fn(impl) の impl には戻る）。
    // 注意: clearMocks は mockXxxOnce の待ち行列を消さない。*Once はそのテストの中で使い切ること。
    clearMocks: true,
    restoreMocks: true,
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    // Node 25 以降の壊れたグローバル `localStorage` が jsdom のものを覆わないよう切る（#441）。
    execArgv: ["--no-experimental-webstorage"],
    // この実行環境（C:\ の 9p マウントで I/O が遅い）では、多数の jsdom を並列実行すると
    // CPU/IO 競合で userEvent 操作が既定 5 秒の testTimeout を超え、全スイート実行時のみ
    // 偶発的に失敗する（各テストは単独実行では緑）。並列 fork 数を抑え、タイムアウトを
    // 広げて競合フレイクを安定化する（テスト内容は変えない）。
    testTimeout: 20000,
    hookTimeout: 20000,
    // Vitest 4 で `test.poolOptions` は削除され、旧 poolOptions は最上位のオプションに
    // なった（`poolOptions.forks.maxForks` → `maxWorkers`）。並列度 4 の意図は変えない。
    maxWorkers: 4,
  },
});
