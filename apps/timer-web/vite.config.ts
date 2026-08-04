import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const coreRoot = path.resolve(__dirname, "../../packages/timer-core/src");

export default defineConfig({
  plugins: [react()],
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
  server: {
    // 全インターフェース(IPv4含む)で待受。コンテナ/WSL からホスト側ブラウザへ
    // ポートフォワードできるようにする（既定の localhost だと IPv6 [::1] のみで掴めない）。
    host: true,
    port: 5173,
    proxy: {
      "/ws": {
        // sync サーバーは IPv4 で確実に解決する 127.0.0.1 を指定（localhost の IPv6 解決差を回避）
        target: "ws://127.0.0.1:8787",
        ws: true,
      },
    },
  },
});
