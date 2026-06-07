/**
 * WS クライアント
 * T042: FR-007, FR-015, SC-001
 * snapshot 置き換え・clockOffset・指数バックオフ
 */

import { ExponentialBackoff } from "./backoff.js";
import { estimateClockOffset, type PingSample } from "./clock-offset.js";
import { dispatchServerMessage } from "./dispatch.js";
import type { Room } from "@tdd-mob/core";

export type RoomCallback = (room: Room) => void;
export type ErrorCallback = (code: string, message: string) => void;
export interface Identity {
  participantId: string;
  resumeToken: string;
  hostToken?: string;
}
export type IdentityCallback = (identity: Identity) => void;

export interface SyncClientOptions {
  url: string;
  onRoom: RoomCallback;
  /** room.created / room.joined 受信時に自分の参加者IDとトークンを通知 */
  onIdentity?: IdentityCallback;
  onError?: ErrorCallback;
  /** need-problem 受信時（代表に選ばれたとき）に呼ばれる */
  onNeedProblem?: (requestId: string, deadlineMs: number) => void;
  /** 休憩提案シグナル受信時（§9.1）。rounds は何巡したか。 */
  onSuggestBreak?: (rounds: number) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export class SyncClient {
  private ws: WebSocket | null = null;
  private readonly options: SyncClientOptions;
  private readonly backoff = new ExponentialBackoff();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _clockOffset = 0;
  private readonly pingSamples: PingSample[] = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  /** OPEN 前に送ろうとしたメッセージのキュー（接続確立時にフラッシュする） */
  private readonly pendingMessages: Record<string, unknown>[] = [];

  constructor(options: SyncClientOptions) {
    this.options = options;
  }

  /** サーバー時刻に補正された現在時刻 */
  get now(): number {
    return Date.now() + this._clockOffset;
  }

  /** clock offset の現在値 */
  get clockOffset(): number {
    return this._clockOffset;
  }

  connect(): void {
    if (this.disposed) return;
    this.ws = new WebSocket(this.options.url);

    this.ws.onopen = () => {
      this.backoff.reset();
      this.options.onConnected?.();
      this.startPingLoop();
      // 接続確立前にキューされたメッセージをフラッシュする
      const queued = this.pendingMessages.splice(0, this.pendingMessages.length);
      for (const cmd of queued) {
        this.ws?.send(JSON.stringify(cmd));
      }
    };

    this.ws.onmessage = (event: MessageEvent) => {
      this.handleMessage(event.data);
    };

    this.ws.onclose = () => {
      this.stopPingLoop();
      this.options.onDisconnected?.();
      if (!this.disposed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onerror は onclose の前に呼ばれる
    };
  }

  /** コマンドを送信する。未接続なら接続確立時までキューに退避する。 */
  send(cmd: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(cmd));
    } else if (!this.disposed) {
      // CONNECTING 中などはキューに積み、onopen でフラッシュする
      this.pendingMessages.push(cmd);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stopPingLoop();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private handleMessage(data: unknown): void {
    dispatchServerMessage(data, {
      onRoom: (room: Room) => this.options.onRoom(room),
      onIdentity: (identity) => this.options.onIdentity?.(identity),
      onError: (code, message) => this.options.onError?.(code, message),
      onNeedProblem: (requestId, deadlineMs) =>
        this.options.onNeedProblem?.(requestId, deadlineMs),
      onSuggestBreak: (rounds) => this.options.onSuggestBreak?.(rounds),
      onTimePong: (serverTime) => this.recordPong(serverTime),
    });
  }

  /** time.pong を記録して clockOffset を更新する（FIFO で未確定サンプルに対応付け） */
  private recordPong(serverTime: number): void {
    const receiveTime = Date.now();
    const sample = this.pingSamples.find((s) => s.clientReceive === -1);
    if (sample) {
      sample.serverTime = serverTime;
      sample.clientReceive = receiveTime;
      this._clockOffset = estimateClockOffset(
        this.pingSamples.filter((s) => s.clientReceive !== -1),
      );
    }
  }

  private startPingLoop(): void {
    this.pingTimer = setInterval(() => {
      const clientSend = Date.now();
      this.pingSamples.push({ clientSend, serverTime: 0, clientReceive: -1 });
      // 最大10サンプル保持
      if (this.pingSamples.length > 10) {
        this.pingSamples.shift();
      }
      this.send({ command: "time.ping", clientTime: clientSend });
    }, 10000);
  }

  private stopPingLoop(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    const delay = this.backoff.nextDelay();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
