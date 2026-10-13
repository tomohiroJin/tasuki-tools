/**
 * OPEN のときだけ送る 1 か所（#368 Task 6）。
 *
 * 以前は `send` / `broadcast` の 4 組と `sendXFrame` の 4 つが、それぞれ `readyState === WebSocket.OPEN` を
 * 確かめていた（12 か所）。**閉じかけの接続へ送らない**のは、内部エラーの返事が利用者の切断の後に
 * 走りうるため（`onMessage(...).catch(...)`）。実 WS 越しの固定は `ws-adapter.message.test.ts` にある。
 */
import { describe, expect, it } from "bun:test";
import { sendIfOpen, sendToEach, type SendableSocket } from "../../src/adapters/ws/ws-send.js";

function fakeSocket(readyState: number): SendableSocket & { sent: string[] } {
  const sent: string[] = [];
  return { readyState, sent, send: (data: string) => sent.push(data) };
}

describe("sendIfOpen", () => {
  it("Given OPEN の接続 / When 送る / Then そのまま 1 通送る", () => {
    const ws = fakeSocket(WebSocket.OPEN);
    sendIfOpen(ws, "{}");
    expect(ws.sent).toEqual(["{}"]);
  });

  for (const [label, state] of [
    ["CONNECTING", WebSocket.CONNECTING],
    ["CLOSING", WebSocket.CLOSING],
    ["CLOSED", WebSocket.CLOSED],
  ] as const) {
    it(`Given ${label} の接続 / When 送る / Then 送らない`, () => {
      const ws = fakeSocket(state);
      sendIfOpen(ws, "{}");
      expect(ws.sent).toEqual([]);
    });
  }

  it("Given 接続が無い（知らない接続 ID） / When 送る / Then 何もしない", () => {
    expect(() => sendIfOpen(undefined, "{}")).not.toThrow();
  });
});

describe("sendToEach", () => {
  it("Given 3 つの接続（1 つは閉じている） / When 2 つと知らない ID へ送る / Then 宛先の OPEN の接続にだけ同じ文字列を送る", () => {
    // Given
    const a = fakeSocket(WebSocket.OPEN);
    const b = fakeSocket(WebSocket.OPEN);
    const c = fakeSocket(WebSocket.CLOSED);
    const peers = new Map([
      ["a", a],
      ["b", b],
      ["c", c],
    ]);
    // When
    sendToEach(peers, ["a", "c", "x"], '{"n":1}');
    // Then
    expect([a.sent, b.sent, c.sent]).toEqual([['{"n":1}'], [], []]);
  });
});
