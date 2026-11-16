/** poker の接続（`/ws?tool=poker`）の実 WebSocket クライアント。 */

import type { ServerMessage as PokerServerMsg } from "@tasuki/poker-core";
import { LiveWsClient } from "./ws-client";

/**
 * **poker として**（`/ws?tool=poker`）繋いだ実 WS クライアント。
 *
 * 同じプロセスに timer と poker の 2 つのメッセージ層があるので、**層をまたぐ性質**
 * （入口の門・レート制限の 1 IP 1 バケツ）は片方のクライアントだけでは観測できない。
 * ここは `LiveClient` の poker 版で、足すのは「送る」だけである
 * （受信・待ち・閉じるは基底 {@link LiveWsClient}。poker の規則を網羅する場所ではない。
 * それは `test/poker/` の役目）。
 */
export class LivePokerClient extends LiveWsClient<PokerServerMsg> {
  /** メッセージを送る（`ClientMessage` の形。生の値も送れるよう unknown で受ける）。 */
  send(msg: unknown): void {
    this.ws.send(JSON.stringify(msg));
  }

  /** poker の `take` の時間切れの文言は、他の client と違う（既存の文言を保つ）。 */
  protected override takeTimeoutMessage(what: string): string {
    return `${this.label}: ${what} を待ったが届かなかった（受信: ${this.summary(", ") || "（なし）"}）`;
  }
}
