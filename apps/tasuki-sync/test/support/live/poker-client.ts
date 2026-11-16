/** poker の接続（`/ws?tool=poker`）の実 WebSocket クライアント。 */

import { WebSocket } from "ws";
import type { ServerMessage as PokerServerMsg } from "@tasuki/poker-core";
import { DEFAULT_TIMEOUT_MS, LiveSetupError } from "./waiting";

/**
 * **poker として**（`/ws?tool=poker`）繋いだ実 WS クライアント。
 *
 * 同じプロセスに timer と poker の 2 つのメッセージ層があるので、**層をまたぐ性質**
 * （入口の門・レート制限の 1 IP 1 バケツ）は片方のクライアントだけでは観測できない。
 * ここは `LiveClient` の poker 版で、受け持つのは
 * 「送る・条件に合う応答を 1 件取り出す・閉じる」の 3 つだけである
 * （poker の規則を網羅する場所ではない。それは `test/poker/` の役目）。
 */
export class LivePokerClient {
  /** 届いたフレームをパースした値（順序つき）。 */
  readonly received: PokerServerMsg[] = [];
  /** `take` が読み進めた位置。ここより手前は消費済み。 */
  private cursor = 0;
  private waiters: Array<() => void> = [];

  constructor(
    readonly label: string,
    private readonly ws: WebSocket,
  ) {
    ws.on("message", (raw: Buffer) => {
      this.received.push(JSON.parse(raw.toString()) as PokerServerMsg);
      for (const notify of this.waiters) notify();
      this.waiters = [];
    });
  }

  /** メッセージを送る（`ClientMessage` の形。生の値も送れるよう unknown で受ける）。 */
  send(msg: unknown): void {
    this.ws.send(JSON.stringify(msg));
  }

  /** 未読の中から条件に合う最初のメッセージを 1 件取り出す。 */
  async take(
    predicate: (msg: PokerServerMsg) => boolean,
    label: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<PokerServerMsg> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      while (this.cursor < this.received.length) {
        const msg = this.received[this.cursor]!;
        this.cursor += 1;
        if (predicate(msg)) return msg;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new LiveSetupError(
          `${this.label}: ${label} を待ったが届かなかった（受信: ${
            this.received.map((m) => m.type).join(", ") || "（なし）"
          }）`,
        );
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, remaining);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  /** ソケットを閉じ、サーバー側が close を処理し終えるのを待つ。 */
  async close(): Promise<void> {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    const closed = new Promise<void>((resolve) => this.ws.once("close", () => resolve()));
    this.ws.close();
    await closed;
  }
}
