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
      // お題の文脈（#91）。下限は room-core に揃える。
      thresholds: {
        lines: 90,
        branches: 90,
      },
    },
  },
});
