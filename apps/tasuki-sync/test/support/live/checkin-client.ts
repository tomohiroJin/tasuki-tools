/** チェックインの接続（`/ws?tool=checkin`）の実 WebSocket クライアント。 */

import type { HubCommand, HubServerMsg } from "@tasuki/room-core";
import type { CheckinCommand } from "@tasuki/checkin-core";
import type { CheckinServerMsg } from "../../../src/ports/checkin-server-msg.js";
import { LiveWsClient } from "./ws-client";

/** checkin の接続が受け取るフレーム（room.joined・roster などハブ共通のものも届く）。 */
export type CheckinReceived = CheckinServerMsg | HubServerMsg;

/**
 * **チェックインとして**（`/ws?tool=checkin`）繋いだ実 WebSocket クライアント（#406）。
 *
 * `LiveAgendaClient` の仲間である。話す言葉だけが違う（ハブのコマンドと checkin の
 * コマンドの和・受け取るフレームは {@link CheckinServerMsg}）。
 * 受信・待ち・閉じるは基底 {@link LiveWsClient} が持つ。
 */
export class LiveCheckinClient extends LiveWsClient<CheckinReceived> {
  send(cmd: HubCommand | CheckinCommand): void {
    this.ws.send(JSON.stringify(cmd));
  }
}
