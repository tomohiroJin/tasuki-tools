import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      // 型定義・再エクスポートのみのファイルは実行ロジックを持たないため除外する
      // （カバレッジ率を不当に下げるため。振る舞いは decide/evolve 等で検証済み）。
      exclude: ["src/events.ts", "src/errors.ts", "src/index.ts"],
      thresholds: {
        lines: 90,
        branches: 90,
      },
    },
  },
});
