import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    passWithNoTests: true,
    // サブプロセス起動（bun run）を伴うため余裕を持たせる（research R7）
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
