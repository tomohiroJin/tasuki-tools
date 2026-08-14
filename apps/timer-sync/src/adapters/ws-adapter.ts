/**
 * WS アダプタ — 薄い WebSocket 抽象層
 * T040: FR-013, NFRセキュリティ(S2/S3)
 *
 * 実装は `Bun.serve`（S5・#20）。本番は元から Bun 実行なので、poker-sync と土台が揃う。
 * 外から見える振る舞い（close コード・エラーコード・426）は ws 実装のときと同じ。
 */

import { CommandSchema } from "@tasuki/timer-core";
import { parseBoundaryMessage } from "@tasuki/protocol";
import type { Logger } from "../application/log/logger.js";
import { publicText } from "../application/log/log-safe.js";

const MAX_MESSAGE_BYTES = 64 * 1024; // 64KB

/** ハートビート間隔の既定値（ms）。Issue #25: サーバー主導の死活監視。 */
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
/** 許容する連続 pong 欠落回数の既定値。一時的な通信の揺れを吸収する猶予（US2）。 */
const DEFAULT_HEARTBEAT_MAX_MISSES = 2;

/**
 * httpHandler に渡すリクエスト表現。
 * Node の IncomingMessage にも Bun の Request にも依存しない形にしてある。
 */
export interface HttpRequestInfo {
  method: string;
  /** クエリを含むパス（`/status?x=1`）。handleAdminHttp が `?` で切る。 */
  path: string;
  /** キーは小文字。 */
  headers: Record<string, string>;
}

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
    req: HttpRequestInfo,
  ) => { status: number; contentType: string; body: string } | null;
  /** ハートビート（ping）の送信間隔（ms）。既定 15000。 */
  heartbeatIntervalMs?: number;
  /** 連続でこの回数分 pong が確認できない接続を terminate する。既定 2。 */
  heartbeatMaxMisses?: number;
  /**
   * `X-Forwarded-For` からレート制限の鍵を導く。未指定なら鍵は作らない。
   * **生の IP はこの関数の中だけに存在し、戻り値はハッシュ済みの不透明な文字列である**
   * （`docs/adr/0012` D3）。
   */
  deriveClientKey?: (forwardedFor: string | undefined) => string | null;
  /**
   * 接続が受理された（Origin・接続数の検査を通った）ときに 1 度だけ呼ばれる。
   * `rateKey` はクライアント鍵。特定できなければ `connId` が入る。
   */
  onConnect?: (connId: string, rateKey: string) => void;
  /** 運用ログの出口（ADR 0012 D1） */
  logger: Logger;
}

/**
 * 接続ごとに持ち回る値。
 * `connId` は Origin / 接続数の検査を通ってから採番するため、それまでは空文字。
 * 空のまま閉じた接続は「受け入れていない接続」なので onDisconnect を呼ばない。
 */
interface ConnectionData {
  connId: string;
  origin: string;
  /** `X-Forwarded-For` から導いた鍵。特定できなければ null。 */
  clientKey: string | null;
}

type Socket = Bun.ServerWebSocket<ConnectionData>;

