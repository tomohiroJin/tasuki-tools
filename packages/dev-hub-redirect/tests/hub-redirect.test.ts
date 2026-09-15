/**
 * dev サーバーの `/` を玄関へ 302 で送り返す middleware の固定（#95 S5c 追補・#249）。
 *
 * timer / poker の dev サーバーを直接開くと、旧入口撤去（#95 S5c）で `/` へ
 * 送り返された先がその dev サーバー自身の base リダイレクトで `/timer/`（`/poker/`）へ
 * 戻され、無限リロードになる（実測: 8 秒で timer 65 回・poker 157 回）。
 * `hubRedirectPlugin` を Vite の内部 middleware より前に挿すことでループを断つ。
 *
 * ここではプラグイン本体の振る舞いだけを見る。**timer と poker の
 * `vite.config.ts` が実際にこれを配線しているか**は
 * `apps/landing/tests/dev-hub-redirect-wiring.test.ts` が見る（片方だけ直す事故を拾うため、
 * 2 つの config を同じ表明に通す）。パッケージから apps を取り込むことはできない
 * （依存の向きが逆になる）ので、配線の検査は向こうに置いている。
 */
import { describe, it, expect } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { HUB_PORT, hubRedirectPlugin } from "../src/index.js";

type Next = (err?: unknown) => void;
type Middleware = (req: IncomingMessage, res: ServerResponse, next: Next) => void;

/** プラグインを実際に組み立て、`configureServer` が積む middleware を取り出す。 */
function captureMiddleware(): Middleware {
  const plugin = hubRedirectPlugin();
  // configureServer は「関数」か「{ handler }」のどちらでも書ける型なので、
  // 関数として呼べることを確かめてから呼ぶ（この実装は関数形で書いている）。
  const hook = plugin.configureServer as unknown;
  if (typeof hook !== "function") {
    throw new Error("configureServer が関数として書かれていない");
  }

  let captured: Middleware | undefined;
  const fakeServer = {
    middlewares: {
      use(fn: Middleware) {
        captured = fn;
      },
    },
  };
  (hook as (server: unknown) => void)(fakeServer);

  if (!captured) throw new Error("configureServer が middlewares.use を呼ばなかった");
  return captured;
}

/** 受けたリクエストの最小の造作。`host` は dev サーバー自身の名で届く。 */
function fakeReq(url: string | undefined, host = `localhost:5173`): IncomingMessage {
  return { url, headers: { host } } as unknown as IncomingMessage;
}

/** 応答の最小の造作。書かれた内容を読めるようにする。 */
function fakeRes(): { statusCode: number | undefined; headers: Record<string, string>; ended: boolean } {
  const res = {
    statusCode: undefined as number | undefined,
    headers: {} as Record<string, string>,
    ended: false,
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
    end() {
      res.ended = true;
    },
  };
  return res;
}

/** `fakeRes` を middleware へ渡すための型合わせ（構造は上で満たしている）。 */
function asServerResponse(res: ReturnType<typeof fakeRes>): ServerResponse {
  return res as unknown as ServerResponse;
}

describe("hubRedirectPlugin", () => {
  it("Given `/` へのリクエスト / When 受け取る / Then 玄関へ 302 で送る", () => {
    // Given
    const middleware = captureMiddleware();
    const res = fakeRes();

    // When
    middleware(fakeReq("/"), asServerResponse(res), () => {
      throw new Error("next() が呼ばれた（`/` は横取りされるはず）");
    });

    // Then
    expect(res.statusCode).toBe(302);
    expect(res.headers.Location).toBe(`http://localhost:${HUB_PORT}/`);
    expect(res.ended).toBe(true);
  });

  it("Given クエリ付きの `/` / When 受け取る / Then クエリを保ったまま玄関へ送る", () => {
    // Given
    const middleware = captureMiddleware();
    const res = fakeRes();

    // When
    middleware(fakeReq("/?room=ABC"), asServerResponse(res), () => {});

    // Then
    expect(res.headers.Location).toBe(`http://localhost:${HUB_PORT}/?room=ABC`);
  });

  it("Given base 配下のパス / When 受け取る / Then 横取りせず次へ渡す", () => {
    // Given
    const middleware = captureMiddleware();
    const res = fakeRes();
    let nextCalled = false;

    // When
    middleware(fakeReq("/timer/"), asServerResponse(res), () => {
      nextCalled = true;
    });

    // Then
    expect(nextCalled).toBe(true);
    expect(res.ended).toBe(false);
  });

  it("Given URL の無いリクエスト / When 受け取る / Then 横取りせず次へ渡す", () => {
    // Given
    const middleware = captureMiddleware();
    const res = fakeRes();
    let nextCalled = false;

    // When
    middleware(fakeReq(undefined), asServerResponse(res), () => {
      nextCalled = true;
    });

    // Then
    expect(nextCalled).toBe(true);
    expect(res.ended).toBe(false);
  });

  it("Given localhost 以外の名で届いたリクエスト / When 受け取る / Then その名のまま玄関のポートへ送る", () => {
    // Given: WSL のポートフォワード等で、dev サーバーは localhost 以外の名でも受ける
    const middleware = captureMiddleware();
    const res = fakeRes();

    // When
    middleware(fakeReq("/", "192.168.1.10:5174"), asServerResponse(res), () => {});

    // Then: ホスト名は受けたものを保ち、ポートだけ玄関のものへ差し替える
    expect(res.headers.Location).toBe(`http://192.168.1.10:${HUB_PORT}/`);
  });
});
