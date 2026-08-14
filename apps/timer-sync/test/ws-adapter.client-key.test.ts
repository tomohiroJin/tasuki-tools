/**
 * WsAdapter がクライアント鍵を導出して onConnect へ渡すことのテスト。
 *
 * `ws`（npm）の WebSocket はコンストラクタでリクエストヘッダを足せるので、
 * X-Forwarded-For を持つ接続を実際に張って確かめられる。
 *
 * 境界値は族で網羅する: XFF が無い / 空 / 不正な値 / 正常な IPv4 / 正常な IPv6 /
 * カンマ区切り（複数ホップ） / Origin 検査で弾かれた接続 / 接続数上限で弾かれた接続 /
 * 鍵導出そのものが例外を投げた接続 / onConnect が例外を投げた接続。
 */
import { describe, it, expect, afterEach } from "bun:test";
import { WebSocket } from "ws";
import { WsAdapter } from "../src/adapters/ws-adapter.js";
import { createClientKeyDeriver } from "@tasuki/rate-limit";
import { testLogger, collectingLogger } from "./support/test-logger.js";

let adapter: WsAdapter | undefined;
afterEach(async () => {
  await adapter?.close();
  adapter = undefined;
});

function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.on("open", () => resolve());
    ws.on("error", reject);
  });
}

/** close イベント（code）を待つ。 */
function waitClose(ws: WebSocket): Promise<number> {
  return new Promise((resolve) => ws.on("close", (code) => resolve(code)));
}

/**
 * 条件が満たされるまで短い間隔でポーリングする。
 *
 * Issue #139（poker-sync の heartbeat テスト）で、固定の短い sleep 待ちが
 * 共有ランナーの停滞で偽の赤を出す実例を踏んでいる。ここでは「時間」ではなく
 * 「onConnect が実際に記録されたか」を条件にし、上限時間は十分に長く取る。
 */
async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`waitFor: ${timeoutMs}ms 待ったが条件を満たさなかった`);
    }
    await Bun.sleep(5);
  }
}

/** onConnect が受け取った (connId, rateKey) を集める */
function startAdapter(
  options: Partial<ConstructorParameters<typeof WsAdapter>[0]> = {},
): { url: string; seen: Array<[string, string]> } {
  const seen: Array<[string, string]> = [];
  adapter = new WsAdapter({
    port: 0,
    host: "127.0.0.1",
    allowedOrigins: [],
    onMessage: async () => {},
    onDisconnect: () => {},
    onConnect: (connId, rateKey) => seen.push([connId, rateKey]),
    deriveClientKey: createClientKeyDeriver(new Uint8Array(32).fill(9)),
    logger: testLogger,
    ...options,
  });
  return { url: `ws://127.0.0.1:${adapter.port}`, seen };
}

