/** ハブ（選択画面）の接続（`/ws`）の実 WebSocket クライアント。 */

import type { HubCommand } from "@tasuki/room-core";
import type { TopicServerMsg } from "../../../src/ports/topic-server-msg.js";
import { LiveWsClient } from "./ws-client";

/**
 * **ハブ（選択画面）の入口**（`/ws`）に繋ぐ実 WebSocket クライアント（#95 S5a）。
 *
 * timer / poker の `LiveClient` / `LivePokerClient` と同じ形にしてある。
 * 話す言葉だけが違う（名簿のコマンドとサーバーメッセージ）。
 * 受信・待ち・閉じるは基底 {@link LiveWsClient} が持つ。
 *
 * 受信の型は `HubServerMsg` ではなく `TopicServerMsg`（`HubServerMsg` を合併した広い型）
 * にしてある（#91）——ハブの接続もルームの全接続と同じくお題の配信先であり
 * （`topic-broadcast.ts` の `TOPIC_RECIPIENT_TOOLS`）、実際に `type: "topic"` のフレームが
 * 届くため。`HubServerMsg` のままだと `m.type === "topic"` の比較が型検査で弾かれ、
 * E2（お題がハブへも届く）のテストが書けない。
 */
export class LiveHubClient extends LiveWsClient<TopicServerMsg> {
  send(cmd: HubCommand): void {
    this.ws.send(JSON.stringify(cmd));
  }
}
