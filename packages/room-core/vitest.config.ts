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
      // #95 S1 の移設で display-name.ts は timer-core の下限（lines/branches とも 90）の
      // 外へ出た。**移設で失った保証は移設の側で回復する。** 数値は移設元に揃える。
      thresholds: {
        lines: 90,
        branches: 90,
      },
    },
  },
});
