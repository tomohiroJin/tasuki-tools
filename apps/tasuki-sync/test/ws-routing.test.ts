/**
 * WS の入口の振り分け（#95 S2・設計正本 D10）。
 *
 * 統合サーバーは 1 つの待ち受けで 2 つのプロトコルを捌く。**どちらへ流れるかを
 * 決めているのはパスだけ**なので、その対応をここで機械的に固定する
 * （`src/adapters/ws-adapter.ts` の `POKER_WS_PATH`）。
 *
 * ## なぜ既存のテストでは足りないか
 *
 * poker のテスト群は `/poker/ws` へ、timer のテスト群は素のポート（`/`）へ繋ぐので、
 * 「`/poker/ws` が poker へ行く」「`/` が timer へ行く」の 2 つは既に守られている。
 * **守られていないのは `/ws` と `/timer/ws`** で、この 2 本は本番の Caddy 断片
 * （`deploy/timer/caddy/10-timer-ws.conf` が `/timer/ws` → `/ws` へ rewrite する）と
 * 移行期の約束（D10: 移行中は 3 つを受ける）が生きている経路である。
 *
 * ## 判別の仕方
 *
 * 同じ 1 つのメッセージ（poker の `create-room`）を送り、**どちらのプロトコルが
 * 答えたか**で判定する。timer の `CommandSchema` はこれを知らないので
 * `INVALID_COMMAND` を返し、poker は `joined` を返す。両者の応答は形も語彙も
 * 重ならないため、取り違えを空振りではなく赤で検出できる。
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { loadSyncConfig } from "../src/config.js";
import { createSyncServer, type SyncServer } from "../src/create-sync-server.js";

let server: SyncServer;

beforeAll(() => {
  server = createSyncServer(loadSyncConfig({ PORT: "0" }));
});

afterAll(async () => {
  await server.close();
});

/** `path` へ繋ぎ、poker の `create-room` を 1 通投げて最初の応答を返す。 */
async function firstReplyTo(path: string): Promise<Record<string, unknown>> {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}${path}`);
  try {
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", () => reject(new Error(`接続できない: ${path}`)), {
        once: true,
      });
    });
    const reply = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`応答が来ない: ${path}`)), 5_000);
      ws.addEventListener(
        "message",
        (event) => {
          clearTimeout(timer);
          resolve(JSON.parse(String(event.data)) as Record<string, unknown>);
        },
        { once: true },
      );
    });
    ws.send(JSON.stringify({ type: "create-room", name: "たろう" }));
    return await reply;
  } finally {
    ws.close();
  }
}

describe("WS の入口の振り分け", () => {
  // 移行期に受ける 3 つのうち timer 側の 2 つと、統合前から timer が受けていた素のパス。
  // 素のパス（`/`）を残すのは、統合前の timer がパスを一切見ずに upgrade しており、
  // 実 WS 越しのテストがそこへ繋いでいるためである（許可リストへ絞ると全滅する）。
  it.each(["/ws", "/timer/ws", "/"])("%s は timer のメッセージ層へ行く", async (path) => {
    // Given: 統合サーバー（beforeAll で起動済み）
    // When: poker のコマンドを timer 側の入口へ送る
    const reply = await firstReplyTo(path);
    // Then: timer が「知らないコマンド」として返す
    expect(reply["type"]).toBe("error");
    expect(reply["code"]).toBe("INVALID_COMMAND");
  });

  it("/poker/ws は poker のメッセージ層へ行く", async () => {
    // Given: 統合サーバー（beforeAll で起動済み）
    // When: poker のコマンドを poker の入口へ送る
    const reply = await firstReplyTo("/poker/ws");
    // Then: poker が受け付けてルームを作る
    expect(reply["type"]).toBe("joined");
    expect(reply["roomId"]).toMatch(/^[a-z0-9]+$/);
  });

  // Caddy の `path` マッチャは大小を区別せず、綴りをそのまま上流へ渡す
  // （2026-09-08 に 2.11.4 で実測）。統合前は断片の `rewrite * /ws` が綴りごと
  // 正規化していたが、rewrite を外したのでここで吸収する。厳密比較へ戻すと、
  // **接続はできるのに全コマンドが INVALID_COMMAND になる**静かな壊れ方をする。
  it.each(["/POKER/WS", "/Poker/Ws", "/poker/WS"])(
    "%s も poker のメッセージ層へ行く（Caddy は大小を区別しない）",
    async (path) => {
      // Given: 統合サーバー（beforeAll で起動済み）
      // When: 綴りの違う poker の入口へ poker のコマンドを送る
      const reply = await firstReplyTo(path);
      // Then: poker が受け付ける
      expect(reply["type"]).toBe("joined");
    },
  );

  it("poker の入口は timer のコマンドを受け付けない（逆向きの取り違えも塞ぐ）", async () => {
    // Given: 統合サーバー（beforeAll で起動済み）
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/poker/ws`);
    try {
      await new Promise<void>((resolve, reject) => {
        ws.addEventListener("open", () => resolve(), { once: true });
        ws.addEventListener("error", () => reject(new Error("接続できない")), { once: true });
      });
      const reply = new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("応答が来ない")), 5_000);
        ws.addEventListener(
          "message",
          (event) => {
            clearTimeout(timer);
            resolve(JSON.parse(String(event.data)) as Record<string, unknown>);
          },
          { once: true },
        );
      });
      // When: timer のコマンド（`room.create`）を poker の入口へ送る
      ws.send(JSON.stringify({ command: "room.create", displayName: "たろう" }));
      // Then: poker のエラー語彙（小文字ハイフン）で返る。timer の
      // `INVALID_COMMAND`（大文字）ではないことが、取り違えていない証拠になる
      const msg = await reply;
      expect(msg["type"]).toBe("error");
      expect(msg["code"]).toBe("invalid-message");
    } finally {
      ws.close();
    }
  });
});
