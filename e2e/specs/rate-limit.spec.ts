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

test.describe('Caddy を迂回した直接接続', () => {
  test('timer-sync は直結を拒否する @core', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORTS.timerSync}/ws`);

    const closed = await waitClose(ws);

    expect(closed.code).toBe(1008);
    expect(closed.reason).toBe('Client address required');
  });

  test('poker-sync は直結を拒否する @core', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORTS.pokerSync}/ws`);

    const closed = await waitClose(ws);

    expect(closed.code).toBe(1008);
    expect(closed.reason).toBe('Client address required');
  });
});
