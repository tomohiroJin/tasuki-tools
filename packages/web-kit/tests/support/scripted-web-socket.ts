/**
 * 台本どおりに動く WebSocket（テスト用）。サーバーは立てず、開く・切る・届けるをテストが起こす。
 * 各 web アプリのテストの `tests/support/scripted-web-socket.ts` と同じ形。
 */
export class ScriptedWebSocket {
  static instances: ScriptedWebSocket[] = [];
  static readonly OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    ScriptedWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.readyState = ScriptedWebSocket.OPEN;
    this.onopen?.();
  }

  /** サーバー側から切る（`onclose` を起こす）。 */
  drop(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  deliver(msg: unknown): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  /** 送った中身を JSON として読む。 */
  sentJson(): Record<string, unknown>[] {
    return this.sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);
  }
}

export function latestSocket(): ScriptedWebSocket {
  const socket = ScriptedWebSocket.instances.at(-1);
  if (socket === undefined) throw new Error('WebSocket がまだ作られていません');
  return socket;
}
