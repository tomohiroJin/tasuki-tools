/** timer の接続（`/ws?tool=timer`）の実 WebSocket クライアント。 */

import { WebSocket } from "ws";
import type { Command, ServerMsg } from "@tasuki/timer-core";
import { DEFAULT_TIMEOUT_MS, SILENCE_MS, LiveSetupError } from "./waiting";

export type MsgType = ServerMsg["type"];
export type MsgOf<T extends MsgType> = Extract<ServerMsg, { type: T }>;

/**
 * 実 WebSocket クライアント 1 本。
 *
 * 届いたフレームは**生のテキスト**（`rawFrames`）と**パース済みの値**（`received`）の
 * 両方で保持する。「JSON の形そのもの」を見たいときは前者を使う。
 *
 * 他のツールの client が共有する基底 `LiveWsClient`（`ws-client.ts`）は使わない。
 * この client は `take` が型名で引く形（`take(type, predicate)`）で、`takeMatching`・
 * `latestRoom`・`all` も持ち、時間切れの文言も違うため。
 */
export class LiveClient {
  /** 届いたフレームの生テキスト（順序つき）。 */
  readonly rawFrames: string[] = [];
  /** 届いたフレームをパースした値（順序つき）。 */
  readonly received: ServerMsg[] = [];
  /** `take` が読み進めた位置。ここより手前は消費済み。 */
  private cursor = 0;
  private waiters: Array<() => void> = [];

  constructor(
    /** デバッグ用の名前（タイムアウト時のメッセージに出す）。 */
    readonly label: string,
    private readonly ws: WebSocket,
  ) {
    ws.on("message", (raw: Buffer) => {
      const text = raw.toString();
      this.rawFrames.push(text);
      this.received.push(JSON.parse(text) as ServerMsg);
      for (const notify of this.waiters) notify();
      this.waiters = [];
    });
  }

  /** 妥当なコマンドを送る（型で守られている経路）。 */
  send(cmd: Command): void {
    this.ws.send(JSON.stringify(cmd));
  }

  /** 生のテキストを送る（不正 JSON・スキーマ違反を試すための経路）。 */
  sendRaw(text: string): void {
    this.ws.send(text);
  }

  /**
   * 未読の中から条件に合う最初のメッセージを 1 件取り出す。
   * 取り出した位置まで読み進めるので、同じ `take` を続けて呼べば次の 1 件が返る。
   */
  async take<T extends MsgType>(
    type: T,
    predicate?: (msg: MsgOf<T>) => boolean,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<MsgOf<T>> {
    const match = (msg: ServerMsg): msg is MsgOf<T> =>
      msg.type === type && (predicate === undefined || predicate(msg as MsgOf<T>));
    return (await this.takeMatching(match, `type=${type}`, timeoutMs)) as MsgOf<T>;
  }

  /** 型を問わず、未読の中から条件に合う最初のメッセージを取り出す。 */
  async takeMatching(
    predicate: (msg: ServerMsg) => boolean,
    label: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<ServerMsg> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      while (this.cursor < this.received.length) {
        const msg = this.received[this.cursor]!;
        this.cursor += 1;
        if (predicate(msg)) return msg;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new LiveSetupError(
          `${this.label}: ${label} を待ったが届かなかった（受信: ${this.summary()}）`,
        );
      }
      await this.waitForFrame(remaining);
    }
  }

  /**
   * 受信履歴が条件を満たすまで待つ。
   * 「最終的にこの状態が配信される」を見るときに使う（`take` と違い履歴を消費しない）。
   */
  async until(
    predicate: (received: ServerMsg[]) => boolean,
    label: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (predicate(this.received)) return;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new LiveSetupError(
          `${this.label}: ${label} にならなかった（受信: ${this.summary()}）`,
        );
      }
      await this.waitForFrame(remaining);
    }
  }

  /**
   * 直近に届いた snapshot のルーム。1 度も届いていなければ throw する。
   *
   * 戻り値は **snapshot メッセージが実際に運ぶ型**であり、`@tasuki/timer-core` の `Room`
   * ではない。両者は省略可能プロパティの表し方が違い（前者は `?: T | undefined`、
   * 後者は `?: T`）、`exactOptionalPropertyTypes` の下では代入できない。
   * 返しているものをそのまま名乗る（#173）。
   */
  latestRoom(): MsgOf<"snapshot">["room"] {
    for (let i = this.received.length - 1; i >= 0; i--) {
      const msg = this.received[i]!;
      if (msg.type === "snapshot") return msg.room;
    }
    throw new LiveSetupError(`${this.label}: snapshot が 1 度も届いていない`);
  }

  /** 条件に合う受信メッセージをすべて返す（履歴は消費しない）。 */
  all<T extends MsgType>(type: T): Array<MsgOf<T>> {
    return this.received.filter((m): m is MsgOf<T> => m.type === type);
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

  /** ソケットを閉じ、サーバー側が close を処理し終えるのを待つ。 */
  async close(): Promise<void> {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    const closed = new Promise<void>((resolve) => this.ws.once("close", () => resolve()));
    this.ws.close();
    await closed;
  }

  private summary(): string {
    return this.received.map((m) => m.type).join(", ") || "（なし）";
  }

  private waitForFrame(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
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
