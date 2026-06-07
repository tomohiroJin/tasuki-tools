import { describe, it, expect } from "vitest";
import { loadSyncConfig } from "../src/config.js";

describe("loadSyncConfig", () => {
  it("既定値を返す（env 空）", () => {
    const c = loadSyncConfig({});
    expect(c).toEqual({
      port: 8787,
      host: "127.0.0.1",
      allowedOrigins: [],
      maxConnections: 200,
      maxRooms: 50,
      roomIdleTtlMs: 1_800_000,
    });
  });

  it("env を解釈する", () => {
    const c = loadSyncConfig({
      PORT: "9000",
      HOST: "0.0.0.0",
      ALLOWED_ORIGINS: "https://a.example, https://b.example",
      MAX_CONNECTIONS: "10",
      MAX_ROOMS: "3",
      ROOM_IDLE_TTL_MS: "60000",
    });
    expect(c.port).toBe(9000);
    expect(c.host).toBe("0.0.0.0");
    expect(c.allowedOrigins).toEqual(["https://a.example", "https://b.example"]);
    expect(c.maxConnections).toBe(10);
    expect(c.maxRooms).toBe(3);
    expect(c.roomIdleTtlMs).toBe(60000);
  });

  it("本番で ALLOWED_ORIGINS 空なら例外（fail-closed）", () => {
    expect(() => loadSyncConfig({ NODE_ENV: "production" })).toThrow(
      /ALLOWED_ORIGINS/,
    );
  });

  it("本番でも ALLOWED_ORIGINS があれば OK", () => {
    const c = loadSyncConfig({
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://tasuki.niku9.click",
    });
    expect(c.allowedOrigins).toEqual(["https://tasuki.niku9.click"]);
  });

  it("不正な数値は既定値にフォールバック", () => {
    const c = loadSyncConfig({ MAX_CONNECTIONS: "abc", PORT: "" });
    expect(c.maxConnections).toBe(200);
    expect(c.port).toBe(8787);
  });
});
