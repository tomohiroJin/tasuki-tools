/** 進行タイマーの接続（`/ws?tool=agenda`）の実 WebSocket クライアント。 */

import { WebSocket } from "ws";
import type { HubCommand } from "@tasuki/room-core";
import type { AgendaCommand } from "@tasuki/agenda-core";
import type { AgendaServerMsg } from "../../../src/ports/agenda-server-msg.js";
import { DEFAULT_TIMEOUT_MS, SILENCE_MS, LiveSetupError } from "./waiting";

/**
 * **進行タイマーとして**（`/ws?tool=agenda`）繋いだ実 WebSocket クライアント（#429）。
 *
 * `LiveRouletteClient` の写しである。話す言葉だけが違う（ハブのコマンドと agenda の
 * コマンドの和・受け取るフレームは {@link AgendaServerMsg}）。
 */
export class LiveAgendaClient {
  readonly received: AgendaServerMsg[] = [];
  private cursor = 0;
  private waiters: Array<() => void> = [];

  constructor(
    readonly label: string,
    private readonly ws: WebSocket,
  ) {
    ws.on("message", (raw: Buffer) => {
      this.received.push(JSON.parse(raw.toString()) as AgendaServerMsg);
      for (const notify of this.waiters) notify();
      this.waiters = [];
    });
  }

  send(cmd: HubCommand | AgendaCommand): void {
    this.ws.send(JSON.stringify(cmd));
  }

  /** 生のテキストを送る（不正 JSON・スキーマ違反を試すための経路）。 */
  sendRaw(text: string): void {
    this.ws.send(text);
  }

  /** 条件に合う最初の未消費メッセージを待つ。 */
  async take(
    predicate: (msg: AgendaServerMsg) => boolean,
    what: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<AgendaServerMsg> {
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

  /**
   * 受信履歴が条件を満たすまで待つ（`LiveClient#until` の写し）。
   * 「N 件まとめて送って、まとめて届くのを待つ」形の検査（レート制限の枯渇など）に使う。
   */
  async until(
    predicate: (received: AgendaServerMsg[]) => boolean,
    label: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (predicate(this.received)) return;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new LiveSetupError(
          `${this.label}: ${label} にならなかった（受信: ${this.received.map((m) => m.type).join(", ") || "（なし）"}）`,
        );
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, Math.min(remaining, 50));
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  /** これ以上メッセージが届かないことを確かめる（未読が増えないこと）。 */
  async expectSilence(ms = SILENCE_MS): Promise<void> {
    const before = this.received.length;
    await Bun.sleep(ms);
    if (this.received.length !== before) {
      const extra = this.received.slice(before).map((m) => m.type);
      throw new LiveSetupError(`${this.label}: 届かないはずのメッセージが来た（${extra.join(", ")}）`);
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
