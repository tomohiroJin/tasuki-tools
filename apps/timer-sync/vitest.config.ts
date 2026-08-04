import { defineConfig } from "vitest/config";
import path from "path";

const coreRoot = path.resolve(__dirname, "../../packages/timer-core/src");

export default defineConfig({
  resolve: {
    alias: [
      { find: "@tasuki/timer-core/aggregate", replacement: path.join(coreRoot, "aggregate.ts") },
      { find: "@tasuki/timer-core/events", replacement: path.join(coreRoot, "events.ts") },
      { find: "@tasuki/timer-core/errors", replacement: path.join(coreRoot, "errors.ts") },
      { find: "@tasuki/timer-core/decide", replacement: path.join(coreRoot, "decide.ts") },
      { find: "@tasuki/timer-core/evolve", replacement: path.join(coreRoot, "evolve.ts") },
      { find: "@tasuki/timer-core/schemas", replacement: path.join(coreRoot, "schemas.ts") },
      { find: "@tasuki/timer-core/problem", replacement: path.join(coreRoot, "problem.ts") },
      { find: "@tasuki/timer-core/records", replacement: path.join(coreRoot, "records.ts") },
      { find: "@tasuki/timer-core", replacement: path.join(coreRoot, "index.ts") },
    ],
  },
  test: {
    globals: true,
    environment: "node",
  },
});
