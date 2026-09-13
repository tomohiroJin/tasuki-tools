/**
 * poker-web のテスト共有フェイク。
 *
 * **購読の形は #95 S5b で変わった。** `usePokerSync` は接続を
 * `@tasuki/sync-client` の `SyncConnection` に任せるようになり、あちらは
 * `onopen` / `onmessage` / `onclose` の**プロパティ代入**で購読する。
 * `addEventListener` だけを持つスタブでは**何も起きないまま全テストが空振りする**ので、
 * 両方を受け付ける形にしてある（`fire` はどちらの購読にも配る）。
 */

/** プロパティ代入と `addEventListener` の両方で購読できる最小 WebSocket スタブ。 */
export class FakeListenerSocket {
  static instances: FakeListenerSocket[] = [];
  static readonly OPEN = 1;

  readyState = 0;
  /** `SyncConnection` が代入する購読口。 */
  onopen: ((event?: unknown) => void) | null = null;
  onmessage: ((event: unknown) => void) | null = null;
  onclose: ((event?: unknown) => void) | null = null;
  onerror: ((event?: unknown) => void) | null = null;
  private readonly handlers: Record<string, ((event: unknown) => void)[]> = {};

  constructor(public url: string) {
    FakeListenerSocket.instances.push(this);
  }

  addEventListener(type: string, handler: (event: unknown) => void): void {
    (this.handlers[type] ??= []).push(handler);
  }

  /** テストから任意のイベントを発火する（プロパティ代入・addEventListener の両方へ配る）。 */
  fire(type: string, event?: unknown): void {
    const assigned = {
      open: this.onopen,
      message: this.onmessage,
      close: this.onclose,
      error: this.onerror,
    }[type];
    assigned?.(event);
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
