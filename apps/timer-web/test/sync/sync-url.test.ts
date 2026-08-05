/**
 * 同期サーバーへの WebSocket URL の組み立て（S4 / #19）。
 *
 * timer は `/` から `/timer/` へ移設され、WS も `/timer/ws` になった。
 * この値は Caddy 断片（`deploy/timer/caddy/10-timer-ws.conf`）と一致していなければ
 * 接続できない。App.tsx に直書きされていたときはテストから触れず、移設漏れを
 * 検出する手段が無かったため、関数として切り出して固定する。
 */
import { describe, it, expect } from "vitest";
import { buildSyncUrl, SYNC_PATH } from "../../src/sync/sync-url";

describe("buildSyncUrl", () => {
  it("https のページからは wss で繋ぐ", () => {
    // Given: TLS で配信されているページ
    // When: 同期先の URL を組み立てる
    // Then: 暗号化された WebSocket になる（混在コンテンツにしない）
    expect(buildSyncUrl({ protocol: "https:", host: "tasuki.example" })).toBe(
      "wss://tasuki.example/timer/ws",
    );
  });

  it("http のページからは ws で繋ぐ", () => {
    // Given: 開発サーバー（平文）
    // When: 同期先の URL を組み立てる
    // Then: 平文の WebSocket になる
    expect(buildSyncUrl({ protocol: "http:", host: "localhost:5173" })).toBe(
      "ws://localhost:5173/timer/ws",
    );
  });

  it("ホストはポートごとそのまま使う（開発サーバーのポートを落とさない）", () => {
    expect(buildSyncUrl({ protocol: "http:", host: "127.0.0.1:4173" })).toContain("127.0.0.1:4173");
  });

  it("パスは公開パス配下の /timer/ws に固定する", () => {
    // Caddy は /timer/ws を受けて sync の /ws へ rewrite する。
    // ここが `/ws` のままだと、包括フォールバック（LP）に吸われて
    // WebSocket ではなく index.html が 200 で返る。
    expect(SYNC_PATH).toBe("/timer/ws");
    expect(buildSyncUrl({ protocol: "https:", host: "h" })).toMatch(/\/timer\/ws$/);
  });

  it("ルート直下（/ws）には繋がない", () => {
    // LP がルートを占めるため、/ws は timer のものではなくなった。
    expect(buildSyncUrl({ protocol: "https:", host: "h" })).not.toBe("wss://h/ws");
  });
});
