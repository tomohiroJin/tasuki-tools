/**
 * dev サーバーの `/` を玄関へ 302 で送り返す middleware の固定（#95 S5c 追補）。
 *
 * timer / poker の dev サーバーを直接開くと、旧入口撤去（#95 S5c）で `/` へ
 * 送り返された先がその dev サーバー自身の base リダイレクトで `/timer/`（`/poker/`）へ
 * 戻され、無限リロードになる（実測: 8 秒で timer 65 回・poker 157 回）。
 * `vite.dev-hub-redirect.ts` の `hubRedirectPlugin` を Vite の内部 middleware より前に
 * 挿すことでループを断つ。
 *
 * timer と poker の vite.config.ts は同じプラグインを共有する。**片方だけ直す事故**
 * （このリポジトリが繰り返し踏んできた型）を検査が拾えるよう、2 つの config を
 * 同じ表明に通す（`describe.each`）。
 */
import { describe, it, expect } from 'vitest';
import type { Connect, Plugin } from 'vite';
import timerConfig from '../../timer-web/vite.config';
import pokerConfig from '../../poker-web/vite.config';
import { HUB_PORT } from '../../../vite.dev-hub-redirect';

type FakeServer = { middlewares: { use: (fn: Connect.NextHandleFunction) => void } };

/** config の plugins からリダイレクト middleware を取り出す。 */
function captureMiddleware(config: { plugins?: unknown }): Connect.NextHandleFunction {
  const plugins = (config.plugins ?? []) as unknown[];
  const plugin = plugins
    .flat()
    .find((p): p is Plugin => !!p && typeof p === 'object' && (p as Plugin).name === 'tasuki-dev-hub-redirect');
  if (!plugin || typeof plugin.configureServer !== 'function') {
    throw new Error('hubRedirectPlugin（tasuki-dev-hub-redirect）が plugins に見つからない');
  }

  let captured: Connect.NextHandleFunction | undefined;
  const fakeServer: FakeServer = {
    middlewares: {
      use(fn) {
        captured = fn;
      },
    },
  };

  plugin.configureServer(fakeServer as never);
  if (!captured) throw new Error('configureServer が middlewares.use を呼ばなかった');
  return captured;
}

function fakeReq(url: string): Connect.IncomingMessage {
  return { url, headers: { host: 'localhost:5173' } } as Connect.IncomingMessage;
}

function fakeRes(): { statusCode?: number; headers: Record<string, string>; ended: boolean } & Connect.ServerResponse {
  const res = {
    statusCode: undefined,
    headers: {} as Record<string, string>,
    ended: false,
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
    end() {
      res.ended = true;
    },
  };
  return res as unknown as { statusCode?: number; headers: Record<string, string>; ended: boolean } &
    Connect.ServerResponse;
}

describe.each([
  ['timer', timerConfig],
  ['poker', pokerConfig],
])('%s の vite.config.ts の hubRedirectPlugin', (_name, config) => {
  it('Given `/` へのリクエスト / When 受け取る / Then 玄関へ 302 で送る', () => {
    // Given
    const middleware = captureMiddleware(config as { plugins?: unknown });
    const req = fakeReq('/');
    const res = fakeRes();
    const next = () => {
      throw new Error('next() が呼ばれた（`/` は横取りされるはず）');
    };

    // When
    middleware(req, res, next);

    // Then
    expect(res.statusCode).toBe(302);
    expect(res.headers.Location).toBe(`http://localhost:${HUB_PORT}/`);
  });

  it('Given クエリ付きの `/` へのリクエスト / When 受け取る / Then クエリを保ったまま玄関へ送る', () => {
    // Given
    const middleware = captureMiddleware(config as { plugins?: unknown });
    const req = fakeReq('/?room=ABC');
    const res = fakeRes();

    // When
    middleware(req, res, () => {});

    // Then
    expect(res.headers.Location).toBe(`http://localhost:${HUB_PORT}/?room=ABC`);
  });

  it('Given base 配下のパスへのリクエスト / When 受け取る / Then 横取りせず次へ渡す', () => {
    // Given
    const middleware = captureMiddleware(config as { plugins?: unknown });
    const req = fakeReq('/timer/');
    const res = fakeRes();
    let nextCalled = false;

    // When
    middleware(req, res, () => {
      nextCalled = true;
    });

    // Then
    expect(nextCalled).toBe(true);
    expect(res.ended).toBe(false);
  });
});
