/** 送った中身を覚え、サーバーからの応答を差し込める WebSocket。 */
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

export const latestSocket = (): ScriptedWebSocket => {
  const socket = ScriptedWebSocket.instances.at(-1);
  if (socket === undefined) throw new Error('WebSocket が 1 本も張られていない');
  return socket;
};

/** 端末に置く復帰の組（玄関と同じ鍵 `tasuki:resume:<コード>`）。 */
export const RESUME = { code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' };

export const IDLE_STATE = { topic: null, generating: false, degraded: false, aiUnlocked: false };
