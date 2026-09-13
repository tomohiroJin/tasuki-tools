/**
 * `ConnectionData` が接続の文脈（`protocol`）ごとに割れていることを実行時に確かめる
 * （#95 S5c・#249。S4b からの申し送り）。
 *
 * **型の性質は型検査では掴めない。** `apps/tasuki-sync/tsconfig.json` の `include` は
 * `["src/**\/*"]` でテストを対象にしないため、`ConnectionData` が判別可能ユニオンに
 * なっていること自体はここでは検証できない。代わりに、実際に開いた接続の `ws.data` を
 * 覗いて「poker 専用の項目（`participantId` / `roomId`）が timer の接続に無い」
 * 「poker の接続には両方ある」ことを実行時に確かめる。
 *
 * **`Bun.serve` を一時的に差し替えて、開いた生のソケットを捕まえる。** `WsAdapter` は
 * 接続ごとの `data`（`ConnectionData`）を private な `connections` にしか持たず、
 * 外から覗く手段が無い。`websocket.open` フックの手前でソケットを配列へ積む
 * 薄いラッパーを挟むだけで、差し替え自体は `WsAdapter` の構築が終わったら元に戻す
 * （以後に開く接続にも、構築時に登録済みのラップされたフックがそのまま効き続ける）。
 */
import { afterEach, describe, expect, it } from "bun:test";
import { WsAdapter } from "../src/adapters/ws-adapter.js";
import { newTestWsAdapter } from "./support/test-ws-adapter.js";
import { testLogger } from "./support/test-logger.js";

let adapter: WsAdapter | undefined;

afterEach(async () => {
  await adapter?.close();
  adapter = undefined;
});

/** open イベントを待つ。 */
function opened(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", () => reject(new Error("接続できない")), { once: true });
  });
}

/**
 * アダプタを `port: 0` で起動し、開いた生のソケット（`ws.data` を覗ける形）を
 * `sockets` へ積みながら返す。
 */
function startAdapterCapturingSockets(): {
  port: number;
  sockets: Array<{ data: Record<string, unknown> }>;
} {
  const sockets: Array<{ data: Record<string, unknown> }> = [];
  const originalServe = Bun.serve;
  Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
    const openHook = options.websocket?.open;
    return originalServe({
      ...options,
      websocket: {
        ...options.websocket,
        open: (ws: { data: Record<string, unknown> }) => {
          sockets.push(ws);
          openHook?.(ws as never);
        },
      },
    } as never);
  }) as typeof Bun.serve;

  try {
    adapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      onMessage: async () => {},
      onDisconnect: () => {},
      logger: testLogger,
    });
  } finally {
    // 以後に開く接続には、構築時に Bun.serve へ登録済みのラップされたフックが効く。
    // グローバルの差し替え自体はここで戻し、他のテストへ漏らさない。
    Bun.serve = originalServe;
  }

  return { port: adapter.port, sockets };
}

describe("接続ごとに持ち回る値は文脈ごとに分かれている", () => {
  it("Given timer の接続 / When 受理される / Then poker 専用の項目を持たない", async () => {
    // Given: `?tool=timer` で繋ぐ
    const { port, sockets } = startAdapterCapturingSockets();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?tool=timer`);
    await opened(ws);

    // Then: timer の接続データに poker 専用の 2 項目（participantId / roomId）が無い
    const data = sockets.at(-1)!.data;
    expect(Object.hasOwn(data, "participantId")).toBe(false);
    expect(Object.hasOwn(data, "roomId")).toBe(false);

    ws.close();
  });

  it("Given poker の接続 / When 受理される / Then poker 専用の項目を両方持つ", async () => {
    // Given: `?tool=poker` で繋ぐ
    const { port, sockets } = startAdapterCapturingSockets();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?tool=poker`);
    await opened(ws);

    // Then: poker の接続データには participantId / roomId が両方あり、join 前は null
    const data = sockets.at(-1)!.data;
    expect(Object.hasOwn(data, "participantId")).toBe(true);
    expect(Object.hasOwn(data, "roomId")).toBe(true);
    expect(data["participantId"]).toBeNull();
    expect(data["roomId"]).toBeNull();

    ws.close();
  });
});
