/**
 * Caddy を迂回して sync へ直接繋いだ接続が拒否されることを、実配置で確かめる（#103）。
 *
 * ## なぜブラウザを使わないか
 *
 * 見たいのは「リバースプロキシを通らない接続」で、ブラウザからは作れない。
 * Node 組み込みの WebSocket で sync のポートへ直接繋ぐ。
 *
 * ## なぜ close の reason まで見るか
 *
 * Origin 拒否もクライアント鍵の不在も close コードは 1008 で、**コードだけでは
 * 区別できない**。reason を確かめないと、Origin 拒否を見ているだけの空振りになる。
 */
import { expect, test } from '@playwright/test';
import { PORTS } from '../harness/paths';

/** close の (code, reason) を待つ。 */
function waitClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('close が来なかった')), 5_000);
    ws.addEventListener(
      'close',
      (event) => {
        clearTimeout(timer);
        resolve({ code: event.code, reason: event.reason });
      },
      { once: true },
    );
  });
}

/**
 * **このシナリオに本番タグ（`@smoke` / `@core`）を付けないこと。**
 *
 * ここは `ws://127.0.0.1:<PORT>` へ直結して「拒否されること」を確かめる検査で、
 * ローカルのハーネスが起動したサーバーが手元に居ることを前提にしている。
 * 本番向けの `pnpm e2e:prod`（`--grep "@smoke|@core"`）に拾われると、
 * 開発機の 127.0.0.1 には何も居ないため**必ず失敗し、本番検証そのものが赤くなる**。
 *
 * この事故は `e2e/tests/spec-tags.test.ts` の「本番へ漏れる local 専用シナリオ」が
 * 捕まえる（実際に 1 度踏んで捕まった）。タグを足すときはその検査を必ず走らせること。
 */
test.describe('Caddy を迂回した直接接続', () => {
  test('timer-sync は直結を拒否する', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORTS.timerSync}/ws`);

    const closed = await waitClose(ws);

    expect(closed.code).toBe(1008);
    expect(closed.reason).toBe('Client address required');
  });

  test('poker-sync は直結を拒否する', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORTS.pokerSync}/ws`);

    const closed = await waitClose(ws);

    expect(closed.code).toBe(1008);
    expect(closed.reason).toBe('Client address required');
  });
});
