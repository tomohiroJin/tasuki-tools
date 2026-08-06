/**
 * 同期サーバーへの WebSocket URL の組み立て（S4 / #19）。
 *
 * timer は `/` から `/timer/` へ移設され、WS も `/timer/ws` になった。
 * この値は Caddy 断片（`deploy/timer/caddy/10-timer-ws.conf`）と一致していなければ
 * 接続できない。App.tsx に直書きされていたときはテストから触れず、移設漏れを
 * 検出する手段が無かったため、関数として切り出して固定する。
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildSyncUrl, SYNC_PATH } from "../../src/sync/sync-url";

/** リポジトリルートを上方向に探す（jsdom では import.meta.url が使えないため）。 */
function findRepoRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(path.join(dir, "deploy")) && existsSync(path.join(dir, "apps"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`リポジトリルートが見つからない（${from} から探索）`);
    dir = parent;
  }
}

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

describe("SYNC_PATH と本番の Caddy 断片", () => {
  it("Given 本番の断片 / When 受け付けるパスを読む / Then SYNC_PATH と一致する", () => {
    // Given: 本番へ設置される Caddy 断片
    // When: そこが受け付ける WebSocket のパスを読む
    // Then: クライアントが繋ぐ先（SYNC_PATH）と一致する
    //
    // 両者は別ファイルにある同じ値で、食い違っても どちらのファイルを見ても正しく見える。
    // 移設のたびに人が突き合わせるのをやめ、ここで機械的に固定する。
    const fragment = readFileSync(
      path.join(findRepoRoot(process.cwd()), "deploy/timer/caddy/10-timer-ws.conf"),
      "utf8",
    );
    const handled = /^\s*handle\s+(\S+)\s*\{/m.exec(
      fragment
        .split("\n")
        .filter((line) => !line.trim().startsWith("#"))
        .join("\n"),
    );

    expect(handled?.[1]).toBe(SYNC_PATH);
  });

  it("Given 本番の断片 / When rewrite 先を読む / Then sync サーバーが待つ /ws に戻している", () => {
    // Given: 本番へ設置される Caddy 断片
    // When: sync へ渡す前の rewrite を読む
    // Then: 公開パスを剥がして /ws に戻している
    //
    // ここが欠けると sync に /timer/ws がそのまま届く（timer-sync はパスを見ないので
    // 今は通るが、sync が受けるパスを 1 つに保つのが意図）。
    const fragment = readFileSync(
      path.join(findRepoRoot(process.cwd()), "deploy/timer/caddy/10-timer-ws.conf"),
      "utf8",
    );

    expect(fragment).toMatch(/^\s*rewrite\s+\*\s+\/ws\s*$/m);
  });
});
