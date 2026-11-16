/** ハブ（選択画面）の接続（`/ws`）の実 WebSocket クライアント。 */

import { WebSocket } from "ws";
import type { HubCommand } from "@tasuki/room-core";
import type { TopicServerMsg } from "../../../src/ports/topic-server-msg.js";
import { DEFAULT_TIMEOUT_MS, LiveSetupError } from "./waiting";

/**
 * **ハブ（選択画面）の入口**（`/ws`）に繋ぐ実 WebSocket クライアント（#95 S5a）。
 *
 * timer / poker の `LiveClient` / `LivePokerClient` と同じ形にしてある。
 * 話す言葉だけが違う（名簿のコマンドとサーバーメッセージ）。
 */
export class LiveHubClient {
  /**
   * 届いたフレームをパースした値（順序つき）。**型は `HubServerMsg` ではなく
   * `TopicServerMsg`（`HubServerMsg` を合併した広い型）にしてある**（#91）——
   * ハブの接続もルームの全接続と同じくお題の配信先であり（`topic-broadcast.ts` の
   * `TOPIC_RECIPIENT_TOOLS`）、実際に `type: "topic"` のフレームが届くため。
   * `HubServerMsg` のままだと `m.type === "topic"` の比較が型検査で弾かれ、
   * E2（お題がハブへも届く）のテストが書けない。
   */
  readonly received: TopicServerMsg[] = [];
  private cursor = 0;
  private waiters: Array<() => void> = [];

  constructor(
    readonly label: string,
    private readonly ws: WebSocket,
  ) {
    ws.on("message", (raw: Buffer) => {
      this.received.push(JSON.parse(raw.toString()) as TopicServerMsg);
      for (const notify of this.waiters) notify();
      this.waiters = [];
    });
  }

  send(cmd: HubCommand): void {
    this.ws.send(JSON.stringify(cmd));
  }

  /** 条件に合う最初の未消費メッセージを待つ。 */
  async take(
    predicate: (msg: TopicServerMsg) => boolean,
    what: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<TopicServerMsg> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      while (this.cursor < this.received.length) {
        const msg = this.received[this.cursor];
        this.cursor += 1;
        if (msg !== undefined && predicate(msg)) return msg;
      }
      const left = deadline - Date.now();
      if (left <= 0) {
        throw new LiveSetupError(
          `${this.label}: ${what} が届かない（受信済み: ${this.received.map((m) => m.type).join(" / ")}）`,
        );
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, Math.min(left, 50));
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  async close(): Promise<void> {
    if (this.ws.readyState === this.ws.CLOSED) return;
    await new Promise<void>((resolve) => {
      this.ws.once("close", () => resolve());
      this.ws.close();
    });
  }
}
