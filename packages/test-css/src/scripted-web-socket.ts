/**
 * 台本どおりに動く WebSocket（テスト用・#594）。サーバーは立てず、開く・切る・届けるをテストが起こす。
 *
 * 5 か所（agenda-web・checkin-web・roulette-web・topic-web・web-kit）にあった先頭 25 行の写しを 1 つにした。
 * 各アプリには、そのアプリの固定データ（復帰の組・状態・名簿のフレーム）だけを残す。
 * node の API を使わないので TypeScript のまま置く（`docs/adr/0017` の追記（#599）決まり 4。型は読む側の型検査が中身まで見る）。
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

  readonly url: string;

  // parameter property（`constructor(readonly url)`）は node の型の取り除き（--experimental-strip-types）で読めないので、明示のフィールドと代入で書く
  constructor(url: string) {
    this.url = url;
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

export const latestSocket =(): ScriptedWebSocket => {
  const socket = ScriptedWebSocket.instances.at(-1);
  if (socket === undefined) throw new Error('WebSocket が 1 本も張られていない');
  return socket;
};
