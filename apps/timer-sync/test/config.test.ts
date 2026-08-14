import { describe, it, expect } from "bun:test";
import { loadSyncConfig } from "../src/config.js";

describe("loadSyncConfig", () => {
  it("既定値を返す（env 空）", () => {
    // Given
    const env = {};
    // When
    const c = loadSyncConfig(env);
    // Then
    expect(c.port).toBe(8787);
    expect(c.host).toBe("127.0.0.1");
    expect(c.allowedOrigins).toEqual([]);
    expect(c.maxConnections).toBe(200);
    expect(c.maxRooms).toBe(50);
    expect(c.roomIdleTtlMs).toBe(1_800_000);
    expect(c.adminToken).toBeUndefined();
    expect(c.requireClientAddress).toBe(false);
  });

  it("env を解釈する", () => {
    // Given
    const env = {
      PORT: "9000",
      HOST: "0.0.0.0",
      ALLOWED_ORIGINS: "https://a.example, https://b.example",
      MAX_CONNECTIONS: "10",
      MAX_ROOMS: "3",
      ROOM_IDLE_TTL_MS: "60000",
    };
    // When
    const c = loadSyncConfig(env);
    // Then
    expect(c.port).toBe(9000);
    expect(c.host).toBe("0.0.0.0");
    expect(c.allowedOrigins).toEqual(["https://a.example", "https://b.example"]);
    expect(c.maxConnections).toBe(10);
    expect(c.maxRooms).toBe(3);
    expect(c.roomIdleTtlMs).toBe(60000);
  });

  it("本番で ALLOWED_ORIGINS 空なら例外（fail-closed）", () => {
    // Given
    const env = { NODE_ENV: "production" };
    // When
    const load = () => loadSyncConfig(env);
    // Then
    expect(load).toThrow(/ALLOWED_ORIGINS/);
  });

  it("本番でも ALLOWED_ORIGINS があれば OK", () => {
    // Given
    const env = {
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://tasuki.example.com",
    };
    // When
    const c = loadSyncConfig(env);
    // Then
    expect(c.allowedOrigins).toEqual(["https://tasuki.example.com"]);
    // 本番では、クライアント IP を特定できない接続を拒否する（#103・D6）。
    expect(c.requireClientAddress).toBe(true);
  });

  it("不正な数値は既定値にフォールバック", () => {
    // Given
    const env = { MAX_CONNECTIONS: "abc", PORT: "" };
    // When
    const c = loadSyncConfig(env);
    // Then
    expect(c.maxConnections).toBe(200);
    expect(c.port).toBe(8787);
  });

  it("0 や負数は既定値にフォールバック（上限を無効化させない）", () => {
    // Given
    const env = { MAX_CONNECTIONS: "0", MAX_ROOMS: "-1", PORT: "-1" };
    // When
    const c = loadSyncConfig(env);
    // Then
    expect(c.maxConnections).toBe(200);
    expect(c.maxRooms).toBe(50);
    expect(c.port).toBe(8787);
  });

  it("PORT=0 は「OS に空きポートを選ばせる」有効値として通す", () => {
    // Given: 上限系（MAX_*）と違い、PORT の 0 は無効化ではなく「任意の空きポート」を意味する。
    // 実 WebSocket 越しのテストがこれを使う（test/support/live-sync-server.ts）。
    const env = { PORT: "0" };
    // When
    const c = loadSyncConfig(env);
    // Then: 既定 8787 に落とさない
    expect(c.port).toBe(0);
  });

  it("ハートビート間隔・許容ミス回数の既定値（Issue #25）", () => {
    // Given
    const env = {};
    // When
    const c = loadSyncConfig(env);
    // Then
    expect(c.heartbeatIntervalMs).toBe(15_000);
    expect(c.heartbeatMaxMisses).toBe(2);
  });

  it("ハートビート間隔・許容ミス回数を env から読み込む（Issue #25）", () => {
    // Given
    const env = { HEARTBEAT_INTERVAL_MS: "5000", HEARTBEAT_MAX_MISSES: "3" };
    // When
    const c = loadSyncConfig(env);
    // Then
    expect(c.heartbeatIntervalMs).toBe(5000);
    expect(c.heartbeatMaxMisses).toBe(3);
  });

  it("ハートビート設定の不正値は既定値にフォールバック（Issue #25）", () => {
    // Given
    const env = { HEARTBEAT_INTERVAL_MS: "abc", HEARTBEAT_MAX_MISSES: "-1" };
    // When
    const c = loadSyncConfig(env);
    // Then
    expect(c.heartbeatIntervalMs).toBe(15_000);
    expect(c.heartbeatMaxMisses).toBe(2);
  });

  describe("本番の HOST 検査（起動時 fail-closed・#103・D6）", () => {
    it("本番でループバック以外は起動を拒否する", () => {
      const env = {
        NODE_ENV: "production",
        ALLOWED_ORIGINS: "https://tasuki.example.com",
        HOST: "0.0.0.0",
      };
      expect(() => loadSyncConfig(env)).toThrow(/HOST/);
    });

    it.each(["127.0.0.1", "127.1.2.3", "::1", "[::1]", "localhost"])(
      "本番でも %s はループバック扱いで通る",
      (host) => {
        const env = {
          NODE_ENV: "production",
          ALLOWED_ORIGINS: "https://tasuki.example.com",
          HOST: host,
        };
        const c = loadSyncConfig(env);
        expect(c.host).toBe(host);
      },
    );

    it("HOST 未設定なら既定の 127.0.0.1 で本番でも通る", () => {
      const env = {
        NODE_ENV: "production",
        ALLOWED_ORIGINS: "https://tasuki.example.com",
      };
      const c = loadSyncConfig(env);
      expect(c.host).toBe("127.0.0.1");
      expect(c.requireClientAddress).toBe(true);
    });

    it("本番以外なら 0.0.0.0 でも拒否しない", () => {
      const env = { HOST: "0.0.0.0" };
      const c = loadSyncConfig(env);
      expect(c.host).toBe("0.0.0.0");
      expect(c.requireClientAddress).toBe(false);
    });

    // env の値には末尾改行・前後空白・表記ゆれが混ざりやすい。正規化していないと
    // 正当なループバック指定が「ループバック外」と誤判定され、本番が起動しなくなる。
    it.each([
      ["末尾の空白", "127.0.0.1 "],
      ["先頭の空白", " 127.0.0.1"],
      ["末尾の改行", "127.0.0.1\n"],
      ["CRLF", "127.0.0.1\r\n"],
      ["大文字のホスト名", "LOCALHOST"],
      ["大文字小文字混在", "Localhost"],
      ["前後の空白つきホスト名", "  localhost  "],
    ])("整形ゆれ（%s）でも本番の起動を止めない", (_label, host) => {
      const env = {
        NODE_ENV: "production",
        ALLOWED_ORIGINS: "https://tasuki.example.com",
        HOST: host,
      };
      const c = loadSyncConfig(env);
      // 実際の bind にも整形済みの値を使う（末尾空白つきで listen しない）。
      expect(c.host).toBe(host.trim());
    });

    it("HOST が空白だけなら既定の 127.0.0.1 に落ちる", () => {
      const c = loadSyncConfig({ NODE_ENV: "production", ALLOWED_ORIGINS: "https://x.example", HOST: "   " });
      expect(c.host).toBe("127.0.0.1");
    });

    // 許可リストは「正確な値だけを通す」方針。IP ですらない値まで通してはいけない。
    it.each(["127.999.999.999", "127.0.0.256", "127.01.0.1", "127.0.0", "1270.0.0.1"])(
      "127 で始まっても IP として不正な %s は通さない",
      (host) => {
        const env = {
          NODE_ENV: "production",
          ALLOWED_ORIGINS: "https://tasuki.example.com",
          HOST: host,
        };
        expect(() => loadSyncConfig(env)).toThrow(/HOST/);
      },
    );

    it("起動時のエラーは対処方法を伝える", () => {
      const env = { NODE_ENV: "production", ALLOWED_ORIGINS: "https://x.example", HOST: "0.0.0.0" };
      expect(() => loadSyncConfig(env)).toThrow(/対処/);
    });
  });
});