describe("WsAdapter のクライアント鍵", () => {
  it("X-Forwarded-For（正常な IPv4）があれば、そこから導いた鍵を onConnect へ渡す", async () => {
    const { url, seen } = startAdapter();
    const ws = new WebSocket(url, { headers: { "x-forwarded-for": "203.0.113.7" } });
    await waitOpen(ws);
    // Minor 3: onConnect が同期呼び出しであることをここで固定する。下の
    // 「Origin 検査で弾かれた接続では onConnect を呼ばない」テストは、
    // クライアントが close を観測した時点で onConnect 呼び出しの可能性が
    // 制御フロー上すでに無いという前提（待たずに判定してよい）に依拠している。
    // onConnect が将来どこかで遅延呼び出しに変わると、この行が真っ先に赤くなる。
    expect(seen).toHaveLength(1);
    await waitFor(() => seen.length === 1);

    expect(seen).toHaveLength(1);
    const [connId, rateKey] = seen[0]!;
    expect(rateKey).not.toBe(connId);
    expect(rateKey).not.toContain("203.0.113.7");
    ws.close();
  });

  it("同じ /64 の別 IPv6 アドレスからは同じ鍵になる", async () => {
    const { url, seen } = startAdapter();
    const a = new WebSocket(url, { headers: { "x-forwarded-for": "2001:db8::1" } });
    await waitOpen(a);
    const b = new WebSocket(url, { headers: { "x-forwarded-for": "2001:DB8::dead:beef" } });
    await waitOpen(b);
    await waitFor(() => seen.length === 2);

    expect(seen).toHaveLength(2);
    expect(seen[0]![1]).toBe(seen[1]![1]);
    a.close();
    b.close();
  });

  it("カンマ区切りの X-Forwarded-For は最後の要素から鍵を導く（M7 の検出）", async () => {
    // packages/rate-limit の単体テストは「最後の要素を採る」を押さえているが、
    // アダプタが実際にその文字列を渡しているかは別問題（変異検査で M7 として生存した）。
    // 「9.9.9.9, 203.0.113.7」経由の鍵と「203.0.113.7」単独の鍵が一致することを見て、
    // アダプタが最初の要素を使う改変が入れば赤くなるようにする。
    const { url, seen } = startAdapter();
    const a = new WebSocket(url, { headers: { "x-forwarded-for": "9.9.9.9, 203.0.113.7" } });
    await waitOpen(a);
    const b = new WebSocket(url, { headers: { "x-forwarded-for": "203.0.113.7" } });
    await waitOpen(b);
    await waitFor(() => seen.length === 2);

    expect(seen).toHaveLength(2);
    expect(seen[0]![1]).toBe(seen[1]![1]);
    a.close();
    b.close();
  });

  it("X-Forwarded-For が無ければ connId が鍵になる", async () => {
    const { url, seen } = startAdapter();
    const ws = new WebSocket(url);
    await waitOpen(ws);
    await waitFor(() => seen.length === 1);

    expect(seen).toHaveLength(1);
    const [connId, rateKey] = seen[0]!;
    expect(rateKey).toBe(connId);
    ws.close();
  });

  it("X-Forwarded-For が空文字なら connId が鍵になる", async () => {
    const { url, seen } = startAdapter();
    const ws = new WebSocket(url, { headers: { "x-forwarded-for": "" } });
    await waitOpen(ws);
    await waitFor(() => seen.length === 1);

    expect(seen).toHaveLength(1);
    const [connId, rateKey] = seen[0]!;
    expect(rateKey).toBe(connId);
    ws.close();
  });

  it("X-Forwarded-For が IP と解釈できない値なら connId が鍵になる", async () => {
    const { url, seen } = startAdapter();
    const ws = new WebSocket(url, { headers: { "x-forwarded-for": "not-an-ip-address" } });
    await waitOpen(ws);
    await waitFor(() => seen.length === 1);

    expect(seen).toHaveLength(1);
    const [connId, rateKey] = seen[0]!;
    expect(rateKey).toBe(connId);
    ws.close();
  });

  it("Origin 検査で弾かれた接続では onConnect を呼ばない", async () => {
    const { url, seen } = startAdapter({ allowedOrigins: ["https://allowed.example"] });
    const ws = new WebSocket(url, {
      origin: "https://evil.example",
      headers: { "x-forwarded-for": "203.0.113.9" },
    });
    // 待ちは不要: handleOpen の Origin 検査は onConnect の呼び出しより前に
    // return するため、close イベントが届いた時点で onConnect 呼び出しの
    // 可能性は制御フロー上すでに無い（タイミングではなく分岐の話）。
    await waitClose(ws);

    expect(seen).toHaveLength(0);
  });

  it("接続数上限で弾かれた接続では onConnect を呼ばない", async () => {
    const { url, seen } = startAdapter({ maxConnections: 1 });
    const first = new WebSocket(url, { headers: { "x-forwarded-for": "203.0.113.1" } });
    await waitOpen(first);
    // 上限に達した状態で 2 本目を張る
    const second = new WebSocket(url, { headers: { "x-forwarded-for": "203.0.113.2" } });
    // 待ちは不要: 上記と同じ理由（接続数上限の分岐も onConnect より前に return する）。
    await waitClose(second);

    expect(seen).toHaveLength(1);
    expect(seen[0]![1]).not.toBe("conn-2");
    first.close();
  });
});

