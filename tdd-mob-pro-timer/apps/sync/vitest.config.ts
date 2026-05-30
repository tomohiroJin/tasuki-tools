import { defineConfig } from "vitest/config";
import path from "path";

const coreRoot = path.resolve(__dirname, "../../packages/core/src");

export default defineConfig({
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
    environment: "node",
  },
});
