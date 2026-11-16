/** 実 WebSocket クライアントの共通の基底（受信のバッファ・待ち手・take・until・expectSilence・close）。 */

import { WebSocket } from "ws";
import { DEFAULT_TIMEOUT_MS, SILENCE_MS, LiveSetupError } from "./waiting";

/**
 * 受信フレームの型 `TMsg` だけが違う実 WebSocket クライアントの基底。
 *
 * hub・topic・roulette・agenda・checkin・poker の各 client は、この基底に
 * 「送る命令の型」だけを足す。受信のバッファ・待ち手・`take`・`until`・
 * `expectSilence`・`close` はここに 1 つだけ置く。
 *
 * `LiveClient`（timer）は**この基底を使わない**。timer は生テキスト（`rawFrames`）も
 * 保持し、`take` が型名で引く別の形（`take(type, predicate)`）で、`latestRoom`・`all` も持つ。
 * 待ち手の持ち方が同じだけなので、無理に寄せない。
 */
export abstract class LiveWsClient<TMsg extends { type: string }> {
  /** 届いたフレームをパースした値（順序つき）。 */
  readonly received: TMsg[] = [];
  /** `take` が読み進めた位置。ここより手前は消費済み。 */
  private cursor = 0;
  private waiters: Array<() => void> = [];

  constructor(
    readonly label: string,
    protected readonly ws: WebSocket,
  ) {
    ws.on("message", (raw: Buffer) => {
      this.received.push(JSON.parse(raw.toString()) as TMsg);
      const pending = this.waiters;
      this.waiters = [];
      for (const notify of pending) notify();
    });
  }

  /** 生のテキストを送る（不正 JSON・スキーマ違反を試すための経路）。 */
  sendRaw(text: string): void {
    this.ws.send(text);
  }

  /** 条件に合う最初の未消費メッセージを待つ。 */
  async take(
    predicate: (msg: TMsg) => boolean,
    what: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<TMsg> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      while (this.cursor < this.received.length) {
        const msg = this.received[this.cursor];
        this.cursor += 1;
        if (msg !== undefined && predicate(msg)) return msg;
      }
      const left = deadline - Date.now();
      if (left <= 0) throw new LiveSetupError(this.takeTimeoutMessage(what));
      await this.waitForFrame(left);
    }
  }

  /**
   * 受信履歴が条件を満たすまで待つ（`LiveClient#until` の写し）。
   * 「N 件まとめて送って、まとめて届くのを待つ」形の検査（レート制限の枯渇など）に使う。
   */
  async until(
    predicate: (received: TMsg[]) => boolean,
    label: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (predicate(this.received)) return;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new LiveSetupError(
          `${this.label}: ${label} にならなかった（受信: ${this.summary(", ") || "（なし）"}）`,
        );
      }
      await this.waitForFrame(remaining);
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
    if (this.ws.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      this.ws.once("close", () => resolve());
      this.ws.close();
    });
  }

  /** `take` の時間切れの文言。client ごとに文言が違うもの（poker）が上書きする。 */
  protected takeTimeoutMessage(what: string): string {
    return `${this.label}: ${what} が届かない（受信済み: ${this.summary(" / ")}）`;
  }

  /** 受信済みの型名を区切りでつなぐ。 */
  protected summary(separator: string): string {
    return this.received.map((m) => m.type).join(separator);
  }

  /**
   * 次のフレームか時間切れ（`timeoutMs`）まで待つ。
   * 時間切れのときは、積んだ待ち手を外す（外さないと待ちのたびに溜まる）。
   */
  private waitForFrame(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const notify = (): void => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== notify);
        resolve();
      }, timeoutMs);
      this.waiters.push(notify);
    });
  }
}