describe("WsAdapter のクライアント鍵導出が失敗したとき", () => {
  it("deriveClientKey が throw しても接続は壊れず、鍵は null 扱いになる", async () => {
    const seen: Array<[string, string]> = [];
    adapter = new WsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      onMessage: async () => {},
      onDisconnect: () => {},
      onConnect: (connId, rateKey) => seen.push([connId, rateKey]),
      deriveClientKey: () => {
        throw new Error("derive failed for 203.0.113.88");
      },
      logger: testLogger,
    });
    const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}`, {
      headers: { "x-forwarded-for": "203.0.113.88" },
    });

    // (a) 接続が壊れない
    await waitOpen(ws);
    await waitFor(() => seen.length === 1);
    const [connId, rateKey] = seen[0]!;
    // 鍵を特定できなかった扱い（connId にフォールバック）。
    expect(rateKey).toBe(connId);
    ws.close();
  });

  it("deriveClientKey が throw したら、ロガに記録され、XFF の値は載らない", async () => {
    const { logger, lines } = collectingLogger();
    adapter = new WsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      onMessage: async () => {},
      onDisconnect: () => {},
      deriveClientKey: () => {
        throw new Error("derive failed for 203.0.113.88");
      },
      logger,
    });
    const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}`, {
      headers: { "x-forwarded-for": "203.0.113.88" },
    });
    await waitOpen(ws);
    await waitFor(() => lines.length > 0);

    // (b) ロガにエラーが記録される
    expect(lines.some((line) => line.startsWith("derive-client-key-error"))).toBe(true);
    // (c) XFF の値（生の IP・例外メッセージ）はログに載らない
    for (const line of lines) {
      expect(line).not.toContain("203.0.113.88");
      expect(line).not.toContain("derive failed for");
    }
    ws.close();
  });
});

/**
 * `.name` へのアクセス自体が throw する例外。`instanceof Error` は true になるが、
 * `err.name` の読み出しがそのまま TypeError を投げる（I-1 の 3 ケース目）。
 */
class NameGetterThrowsError extends Error {
  override get name(): string {
    throw new Error("name getter boom");
  }
}

/**
 * I-1 の 3 ケース: `throw null` / `throw undefined` / `name` ゲッタが throw する例外。
 * `(err as Error).name` はどれでも実行時に TypeError を出す（`catch` 節そのものが
 * throw する）。`deriveClientKey` 側・`onConnect` 側の両方の catch で検査する。
 */
const CATCH_THROWS_CASES: Array<[string, () => unknown]> = [
  ["null", () => null],
  ["undefined", () => undefined],
  ["name ゲッタが throw する例外", () => new NameGetterThrowsError("boom")],
];

describe.each(CATCH_THROWS_CASES)(
  "deriveClientKey が %s を throw したとき（I-1）",
  (_label, makeErr) => {
    it("(a) 接続は壊れず、鍵は connId にフォールバックする", async () => {
      const seen: Array<[string, string]> = [];
      adapter = new WsAdapter({
        port: 0,
        host: "127.0.0.1",
        allowedOrigins: [],
        onMessage: async () => {},
        onDisconnect: () => {},
        onConnect: (connId, rateKey) => seen.push([connId, rateKey]),
        deriveClientKey: () => {
          throw makeErr();
        },
        logger: testLogger,
      });
      const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}`, {
        headers: { "x-forwarded-for": "203.0.113.88" },
      });

      await waitOpen(ws);
      await waitFor(() => seen.length === 1);
      const [connId, rateKey] = seen[0]!;
      expect(rateKey).toBe(connId);
      ws.close();
    });

    it("(c) ログに分類が記録される", async () => {
      const { logger, lines } = collectingLogger();
      adapter = new WsAdapter({
        port: 0,
        host: "127.0.0.1",
        allowedOrigins: [],
        onMessage: async () => {},
        onDisconnect: () => {},
        deriveClientKey: () => {
          throw makeErr();
        },
        logger,
      });
      const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}`);
      await waitOpen(ws);
      await waitFor(() => lines.length > 0);
      expect(lines.some((line) => line.startsWith("derive-client-key-error"))).toBe(true);
      ws.close();
    });
  },
);

