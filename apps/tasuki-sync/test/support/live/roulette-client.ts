/** ルーレットの接続（`/ws?tool=roulette`）の実 WebSocket クライアント。 */

import type { HubCommand } from "@tasuki/room-core";
import type { RouletteCommand } from "@tasuki/roulette-core";
import type { RouletteServerMsg } from "../../../src/ports/roulette-server-msg.js";
import { LiveWsClient } from "./ws-client";

/**
 * **ルーレットとして**（`/ws?tool=roulette`）繋いだ実 WebSocket クライアント（#94）。
 *
 * `LiveTopicClient` の仲間である。話す言葉だけが違う（ハブのコマンドとルーレットの
 * コマンドの和・受け取るフレームは {@link RouletteServerMsg}）。
 * 受信・待ち・閉じるは基底 {@link LiveWsClient} が持つ。
 */
export class LiveRouletteClient extends LiveWsClient<RouletteServerMsg> {
  send(cmd: HubCommand | RouletteCommand): void {
    this.ws.send(JSON.stringify(cmd));
  }
}
