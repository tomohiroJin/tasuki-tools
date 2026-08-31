/**
 * poker-web のテスト共有フェイク。
 *
 * **`apps/timer-web/test/support/fakes.ts` の `FakeWS` とは別物である。**
 * あちらは `onopen` / `onmessage` のプロパティ代入で購読する形、こちらは
 * `addEventListener` で購読する形で、`usePokerSync` が使うのは後者しかない。
 * 名前を分けているのは、片方に合わせて「まとめる」と一方の購読が黙って死ぬため。
 */

/** `addEventListener` で購読する最小 WebSocket スタブ。 */
export class FakeListenerSocket {
  static instances: FakeListenerSocket[] = [];
  static readonly OPEN = 1;

  readyState = 0;
  private readonly handlers: Record<string, ((event: unknown) => void)[]> = {};

  constructor(public url: string) {
    FakeListenerSocket.instances.push(this);
  }

  addEventListener(type: string, handler: (event: unknown) => void): void {
    (this.handlers[type] ??= []).push(handler);
  }

  /** テストから任意のイベントを発火する。 */
  fire(type: string, event?: unknown): void {
    for (const handler of this.handlers[type] ?? []) handler(event);
  }

  /** 実物と同じく引数を取る（テストから「何を送ったか」を見るため）。 */
  send(_data: string): void {}
  close(): void {}

  /** 直近に作られた接続。作られていなければ落とす（黙って空振りさせない）。 */
  static latest(): FakeListenerSocket {
    const socket = FakeListenerSocket.instances[FakeListenerSocket.instances.length - 1];
    if (socket === undefined) throw new Error('WebSocket が作られていません。');
    return socket;
  }
}
