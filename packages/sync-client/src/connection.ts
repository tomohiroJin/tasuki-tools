/**
 * 同期サーバーへの WebSocket 接続（#95 S5a・D18）。
 *
 * `apps/timer-web` の `sync/client.ts` が持っていた接続の手順を、ツールの語彙から
 * 切り離して移した。**ここに持ち込んではいけないもの**が 3 つある ——
 *
 *   1. **ツール固有のコマンドとサーバーメッセージ。** 受信は生テキストのまま
 *      {@link SyncConnectionOptions.onMessage} へ渡す。**境界の検証は利用側の責務**
 *      である（原則 IV）—— timer は timer のスキーマで、ハブは名簿のスキーマで検める
 *   2. **時計合わせ**（`time.ping` / `clockOffset`）。timer の語彙なので向こうに残す
 *   3. **画面の状態。** このパッケージは `@tasuki/*` のどれにも依存しない
 *
 * ## 送信キューはここ 1 つに持つ
 *
 * 確立前（`CONNECTING`）に送ろうとしたコマンドは溜めて、`onopen` で流す。
 * **利用側にもう 1 つキューを置かないこと** —— 同じコマンドが 2 回出る。
 *
 * ## 破棄した接続は「切断」ではない
 *
 * `dispose()` の後に届く `onclose` は**こちらから閉じた結果**なので、切断として
 * 通知せず、繋ぎ直しもしない（FR-086）。通知すると、退出させられた側の画面で
 * 「ルームから退出しました」が「接続が切れました。再接続しています...」に上書きされ、
 * しかも再接続は起きないので表示が事実にも反する。
 */
import { ExponentialBackoff } from "./backoff.js";

export interface SyncConnectionOptions {
  /** 繋ぎ先。`wss://host/ws` のような完全な URL。 */
  readonly url: string;
  /**
   * 受信した生テキスト。**パースも検証もしない**（利用側がスキーマで検める）。
   */
  readonly onMessage: (raw: string) => void;
  /** 接続が確立したとき（初回・再接続の区別なし）。 */
  readonly onOpen?: () => void;
  /** 切断されたとき。**破棄による close では呼ばれない。** */
  readonly onClose?: () => void;
  /**
   * 切断後にスケジュールされた再接続が確立したときだけ呼ばれる（初回の確立では呼ばれない）。
   *
   * 再接続と初回接続の区別はこのクラスの内部状態でしか判定できないため、ここに用意する
   * （利用側は「保存済みの組で入り直す」判断にだけ使う）。
   */
  readonly onReconnected?: () => void;
  /** 接続状態の変化。`online`＝確立、`reconnecting`＝切断後の再接続待ち。 */
  readonly onConnectionChange?: (state: "online" | "reconnecting") => void;
}

export class SyncConnection {
  private ws: WebSocket | null = null;
  private readonly backoff = new ExponentialBackoff();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  /** OPEN 前に送ろうとしたメッセージ（確立時に流す）。 */
  private readonly pending: Record<string, unknown>[] = [];
  /** 一度でも確立したか。2 回目以降の `onopen` が「再接続」の判定に使う。 */
  private hasConnectedOnce = false;

  constructor(private readonly options: SyncConnectionOptions) {}

  connect(): void {
    if (this.disposed) return;
    this.ws = new WebSocket(this.options.url);

    this.ws.onopen = () => {
      const isReconnect = this.hasConnectedOnce;
      this.hasConnectedOnce = true;
      this.backoff.reset();
      this.options.onOpen?.();
      this.options.onConnectionChange?.("online");
      const queued = this.pending.splice(0, this.pending.length);
      for (const payload of queued) {
        this.ws?.send(JSON.stringify(payload));
      }
      if (isReconnect) this.options.onReconnected?.();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      this.options.onMessage(String(event.data));
    };

    this.ws.onclose = () => {
      // 破棄済みの close は「こちらから閉じた」結果であり、切断として通知しない。
      if (this.disposed) return;
      this.options.onClose?.();
      this.options.onConnectionChange?.("reconnecting");
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onerror は onclose の前に呼ばれる。繋ぎ直しは onclose 側に一本化する。
    };
  }

  /** コマンドを送る。未確立なら確立時まで溜める。破棄済みなら捨てる。 */
  send(payload: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else if (!this.disposed) {
      this.pending.push(payload);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private scheduleReconnect(): void {
    const delay = this.backoff.nextDelay();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