describe("WsAdapter の onConnect が例外を投げたとき", () => {
  it("接続は確立し、プロセスは落ちず、ログにエラーが記録される（Task 5 の gate.open() 配線の地雷対策）", async () => {
    const { logger, lines } = collectingLogger();
    let closeSeen = false;
    adapter = new WsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      onMessage: async () => {},
      onDisconnect: () => {
        closeSeen = true;
      },
      onConnect: () => {
        throw new Error("boom");
      },
      logger,
    });
    const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}`);

    // 接続は確立する（onConnect の例外で接続処理が壊れない）。
    await waitOpen(ws);
    await waitFor(() => lines.length > 0);
    expect(lines.some((line) => line.startsWith("on-connect-error"))).toBe(true);

    ws.close();
    await waitFor(() => closeSeen);
    // connections への登録（ws.data.connId の採番）は onConnect の前に済んでいるため、
    // onConnect が失敗しても close 側の後始末（onDisconnect）は従来どおり動く。
    expect(closeSeen).toBe(true);
  });
});

describe.each(CATCH_THROWS_CASES)("onConnect が %s を throw したとき（I-1）", (_label, makeErr) => {
  it("(a) 接続は確立し (b) プロセスは落ちず (c) ログに分類が記録される", async () => {
    const { logger, lines } = collectingLogger();
    adapter = new WsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      onMessage: async () => {},
      onDisconnect: () => {},
      onConnect: () => {
        throw makeErr();
      },
      logger,
    });
    const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}`);

    // (a) 接続は確立する
    await waitOpen(ws);
    await waitFor(() => lines.length > 0);
    // (c) ログに分類が記録される
    expect(lines.some((line) => line.startsWith("on-connect-error"))).toBe(true);
    ws.close();
  });
});

describe("例外の name によるログ注入（Minor 1）", () => {
  it("name に長大・偽の key=value を含めても、丸められて偽の key=value を生やせない", async () => {
    const { logger, lines } = collectingLogger();
    // 偽装: 空白区切りで別の key=value を差し込もうとする長い name。
    const evilName = "Error xff=203.0.113.88 level=info fake".repeat(3);
    adapter = new WsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      onMessage: async () => {},
      onDisconnect: () => {},
      deriveClientKey: () => {
        const err = new Error("boom");
        err.name = evilName;
        throw err;
      },
      logger,
    });
    const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}`);
    await waitOpen(ws);
    await waitFor(() => lines.length > 0);

    const line = lines.find((l) => l.startsWith("derive-client-key-error"));
    expect(line).toBeDefined();
    // 偽の key=value を生やせない（空白と `=` が残らない）
    expect(line).not.toContain("xff=203.0.113.88");
    expect(line).not.toContain("level=info");
    // 長さが丸められている（元の evilName よりずっと短い）
    expect(line!.length).toBeLessThan(evilName.length);
    ws.close();
  });
});

describe("WsAdapter の onDisconnect が例外を投げたとき（I-5）", () => {
  it("プロセスは落ちず、ログにエラーが記録される", async () => {
    const { logger, lines } = collectingLogger();
    adapter = new WsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      onMessage: async () => {},
      onDisconnect: () => {
        throw new Error("boom on close");
      },
      logger,
    });
    const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}`);
    await waitOpen(ws);
    ws.close();
    await waitFor(() => lines.some((line) => line.startsWith("on-disconnect-error")));
    expect(lines.some((line) => line.startsWith("on-disconnect-error"))).toBe(true);
  });

  it("プロセスは落ちておらず、同じアダプタで次の接続を受け付けられる", async () => {
    const { logger, lines } = collectingLogger();
    adapter = new WsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      onMessage: async () => {},
      onDisconnect: () => {
        throw new Error("boom on close");
      },
      logger,
    });
    const first = new WebSocket(`ws://127.0.0.1:${adapter.port}`);
    await waitOpen(first);
    first.close();
    await waitFor(() => lines.length > 0);

    // onDisconnect の例外で uncaughtException になっていれば、本番の
    // server.ts は process.exit(1) するためこの接続は張れない（間接証拠）。
    const second = new WebSocket(`ws://127.0.0.1:${adapter.port}`);
    await waitOpen(second);
    second.close();
  });
});
