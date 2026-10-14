/**
 * 同期サーバーへ繋ぐ URL（#369 Task 2）。
 *
 * 入口は `/ws` の 1 本で、ツールはクエリ（`?tool=`）が宣言する（#95 S5c）。玄関（ハブ）は何も宣言しない。
 * 以前は 5 つの web アプリが同じ組み立てを写していた。ここへ 1 つにし、写しが残っていないことは
 * `scripts/audit-web-sync-boundary.mjs`（検査 4）が見る。
 */
import { describe, expect, it } from "vitest";
import { SYNC_PATH, buildSyncUrl } from "../src/sync-url.js";

describe("buildSyncUrl", () => {
  it("Given https / When ツールを宣言する / Then wss でツールの入口を指す", () => {
    expect(buildSyncUrl({ protocol: "https:", host: "tasuki.example" }, "timer")).toBe(
      "wss://tasuki.example/ws?tool=timer",
    );
  });

  it("Given http とポートつきのホスト / When ツールを宣言する / Then ws でそのホストを指す", () => {
    expect(buildSyncUrl({ protocol: "http:", host: "localhost:5173" }, "roulette")).toBe(
      "ws://localhost:5173/ws?tool=roulette",
    );
  });

  it("Given 玄関（ツールを宣言しない） / When 作る / Then クエリを付けない", () => {
    expect(buildSyncUrl({ protocol: "https:", host: "h" }, null)).toBe("wss://h/ws");
  });

  it("Given 入口のパス / When 読む / Then /ws（Caddy の断片が受けるパス）", () => {
    expect(SYNC_PATH).toBe("/ws");
  });
});
