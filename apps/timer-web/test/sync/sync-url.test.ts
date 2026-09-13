/**
 * 同期サーバーへの WebSocket URL の組み立て（S4 / #19・#95 S5c）。
 *
 * S5c で入口を玄関と同じ `/ws` 1 本へ畳んだ。S5b までは `/timer/ws` という経路
 * そのものがツールの宣言だったが、入口を畳んだ以上、経路ではツールを決められない。
 * ここではクエリ（`?tool=timer`）がツールを宣言する。
 *
 * この値は Caddy 断片（`deploy/landing/caddy/05-hub-ws.conf`）が受ける `/ws` と
 * 一致していなければ接続できない。App.tsx に直書きされていたときはテストから触れず、
 * 移設漏れを検出する手段が無かったため、関数として切り出して固定する。
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
  it("Given https の玄関 / When URL を組み立てる / Then wss でツールを宣言する", () => {
    // Given: TLS で配信されているページ
    // When: 同期先の URL を組み立てる
    // Then: 暗号化された WebSocket で、ツール（timer）をクエリで宣言する

    expect(buildSyncUrl({ protocol: "https:", host: "tasuki.example" })).toBe(
      "wss://tasuki.example/ws?tool=timer",
    );
  });

  it("Given http の玄関 / When URL を組み立てる / Then ws でツールを宣言する", () => {
    // Given: 開発サーバー（平文）
    // When: 同期先の URL を組み立てる
    // Then: 平文の WebSocket で、ツール（timer）をクエリで宣言する

    expect(buildSyncUrl({ protocol: "http:", host: "localhost:5173" })).toBe(
      "ws://localhost:5173/ws?tool=timer",
    );
  });

  it("ホストはポートごとそのまま使う（開発サーバーのポートを落とさない）", () => {
    expect(buildSyncUrl({ protocol: "http:", host: "127.0.0.1:4173" })).toContain("127.0.0.1:4173");
  });

  it("パスはハブと同じ /ws で、ツールはクエリが宣言する", () => {
    // Caddy 断片は `/ws` だけを受け、クエリはそのまま上流へ渡る（#95 S5c）。
    expect(SYNC_PATH).toBe("/ws?tool=timer");
  });
});

describe("SYNC_PATH と本番の Caddy 断片", () => {
  it("Given 本番のハブの断片 / When 受け付けるパスを読む / Then SYNC_PATH のパス部分と一致する", () => {
    // Given: 本番へ設置されるハブの Caddy 断片
    // When: そこが受け付ける WebSocket のパスを読む
    // Then: クライアントが繋ぐ先（SYNC_PATH のパス部分）と一致する
    //
    // 両者は別ファイルにある同じ値で、食い違っても どちらのファイルを見ても正しく見える。
    // 移設のたびに人が突き合わせるのをやめ、ここで機械的に固定する。
    // Caddy の `handle` はパスだけで振り分け、クエリは見ない（そのまま上流へ渡る）ため、
    // 突き合わせは SYNC_PATH からクエリを落としたパス部分だけで行う。

    const fragment = readFileSync(
      path.join(findRepoRoot(process.cwd()), "deploy/landing/caddy/05-hub-ws.conf"),
      "utf8",
    );
    const handled = /^\s*handle\s+(\S+)\s*\{/m.exec(
      fragment
        .split("\n")
        .filter((line) => !line.trim().startsWith("#"))
        .join("\n"),
    );

    expect(handled?.[1]).toBe(SYNC_PATH.split("?")[0]);
  });

  it("Given 本番のハブの断片 / When rewrite を探す / Then 1 つも無い", () => {
    // Given: 本番へ設置されるハブの Caddy 断片
    const fragment = readFileSync(
      path.join(findRepoRoot(process.cwd()), "deploy/landing/caddy/05-hub-ws.conf"),
      "utf8",
    );

    // #95 S5a で `rewrite * /ws` を外した。
    // When / Then: **剥がしてはならない。** 統合サーバーは 1 つの待ち受けで複数の
    // メッセージ層を捌き、どれへ流すかをパスだけで決めている
    // （`apps/tasuki-sync/src/adapters/ws-adapter.ts`）。
    // コメント行は落として見る —— 経緯の説明に `rewrite` の語が出てくるため。
    const body = fragment
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    expect(body).not.toMatch(/\brewrite\b/);
  });
});
