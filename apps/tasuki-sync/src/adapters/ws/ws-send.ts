/**
 * OPEN のときだけ送る 1 か所（#368 Task 6。`ws-adapter.ts` の 12 か所の確認をまとめた）。
 *
 * **閉じかけの接続へ送らない。** 内部エラーの返事はメッセージ層の reject（`.catch`）から呼ばれるので、
 * 利用者が切ったあとに走りうる。型（どのフレームを送ってよいか）は呼び出し側の公開メソッドが持ち、
 * ここは JSON の文字列だけを受ける。
 */

/** 送り先に求めるもの（`Bun.ServerWebSocket` の一部）。 */
export interface SendableSocket {
  readonly readyState: number;
  send(data: string): unknown;
}

/** OPEN のときだけ 1 通送る。接続が無ければ（知らない接続 ID）何もしない。 */
export function sendIfOpen(ws: SendableSocket | undefined, json: string): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(json);
  }
}

/** 宛先の接続 ID の並びへ、同じ文字列を OPEN の接続にだけ送る。知らない接続 ID は黙って飛ばす。 */
export function sendToEach(peers: ReadonlyMap<string, SendableSocket>, connIds: readonly string[], json: string): void {
  for (const connId of connIds) {
    sendIfOpen(peers.get(connId), json);
  }
}
