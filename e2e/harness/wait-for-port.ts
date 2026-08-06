/**
 * 指定ポートが TCP 接続を受け付けるまで待つ。
 *
 * 起動待ちに固定時間の sleep を使うと、遅いマシンで揺れ、速いマシンで無駄に待つ。
 * 「繋がること」そのものを待つ。
 *
 * Caddy と sync サーバー（timer-sync / poker-sync）の両方の起動待ちで使うため、
 * ここに 1 本化する。
 */
import net from 'node:net';

export async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const ok = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ port, host: '127.0.0.1' });
      socket.once('connect', () => socket.end(() => resolve(true)));
      socket.once('error', () => resolve(false));
    });
    if (ok) return;
    if (Date.now() > deadline) {
      throw new Error(`ポート ${port} が ${timeoutMs}ms 以内に応答しませんでした。`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
