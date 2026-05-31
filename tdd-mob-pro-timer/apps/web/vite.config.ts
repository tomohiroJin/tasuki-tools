import { defineConfig } from "vite";
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
