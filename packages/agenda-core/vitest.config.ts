import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      // 再エクスポートのみのファイルは実行ロジックを持たないため除外する
      // （timer-core の vitest.config.ts と同じ扱い）。
      exclude: ["src/index.ts"],
      // 進行タイマーの文脈（#429）。下限は roulette-core に揃える。
      thresholds: {
        lines: 90,
        branches: 90,
      },
    },
  },
});
