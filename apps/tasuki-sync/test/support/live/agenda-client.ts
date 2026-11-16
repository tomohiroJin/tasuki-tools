/** 進行タイマーの接続（`/ws?tool=agenda`）の実 WebSocket クライアント。 */

import type { HubCommand } from "@tasuki/room-core";
import type { AgendaCommand } from "@tasuki/agenda-core";
import type { AgendaServerMsg } from "../../../src/ports/agenda-server-msg.js";
import { LiveWsClient } from "./ws-client";

/**
 * **進行タイマーとして**（`/ws?tool=agenda`）繋いだ実 WebSocket クライアント（#429）。
 *
 * `LiveRouletteClient` の仲間である。話す言葉だけが違う（ハブのコマンドと agenda の
 * コマンドの和・受け取るフレームは {@link AgendaServerMsg}）。
 * 受信・待ち・閉じるは基底 {@link LiveWsClient} が持つ。
 */
export class LiveAgendaClient extends LiveWsClient<AgendaServerMsg> {
  send(cmd: HubCommand | AgendaCommand): void {
    this.ws.send(JSON.stringify(cmd));
  }
}
