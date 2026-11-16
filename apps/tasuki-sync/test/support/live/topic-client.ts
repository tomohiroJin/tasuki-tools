/** お題の接続（`/ws?tool=topic`）の実 WebSocket クライアント。 */

import type { HubCommand } from "@tasuki/room-core";
import type { TopicCommand } from "@tasuki/topic-core";
import type { TopicServerMsg } from "../../../src/ports/topic-server-msg.js";
import { LiveWsClient } from "./ws-client";

/**
 * **お題として**（`/ws?tool=topic`）繋いだ実 WebSocket クライアント（#91）。
 *
 * `LiveHubClient` の仲間である。話す言葉だけが違う（ハブのコマンドとお題の
 * コマンドの和・受け取るフレームは {@link TopicServerMsg}）。
 * 受信・待ち・閉じるは基底 {@link LiveWsClient} が持つ。
 */
export class LiveTopicClient extends LiveWsClient<TopicServerMsg> {
  send(cmd: HubCommand | TopicCommand): void {
    this.ws.send(JSON.stringify(cmd));
  }
}
