/**
 * timer の同期クライアント（FR-007・FR-015・SC-001・T042）。
 *
 * **接続そのものは `@tasuki/sync-client` が持つ**（#95 S5a・D18）。ここに残るのは
 * timer の語彙 —— サーバーメッセージの振り分け（`dispatch.ts`）と時計合わせ
 * （`time.ping` / `clockOffset`）である。
 *
 * **送信キューをここに持たないこと。** 確立前のコマンドは `SyncConnection` が
 * 1 つのキューで溜めており、ここにもう 1 つ置くと同じコマンドが 2 回出る。
 */

import { SyncConnection } from "@tasuki/sync-client";
import { estimateClockOffset, type PingSample } from "./clock-offset.js";
import { dispatchServerMessage } from "./dispatch.js";
import type { NoticeSignal } from "./notice-message.js";
import type { Room } from "@tasuki/timer-core";

export type RoomCallback = (room: Room) => void;
export type ErrorCallback = (code: string, message: string) => void;
export interface Identity {
  participantId: string;
  resumeToken: string;
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
  onConnected?: () => void;
  onDisconnected?: () => void;
  /** 接続状態の変化通知（R5-1）。online=確立、reconnecting=切断後の再接続待ち。 */
  onConnectionChange?: (state: "online" | "reconnecting") => void;
  /** 破壊的操作の実行者の通知（Issue #22・FR-077） */
  onNotice?: (notice: NoticeSignal) => void;
  /** 切断後にスケジュールされた再接続が確立したときのみ呼ばれる（初回 connect() では呼ばれない）。
   *  再接続と初回接続の区別は SyncClient 内部の状態でしか判定できないため、ここに用意する
   *  （呼び出し元は「保存済みの resumeToken で room.join を再送する」判断にだけ使う・Issue #24）。 */
  onReconnected?: () => void;
  /** 契約に合わないフレームを捨てたときに、落ちた項目の経路だけを知らせる（#181） */
  onInvalidFrame?: (paths: string[]) => void;
}

export class SyncClient {
  private readonly options: SyncClientOptions;
  private readonly connection: SyncConnection;
  private _clockOffset = 0;
  private readonly pingSamples: PingSample[] = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: SyncClientOptions) {
    this.options = options;
    this.connection = new SyncConnection({
      url: options.url,
      onMessage: (raw) => this.handleMessage(raw),
      onOpen: () => {
        this.options.onConnected?.();
        this.startPingLoop();
      },
      onClose: () => {
        this.stopPingLoop();
        this.options.onDisconnected?.();
      },
      onReconnected: () => this.options.onReconnected?.(),
      onConnectionChange: (state) => this.options.onConnectionChange?.(state),
    });
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
    this.connection.connect();
  }

  /** コマンドを送信する。未接続なら接続確立時までキューに退避する（`SyncConnection` が持つ）。 */
  send(cmd: Record<string, unknown>): void {
    this.connection.send(cmd);
  }

  dispose(): void {
    this.stopPingLoop();
    this.connection.dispose();
  }

  private handleMessage(data: unknown): void {
    dispatchServerMessage(data, {
      onRoom: (room: Room) => this.options.onRoom(room),
      onIdentity: (identity) => this.options.onIdentity?.(identity),
      onError: (code, message) => this.options.onError?.(code, message),
      onNeedProblem: (requestId, deadlineMs) =>
        this.options.onNeedProblem?.(requestId, deadlineMs),
      onTimePong: (serverTime) => this.recordPong(serverTime),
      onNotice: (notice) => this.options.onNotice?.(notice),
      onInvalidFrame: (paths) => this.options.onInvalidFrame?.(paths),
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
}