export class WsAdapter {
  private readonly server: Bun.Server<ConnectionData>;
  private readonly connections = new Map<string, Socket>();
  private connCounter = 0;
  /** 接続ごとの「直近 ping 送信からの pong 未受信回数」（Issue #25: 死活監視）。 */
  private readonly missedPongs = new Map<string, number>();
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatMaxMisses: number;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: WsAdapterOptions) {
    // 呼び出し元（テスト等）が誤って 0 以下を明示指定しても busy-loop 化しないよう、
    // config.ts の intEnv と同じ契約（正の整数）をコンストラクタ自身でも守る（DbC）。
    this.heartbeatIntervalMs = Math.max(
      1,
      options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
    );
    this.heartbeatMaxMisses = Math.max(
      0,
      options.heartbeatMaxMisses ?? DEFAULT_HEARTBEAT_MAX_MISSES,
    );

    try {
      this.server = Bun.serve<ConnectionData, never>({
        port: options.port,
        // exactOptionalPropertyTypes: true のため、未指定のときはキーごと渡さない。
        ...(options.host !== undefined ? { hostname: options.host } : {}),
        fetch: (req, server) => this.handleFetch(req, server),
        websocket: {
          // 既定の maxPayloadLength（16MB）のまま受け取り、64KB 超は自前で弾く。
          // ここで絞ると超過時に接続ごと閉じられてしまい、MESSAGE_TOO_LARGE を返して
          // 接続を保つ現行の振る舞いを再現できない。
          //
          // ⚠ ただし **フレーム上限そのものは ws 実装から下がっている**（ws の既定は
          // 100MB、Bun の既定は 16MB）。16MB〜100MB のフレームは、旧実装では
          // MESSAGE_TOO_LARGE を返して接続を保っていたが、Bun ではプロトコル層で
          // 1006 切断になる。アプリの制限 64KB の遥か上で、正当なコマンドがこの範囲に
          // 入ることはないため許容している（#62 のレビューで判明）。
          open: (ws) => this.handleOpen(ws),
          message: (ws, raw) => this.handleMessage(ws, raw),
          close: (ws) => this.handleClose(ws),
          pong: (ws) => this.handlePong(ws),
        },
      });
    } catch (err) {
      // 起動時の bind 失敗（EADDRINUSE 等）は回復不能。未処理例外でクラッシュさせず明示終了する。
      this.options.logger.error("http-server-error", { name: publicText((err as Error).name) }); // log-hygiene:allow 例外の分類のみ
      process.exit(1);
    }

    this.startHeartbeat();
  }

  /**
   * 実際に listen しているポート番号。
   *
   * `port: 0`（OS に空きポートを選ばせる）で起動したとき、**接続先を知る唯一の経路**。
   * これが無いと呼び出し元は自分が渡した値しか知らず、0 を渡すことができない
   * （＝テストが固定ポートを手で割り振り続けるしかない）。
   */
  get port(): number {
    // Bun の型は unix ソケット起動も含むため `number | undefined`。
    // このアダプタは常に TCP ポートで listen する（`Bun.serve({ port })`）ので
    // undefined にはならない。届かないポート 0 を返せば接続側で即座に失敗して気づける。
    return this.server.port ?? 0;
  }

  /**
   * Upgrade できるものは WebSocket にし、それ以外は httpHandler → 426 で応答する。
   *
   * **Origin と接続数の検査はここで行わない。** ハンドシェイクを拒否すると
   * クライアントには「接続失敗」としか見えず、理由を表す close コード
   * （1008 / 1013）が届かない。upgrade を通したうえで open で閉じる。
   */
  private handleFetch(req: Request, server: Bun.Server<ConnectionData>): Response | undefined {
    const origin = req.headers.get("origin") ?? "";
    // **鍵はここで作る。** 生の IP をこの行より先へ持ち出さない（ADR 0012 D3）。
    const clientKey =
      this.options.deriveClientKey?.(req.headers.get("x-forwarded-for") ?? undefined) ?? null;
    if (server.upgrade(req, { data: { connId: "", origin, clientKey } })) return undefined;

    const url = new URL(req.url);
    const handled = this.options.httpHandler?.({
      method: req.method,
      path: url.pathname + url.search,
      headers: Object.fromEntries(req.headers),
    });
    if (handled) {
      return new Response(handled.body, {
        status: handled.status,
        headers: { "content-type": handled.contentType },
      });
    }
    return new Response("Upgrade Required", {
      status: 426,
      headers: { "content-type": "text/plain" },
    });
  }

  /**
   * サーバー主導の死活監視（Issue #25）。
   * 一定間隔で各接続に ping を送り、直前の送信から pong が来ていなければ
   * 欠落回数を加算する。欠落回数が閾値に達した接続は terminate し、
   * 既存の close 経路（presence の offline 化等）に処理を委ねる（DRY）。
   * 1 接続 1 interval あたり ping 送信は高々 1 回のため、通信量は接続数に対して線形。
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const [connId, ws] of this.connections) {
        const missed = this.missedPongs.get(connId) ?? 0;
        if (missed >= this.heartbeatMaxMisses) {
          ws.terminate();
          continue;
        }
        this.missedPongs.set(connId, missed + 1);
        ws.ping();
      }
    }, this.heartbeatIntervalMs);
    // 定期タイマーだけでプロセスの終了を妨げないようにする（テスト・グレースフルシャットダウン考慮）。
    this.heartbeatTimer.unref?.();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
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
    this.stopHeartbeat();
    // `server.stop()` が返す Promise は、**サーバー側から閉じた接続が 1 つでもあると
    // 解決しない**（2026-08-05 に Bun 1.3.14 で実測）。Origin 拒否・接続数超過・
    // ハートビートの terminate はいずれもサーバー側からの close なので、待つと詰まる。
    // 一方 stop(true) の副作用（新規受付の停止・既存接続の切断・ポート解放）は同期的に
    // 効き、直後に同じポートで listen し直せることも実測済み。そのため待たない。
    void this.server.stop(true);
    return Promise.resolve();
  }

  private handleOpen(ws: Socket): void {
    // Origin 検証（S2）
    if (
      this.options.allowedOrigins.length > 0 &&
      !this.options.allowedOrigins.includes(ws.data.origin)
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
    ws.data.connId = connId;
    this.connections.set(connId, ws);
    this.missedPongs.set(connId, 0);
    this.options.onConnect?.(connId, ws.data.clientKey ?? connId);
  }

  /** pong 受信 = 生存確認。欠落カウントをリセットする（一時的な揺れからの復帰・US2）。 */
  private handlePong(ws: Socket): void {
    const { connId } = ws.data;
    if (connId === "") return;
    this.missedPongs.set(connId, 0);
  }

  private handleMessage(ws: Socket, raw: string | Buffer): void {
    const { connId } = ws.data;
    if (connId === "") return; // 検査で弾いた接続からは受け取らない

    // サイズ制限（S3）。**バイト数で測る**。Bun はテキストフレームを string で
    // 渡してくるため、`raw.length` だと日本語 1 文字が 1 と数えられ、
    // ws 実装（Buffer.length）より制限が緩くなってしまう。
    const bytes = typeof raw === "string" ? Buffer.byteLength(raw) : raw.length;
    if (bytes > MAX_MESSAGE_BYTES) {
      ws.send(
        JSON.stringify({
          type: "error",
          code: "MESSAGE_TOO_LARGE",
          message: "メッセージが大きすぎます",
        }),
      );
      return;
    }

    // 境界のパースは @tasuki/protocol に一本化してある（poker の sync / web も同じものを使う）。
    // 落ちた段（json / schema）で返すエラーコードを分けるのは timer 側の決めごと。
    const parsed = parseBoundaryMessage(CommandSchema, raw.toString());
    if (parsed.isErr()) {
      const code = parsed.error.stage === "json" ? "INVALID_JSON" : "INVALID_COMMAND";
      const message =
        parsed.error.stage === "json" ? "JSON の形式が不正です" : "コマンドの形式が不正です";
      ws.send(JSON.stringify({ type: "error", code, message }));
      return;
    }

    this.options.onMessage(connId, parsed.value).catch(() => {
      ws.send(
        JSON.stringify({
          type: "error",
          code: "INTERNAL_ERROR",
          message: "内部エラーが発生しました",
        }),
      );
    });
  }

  private handleClose(ws: Socket): void {
    const { connId } = ws.data;
    // Origin / 接続数で弾いた接続は受け入れていないので、切断も通知しない（ws 実装と同じ）。
    if (connId === "") return;
    this.connections.delete(connId);
    this.missedPongs.delete(connId);
    this.options.onDisconnect(connId);
  }
}
