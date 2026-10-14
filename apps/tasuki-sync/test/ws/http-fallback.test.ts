/**
 * WebSocket に上がらない HTTP の応答（#368 Task 3）。
 *
 * 管理用の経路（`/status`・`/admin/rooms`）は `httpHandler` が答え、答えが無ければ 426 を返す。
 * `httpHandler` へ渡すヘッダは許可表（`x-admin-token` だけ）に絞る（N-4）。実 WS 越しの固定は
 * `ws-adapter.admin.test.ts` にある。ここは純粋な関数として、入出力を直接固定する。
 */
import { describe, expect, it } from "bun:test";
import { respondToPlainHttp, type HttpRequestInfo } from "../../src/adapters/ws/http-fallback.js";

function request(path: string, headers: Record<string, string> = {}): { req: Request; url: URL } {
  const req = new Request(`http://127.0.0.1${path}`, { headers });
  return { req, url: new URL(req.url) };
}

describe("respondToPlainHttp", () => {
  it("Given 結果を返す httpHandler / When 応答を作る / Then その状態・種類・本文で返す", async () => {
    // Given
    const { req, url } = request("/status?x=1");
    // When
    const res = respondToPlainHttp(req, url, () => ({ status: 200, contentType: "application/json", body: "{}" }));
    // Then
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.text()).toBe("{}");
  });

  it("Given null を返す httpHandler / When 応答を作る / Then 426 Upgrade Required", async () => {
    // Given
    const { req, url } = request("/nope");
    // When
    const res = respondToPlainHttp(req, url, () => null);
    // Then
    expect(res.status).toBe(426);
    expect(res.headers.get("content-type")).toBe("text/plain");
    expect(await res.text()).toBe("Upgrade Required");
  });

  it("Given httpHandler が無い / When 応答を作る / Then 426", () => {
    // Given
    const { req, url } = request("/status");
    // When / Then
    expect(respondToPlainHttp(req, url, undefined).status).toBe(426);
  });

  it("Given 許可表に無いヘッダと大文字の X-Admin-Token / When httpHandler へ渡す / Then メソッド・クエリつきのパス・x-admin-token だけが届く", () => {
    // Given
    const { req, url } = request("/admin/rooms?all=1", {
      "X-Admin-Token": "t",
      cookie: "c=1",
      "x-forwarded-for": "203.0.113.1",
    });
    const seen: HttpRequestInfo[] = [];
    // When
    respondToPlainHttp(req, url, (info) => {
      seen.push(info);
      return null;
    });
    // Then
    expect(seen).toEqual([{ method: "GET", path: "/admin/rooms?all=1", headers: { "x-admin-token": "t" } }]);
  });
});
