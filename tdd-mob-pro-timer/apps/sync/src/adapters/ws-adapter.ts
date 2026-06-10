/**
 * WS アダプタ — 薄い WebSocket 抽象層
 * T040: FR-013, NFRセキュリティ(S2/S3)
 */

import { WebSocketServer, WebSocket } from "ws";
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "http";
import * as v from "valibot";
import { CommandSchema } from "@tdd-mob/core";

const MAX_MESSAGE_BYTES = 64 * 1024; // 64KB

export interface WsAdapterOptions {
  port: number;
  host?: string;
  /** 同時接続数の上限。超過分は 1013 で拒否する。 */
  maxConnections?: number;
  allowedOrigins: string[];
  onMessage: (connId: string, msg: unknown) => Promise<void>;
  onDisconnect: (connId: string) => void;
  /** 非 Upgrade の HTTP リクエストのフック。結果を返せばそれを応答、null なら 426。 */
  httpHandler?: (
    req: IncomingMessage,
  ) => { status: number; contentType: string; body: string } | null;
}

export class WsAdapter {
  private readonly wss: WebSocketServer;
  private readonly httpServer: Server;
  private readonly connections = new Map<string, WebSocket>();
  private connCounter = 0;

  constructor(private readonly options: WsAdapterOptions) {
    this.httpServer = createServer((req, res) => this.handleHttp(req, res));
    this.wss = new WebSocketServer({ server: this.httpServer });
    this.wss.on("connection", this.handleConnection.bind(this));
    this.httpServer.on("error", (err) => {
      // 起動時の bind 失敗（EADDRINUSE 等）は回復不能。未処理例外でクラッシュさせず明示終了する。
      console.error(`❌ HTTP サーバエラー: ${(err as Error).message}`);
      process.exit(1);
    });
    this.httpServer.listen(options.port, options.host);
  }

  /** 非 Upgrade の HTTP リクエスト処理。管理エンドポイント等は httpHandler に委譲し、
   *  それ以外は WS 専用サーバとして 426 を返す（既存挙動の維持）。 */
  private handleHttp(req: IncomingMessage, res: ServerResponse): void {
    const handled = this.options.httpHandler?.(req);
    if (handled) {
      res.writeHead(handled.status, { "content-type": handled.contentType });
      res.end(handled.body);
      return;
    }
    res.writeHead(426, { "content-type": "text/plain" });
    res.end("Upgrade Required");
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
    return new Promise((resolve) => {
      // {server} 構成では wss.close は活線ソケットを切らず、httpServer.close は
      // 全接続終了までコールバックを発火しない。先に能動的に切断してハングを防ぐ。
      for (const ws of this.connections.values()) ws.terminate();
      this.wss.close(() => this.httpServer.close(() => resolve()));
    });
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

    // 同時接続数の上限（DoS 緩和）。超過は 1013（Try Again Later）で閉じる。
    if (
      this.options.maxConnections !== undefined &&
      this.connections.size >= this.options.maxConnections
    ) {
      ws.close(1013, "Server connection limit reached");
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
