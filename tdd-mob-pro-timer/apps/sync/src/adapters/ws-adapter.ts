/**
 * WS アダプタ — 薄い WebSocket 抽象層
 * T040: FR-013, NFRセキュリティ(S2/S3)
 */

import { WebSocketServer, WebSocket } from "ws";
import * as v from "valibot";
import { CommandSchema } from "@tdd-mob/core";
import type { IncomingMessage } from "http";

const MAX_MESSAGE_BYTES = 64 * 1024; // 64KB

export interface WsAdapterOptions {
  port: number;
  allowedOrigins: string[];
  onMessage: (connId: string, msg: unknown) => Promise<void>;
  onDisconnect: (connId: string) => void;
}

export class WsAdapter {
  private readonly wss: WebSocketServer;
  private readonly connections = new Map<string, WebSocket>();
  private connCounter = 0;

  constructor(private readonly options: WsAdapterOptions) {
    this.wss = new WebSocketServer({ port: options.port });
    this.wss.on("connection", this.handleConnection.bind(this));
  }

  send(connId: string, data: unknown): void {
    const ws = this.connections.get(connId);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  broadcast(connIds: string[], data: unknown): void {
    const json = JSON.stringify(data);
    for (const connId of connIds) {
      const ws = this.connections.get(connId);
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(json);
      }
    }
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.wss.close(() => resolve()));
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    // Origin 検証（S2）
    const origin = req.headers.origin ?? "";
    if (
      this.options.allowedOrigins.length > 0 &&
      !this.options.allowedOrigins.includes(origin)
    ) {
      ws.close(1008, "Origin not allowed");
      return;
    }

    const connId = `conn-${++this.connCounter}`;
    this.connections.set(connId, ws);

    ws.on("message", (raw: Buffer) => {
      // サイズ制限（S3）
      if (raw.length > MAX_MESSAGE_BYTES) {
        ws.send(
          JSON.stringify({
            type: "error",
            code: "MESSAGE_TOO_LARGE",
            message: "メッセージが大きすぎます",
          }),
        );
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        ws.send(
          JSON.stringify({
            type: "error",
            code: "INVALID_JSON",
            message: "JSON の形式が不正です",
          }),
        );
        return;
      }

      // Valibot でコマンドを検証（S3）
      const result = v.safeParse(CommandSchema, parsed);
      if (!result.success) {
        ws.send(
          JSON.stringify({
            type: "error",
            code: "INVALID_COMMAND",
            message: "コマンドの形式が不正です",
          }),
        );
        return;
      }

      this.options
        .onMessage(connId, result.output)
        .catch(() => {
          ws.send(
            JSON.stringify({
              type: "error",
              code: "INTERNAL_ERROR",
              message: "内部エラーが発生しました",
            }),
          );
        });
    });

    ws.on("close", () => {
      this.connections.delete(connId);
      this.options.onDisconnect(connId);
    });
  }
}
