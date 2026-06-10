import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

const coreRoot = path.resolve(__dirname, "../../packages/core/src");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@tdd-mob/core/aggregate", replacement: path.join(coreRoot, "aggregate.ts") },
      { find: "@tdd-mob/core/events", replacement: path.join(coreRoot, "events.ts") },
      { find: "@tdd-mob/core/errors", replacement: path.join(coreRoot, "errors.ts") },
      { find: "@tdd-mob/core/decide", replacement: path.join(coreRoot, "decide.ts") },
      { find: "@tdd-mob/core/evolve", replacement: path.join(coreRoot, "evolve.ts") },
      { find: "@tdd-mob/core/schemas", replacement: path.join(coreRoot, "schemas.ts") },
      { find: "@tdd-mob/core/problem", replacement: path.join(coreRoot, "problem.ts") },
      { find: "@tdd-mob/core/records", replacement: path.join(coreRoot, "records.ts") },
      { find: "@tdd-mob/core", replacement: path.join(coreRoot, "index.ts") },
    ],
  },
  test: {
    globals: true,
    restoreMocks: true,
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    // この実行環境（C:\ の 9p マウントで I/O が遅い）では、多数の jsdom を並列実行すると
    // CPU/IO 競合で userEvent 操作が既定 5 秒の testTimeout を超え、全スイート実行時のみ
    // 偶発的に失敗する（各テストは単独実行では緑）。並列 fork 数を抑え、タイムアウトを
    // 広げて競合フレイクを安定化する（テスト内容は変えない）。
    testTimeout: 20000,
    hookTimeout: 20000,
    poolOptions: {
      forks: { maxForks: 4 },
    },
  },
});
