/** うちわけの接続（`/ws?tool=track`）の実 WebSocket クライアント。 */

import type { HubCommand } from "@tasuki/room-core";
import type { TrackCommand } from "@tasuki/track-core";
import type { TrackServerMsg } from "../../../src/ports/track-server-msg.js";
import { LiveWsClient } from "./ws-client";

/**
 * **うちわけとして**（`/ws?tool=track`）繋いだ実 WebSocket クライアント（#476）。
 *
 * `LiveAgendaClient` の仲間である。話す言葉だけが違う（ハブのコマンドと track の
 * コマンドの和・受け取るフレームは {@link TrackServerMsg}）。
 * 受信・待ち・閉じるは基底 {@link LiveWsClient} が持つ。
 */
export class LiveTrackClient extends LiveWsClient<TrackServerMsg> {
  send(cmd: HubCommand | TrackCommand): void {
    this.ws.send(JSON.stringify(cmd));
  }
}
