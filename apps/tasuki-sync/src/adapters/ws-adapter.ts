/**
 * WS アダプタ — 薄い WebSocket 抽象層
 * T040: FR-013, NFRセキュリティ(S2/S3)
 *
 * 実装は `Bun.serve`（S5・#20）。
 * 外から見える振る舞い（close コード・エラーコード・426）は ws 実装のときと同じ。
 *
 * ## 2 つのプロトコルを 1 本の待ち受けで捌く（#95 S2・D9 / D10）
 *
 * timer と poker の同期サーバーを 1 プロセスへ統合した。`Bun.serve` は 1 プロセスに
 * 1 つの `websocket` ハンドラしか持てないため、**接続層はここに 1 つだけ**置き、
 * **メッセージ層だけをプロトコルごとに分ける**。
 *
 * | 層 | 何を持つか | 統合の影響 |
 * |---|---|---|
 * | 接続層（このクラス） | Origin 検査・クライアント鍵・接続数上限・connId 採番・死活監視・フレーム上限 | **1 つになる**（接続数上限は D22 で値を決め直した） |
 * | メッセージ層 | パース・ディスパッチ・接続ごとのアプリ状態 | **プロトコルごとに分かれたまま** |
 *
 * 振り分けは**パスだけ**で行う（{@link POKER_WS_PATH}）。`/poker/ws` は poker、
 * **それ以外はすべて timer** である。「それ以外すべて」なのは統合前の timer が
 * パスを一切見ずに upgrade していたためで、ここを許可リストへ絞ると
 * 素のポート（`ws://host:port`）へ繋ぐ既存テストが軒並み落ちる。
 * 移行期は `/ws`・`/timer/ws`・`/poker/ws` の 3 つを受ける（D10。S5c で `/ws` に畳む）。
 *
 * 統合前の poker は `url.pathname === '/ws'` 以外を 404 で返していた。その振る舞いは
 * **失われる**（`/poker/ws` 以外は timer 側として upgrade される）。poker へ届く経路は
 * Caddy 断片と vite の dev プロキシだけで、どちらも `/poker/ws` しか出さない。
 */

import { CommandSchema } from "@tasuki/timer-core";
import type { ServerMsg } from "@tasuki/timer-core";
import { parseClientMessage } from "@tasuki/poker-core";
import { parseBoundaryMessage } from "@tasuki/protocol";
import { classifyErrorKind } from "@tasuki/rate-limit";
import type { Logger } from "../application/log/logger.js";
import { publicText, type LogSafe } from "../application/log/log-safe.js";
import { CONN_REJECT_REASONS } from "../application/log/vocabulary.js";
import { deriveClientKeySafely } from "./client-key-safety.js";
import type { Handlers as PokerHandlers } from "../poker/application/handlers.js";

/**
 * poker のメッセージ層へ振り分けるパス。**小文字で書く**（照合は小文字化してから行う）。
 *
 * **本番の Caddy 断片（`deploy/poker/caddy/20-poker.conf`）は rewrite せずに
 * このパスのまま渡す。** 統合前は `/poker/ws` を `/ws` へ剥がしていたが、
 * 剥がすと timer と区別できなくなる（timer 側の断片は今も `/ws` へ剥がす）。
 * 一致は `apps/landing/tests/caddy-fragment-port.test.ts` が機械的に固定している。
 */
const POKER_WS_PATH = "/poker/ws";

/**
 * 振り分けの照合に使う形へパスを正規化する。
 *
 * **Caddy は「復号したパス」で照合し、「受け取ったままの綴り」を上流へ渡す**
 * （2026-09-08 に 2.11.4 で実測）。したがって `handle /poker/ws` には
 * `/POKER/WS` も `/poker/%77s` も一致し、こちらへはその綴りのまま届く。
 * `new URL()` の `pathname` は復号しないので、**復号と小文字化の両方**を
 * ここで行わないと timer 側へ落ちる（接続はできるのに全コマンドが
 * `INVALID_COMMAND` になる、という静かな壊れ方をする）。
 *
 * 統合前は断片の `rewrite * /ws` が綴りごと正規化していたため、poker-sync の
 * `=== '/ws'` という厳密比較でも取りこぼしが無かった。rewrite を外した以上、
 * その正規化はこちらの責務になっている。
 *
 * **不正な `%` 列（`%zz` など）で `decodeURIComponent` は throw する。**
 * その場合は復号前の値で照合する（＝ poker には一致せず timer 側へ行く）。
 * 呼び出し元を巻き込まないことが目的で、投げ直さない。
 */
function normalizeWsPath(pathname: string): string {
  try {
    return decodeURIComponent(pathname).toLowerCase();
  } catch {
    return pathname.toLowerCase();
  }
}

/**
 * `catch (err)` で受けた `err` から、ログへ出してよい「例外の分類」を取り出す（I-1）。
 *
 * 分類そのものの実装（`instanceof Error` の実行時判定・`name` ゲッタが throw する
 * 場合の入れ子 catch・長さと文字種の丸め）は `@tasuki/rate-limit` の
 * `classifyErrorKind` へ切り出した（poker-sync にも同じガードが要るため。
 * #103 Task 7 レビュー S-2。複製すると S-1 と同じ二重正本の問題が再発する）。
 * ここでは `LogSafe`（ADR 0012 D1 のブランド型。timer-sync のログ基盤に閉じた
 * 型で `scripts/audit-log-hygiene.mjs` の ALLOWED_FILES もアプリ側に限定）で
 * 包むだけの薄い層にする。
 */
function classifyError(err: unknown): LogSafe {
  return publicText(classifyErrorKind(err)); // log-hygiene:allow 例外の分類のみ
}

/** ハートビート間隔の既定値（ms）。Issue #25: サーバー主導の死活監視。 */
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
/** 許容する連続 pong 欠落回数の既定値。一時的な通信の揺れを吸収する猶予（US2）。 */
const DEFAULT_HEARTBEAT_MAX_MISSES = 2;

/**
 * httpHandler（`handleAdminHttp`）へ渡すヘッダの許可リスト（N-4）。
 * 実際に読まれているのは `x-admin-token` だけ
 * （`apps/tasuki-sync/src/application/admin.ts` で確認済み）。
 * 増やすときは、そのヘッダが本当に読まれる先を確認してから足すこと。
 * `as const` にしてあるのは、受け取り側 `pickHeaders` の `readonly string[]`
 * に噛み合わせるため（Minor 4）。
 */
const ADMIN_HTTP_ALLOWED_HEADERS = ["x-admin-token"] as const;

/** `headers` のうち `allowed` に含まれるキーだけを取り出す（キーは小文字で比較）。 */
function pickHeaders(headers: Headers, allowed: readonly string[]): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const key of allowed) {
    const value = headers.get(key);
    if (value !== null) picked[key] = value;
  }
  return picked;
}

/**
 * httpHandler に渡すリクエスト表現。
 * Node の IncomingMessage にも Bun の Request にも依存しない形にしてある。
 */
export interface HttpRequestInfo {
  method: string;
  /** クエリを含むパス（`/status?x=1`）。handleAdminHttp が `?` で切る。 */
  path: string;
  /** キーは小文字。**許可リスト（{@link ADMIN_HTTP_ALLOWED_HEADERS}）に絞ってある。** */
  headers: Record<string, string>;
}

/**
 * WS アダプタが poker のメッセージ層に求めるものだけ
 * （残りのハンドラはここを通らない）。統合前の
 * `apps/poker-sync/src/adapters/ws-adapter.ts` の `WsAdapterHandlers` と同じ絞り込み。
 */
export type PokerMessageHandlers = Pick<
  PokerHandlers,
  "dispatch" | "detachFromCurrentRoom" | "sendError"
>;

export interface WsAdapterOptions {
  port: number;
  host?: string;
  /** 同時接続数の上限。超過分は 1013 で拒否する。 */
  maxConnections?: number;
  allowedOrigins: string[];
  onMessage: (connId: string, msg: unknown) => Promise<void>;
  /**
   * 接続が閉じたときに呼ばれる（Origin / 接続数上限で弾いた接続は除く。
   * その場合はアプリ層へ「受け入れていない接続」を通知しない）。
   *
   * **契約（Minor 2）: `onConnect` が呼ばれた・成功したことの保証ではない。**
   * `connId` の登録（`connections.set`）は `onConnect` の呼び出しより前に
   * 済んでいるため、`onConnect` が throw して失敗しても close は通知される
   * （open/close の非対称。現在の挙動として維持すると裁定済み）。
   * 実装は「`onConnect` を経ていない・失敗した」`connId` に対して呼ばれても
   * 安全であること（例: `Map.delete` は無いキーに対して no-op）。
   */
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
   * true のとき、クライアント鍵を導けなかった接続を拒否する（本番の fail-closed）。
   * Caddy を迂回した直結は X-Forwarded-For を持たないため、ここで落ちる。
   */
  requireClientAddress?: boolean;
  /**
   * 接続が受理された（Origin・接続数の検査を通った）ときに 1 度だけ呼ばれる。
   * `rateKey` はクライアント鍵。特定できなければ `connId` が入る。
   */
  onConnect?: (connId: string, rateKey: string) => void;
  /** 運用ログの出口（ADR 0012 D1） */
  logger: Logger;
  /**
   * 1 メッセージの最大バイト数。超過はエラー応答（接続は保つ）。
   * 統合前は 64KB をこのファイルに直書きしていたが、poker 側が env から絞れる形を
   * 持っていたので設定へ寄せた（#95 S2）。**既定値は両者とも 64KB で同じ**。
   */
  maxMessageBytes: number;
  /**
   * WebSocket フレームの最大バイト数（`Bun.serve` の `maxPayloadLength`）。
   * 根拠と統合による変化は `config.ts` の同名フィールドの docstring にある。
   */
  maxFrameBytes: number;
  /** poker のメッセージ層。`/poker/ws` に来た接続だけがここへ流れる。 */
  poker: PokerMessageHandlers;
}

/**
 * 接続ごとに持ち回る値。
 * `connId` は Origin / 接続数の検査を通ってから採番するため、それまでは空文字。
 * 空のまま閉じた接続は「受け入れていない接続」なので onDisconnect を呼ばない。
 *
 * **poker 用の 3 つ（`rateKey` / `participantId` / `roomId`）を timer の接続も
 * 持ち回る。** 統合前の poker は同じ 3 つを自分の `ConnectionData` に持っており、
 * `HandlerConnection`（`poker/application/handlers.ts`）が構造的にこれを要求する。
 * timer 側はこの 3 つを読み書きしない（timer のハンドラは `connId` だけで話し、
 * レート制限の鍵は `onConnect` で受け取ってアプリ層の `RateLimitGate` が持つ）。
 * **文脈ごとに分けるのは S4a の仕事**である（名簿を統合する段。設計正本 §5.4）。
 * S2 で分けると、poker のハンドラとその 20 本近いテストを同じ PR で書き換えることになり、
 * 「純粋な移設で振る舞いを変えない」という段の前提を自分で壊す。
 */
interface ConnectionData {
  connId: string;
  origin: string;
  /** `X-Forwarded-For` から導いた鍵。特定できなければ null。 */
  clientKey: string | null;
  /** どちらのメッセージ層へ渡すか。upgrade の時点でパスから決まる。 */
  protocol: "timer" | "poker";
  /** レート制限の鍵（クライアント鍵。特定できなければ接続 ID）。受理まで空文字。 */
  rateKey: string;
  /** poker のみ使用。join 後に入る。 */
  participantId: string | null;
  /** poker のみ使用。join 後に入る。 */
  roomId: string | null;
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
        // 既定は `process.env.NODE_ENV !== 'production'`（Bun 1.3.14）。env の
        // 設定漏れ 1 つで「未処理例外がソース断片つきの HTML として応答本体に
        // 出る」状態に化けるため、env に依存させず常に false で固定する（N-1）。
        development: false,
        fetch: (req, server) => this.handleFetch(req, server),
        websocket: {
          // フレーム上限は**設定から導出して明示指定する**（#95 S2 で poker 側の
          // 判断へ揃えた）。既定（16MB）のままだと、アプリの上限が 64KB でも
          // 1 フレームあたり 16MB を確保させられる。また運用者が MAX_MESSAGE_BYTES を
          // 16MB 以上にしたとき、超過フレームがプロトコル層で切られて
          // 「エラー応答を返して接続は保つ」が成立しなくなる。
          //
          // ⚠ **統合で timer 側の実効値が下がる。** 旧実装は指定せず Bun の既定
          // （16MB）に委ねており、64KB〜16MB のフレームには MESSAGE_TOO_LARGE を
          // 返して接続を保っていた。今後その帯域のうち maxFrameBytes（既定 128KB）
          // より上は 1006 切断になる。アプリの制限 64KB の遥か上で、正当なコマンドが
          // この範囲に入ることはないため許容する。
          maxPayloadLength: options.maxFrameBytes,
          open: (ws) => this.handleOpen(ws),
          message: (ws, raw) => this.handleMessage(ws, raw),
          close: (ws) => this.handleClose(ws),
          pong: (ws) => this.handlePong(ws),
        },
      });
    } catch (err) {
      // 起動時の bind 失敗（EADDRINUSE 等）は回復不能。未処理例外でクラッシュさせず明示終了する。
      this.options.logger.error("http-server-error", { name: classifyError(err) });
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
   * **本体全体を `try/catch` で囲む（I-4）。** `server.upgrade` / `new URL` /
   * `httpHandler` / `new Response` のいずれかで throw すると、development:
   * false でも Bun 自身のフォールバック応答はロガ（ADR 0012 D1）を経由せず、
   * stderr に例外メッセージとスタックが出る（再レビュー実測: `logger lines = []`）。
   * この関数が呼び出しうる経路（`server.upgrade` 等）は今後も増減しうるため、
   * 個別の呼び出しを都度 try/catch するのではなく本体全体を隔離しておく。
   */
  private handleFetch(req: Request, server: Bun.Server<ConnectionData>): Response | undefined {
    try {
      return this.handleFetchUnsafe(req, server);
    } catch (err) {
      this.options.logger.error("http-fetch-error", { name: classifyError(err) });
      return new Response("Internal Server Error", {
        status: 500,
        headers: { "content-type": "text/plain" },
      });
    }
  }

  /**
   * `handleFetch` の本体。**Origin と接続数の検査はここで行わない。**
   * ハンドシェイクを拒否するとクライアントには「接続失敗」としか見えず、
   * 理由を表す close コード（1008 / 1013）が届かない。upgrade を通したうえで
   * open で閉じる。
   */
  private handleFetchUnsafe(
    req: Request,
    server: Bun.Server<ConnectionData>,
  ): Response | undefined {
    const origin = req.headers.get("origin") ?? "";
    // **鍵はここで作る。** 生の IP をこの行より先へ持ち出さない（ADR 0012 D3）。
    const clientKey = this.deriveClientKeySafely(req.headers.get("x-forwarded-for") ?? undefined);
    // パスは upgrade を試みる前に読む。`new URL` は upgrade の成否に関わらず
    // 必要で、失敗しても handleFetch の try/catch が受ける。
    const url = new URL(req.url);
    // 綴りの揺れ（大小・パーセント符号化）は `normalizeWsPath` が吸収する。
    // 理由と実測はその docstring にある。
    const protocol = normalizeWsPath(url.pathname) === POKER_WS_PATH ? "poker" : "timer";
    if (
      server.upgrade(req, {
        data: {
          connId: "",
          origin,
          clientKey,
          protocol,
          rateKey: "",
          participantId: null,
          roomId: null,
        } satisfies ConnectionData,
      })
    ) {
      return undefined;
    }

    const handled = this.options.httpHandler?.({
      method: req.method,
      path: url.pathname + url.search,
      // 非 Upgrade の HTTP リクエストに限っても、生のヘッダを丸ごとは渡さない。
      // httpHandler（handleAdminHttp）が実際に読むのは `x-admin-token` だけ
      // （apps/tasuki-sync/src/application/admin.ts で確認済み）なので許可リストに絞る。
      // 「賢い検査より単純な検査・無状態＋許可リストへ倒す」の教訓に合わせる。
      headers: pickHeaders(req.headers, ADMIN_HTTP_ALLOWED_HEADERS),
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
   * `deriveClientKey` を安全に呼ぶ。throw しても呼び出し元（handleFetch）を
   * 巻き込まず、鍵は「特定できなかった」扱い（null）にする（N-1）。
   *
   * **例外メッセージをログへ出さない。** `deriveClientKey` の入力は
   * `X-Forwarded-For`（利用者由来）であり、例外メッセージに載りうる
   * （`docs/adr/0012` D3）。ログに出すのは例外の種類（name）だけにする。
   *
   * 判定そのものは `./client-key-safety.js` の純粋関数が持つ（#95 S2）。
   * 統合前は timer（このメソッド）と poker（`client-key-safety.ts`）に
   * 同じ守りが 2 つあり、`docs/adr/0002` が禁じる二重正本だった。
   * 実体を差し替えて throw させるテストがあちらに付いているので、そちらを残した。
   */
  private deriveClientKeySafely(forwardedFor: string | undefined): string | null {
    const derive = this.options.deriveClientKey;
    if (!derive) return null;
    // **`?? null` を落とさない。** 注入された実装が `undefined` を返すと
    // `ws.data.clientKey` が `undefined` になり、`handleOpen` の本番 fail-closed
    // （`=== null` の厳密比較）が発火しないまま `rateKey` が `connId` へ落ちる
    // （＝再接続でリセットできるレート制限に戻る）。本番の `createClientKeyDeriver` は
    // `string | null` しか返さないが、ここは差し替えを前提にした注入点である。
    return (
      deriveClientKeySafely(derive, forwardedFor, (name) => {
        this.options.logger.error("derive-client-key-error", { name: publicText(name) }); // log-hygiene:allow 例外の分類のみ
      }) ?? null
    );
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

  /**
   * **`data` は `ServerMsg` に限る（#181）。** 以前は `unknown` で、
   * `ServerMsgSchema` が定める契約を製品コードの誰も参照していなかった。
   * 実行時の検証は受信側（`apps/timer-web/src/sync/dispatch.ts`）が持ち、
   * ここは**新しい送信箇所が黙って契約から外れること**を型で止める。
   */
  send(connId: string, data: ServerMsg): void {
    const ws = this.connections.get(connId);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  broadcast(connIds: string[], data: ServerMsg): void {
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
    // クライアント鍵の検査は Origin より前に置く。**どちらも 1008 なので、
    // 後ろに置くと「直結が拒否される」ことを確かめるテストが Origin 拒否を
    // 見ているだけ、という空振りになる。**
    if (this.options.requireClientAddress === true && ws.data.clientKey === null) {
      // 列挙値だけを出す（P-2）。生の IP・相関キーは載せない（ADR 0012 D3）。
      this.options.logger.warn("conn-rejected", { reason: CONN_REJECT_REASONS.clientAddress });
      ws.close(1008, "Client address required");
      return;
    }

    // Origin 検証（S2）
    if (
      this.options.allowedOrigins.length > 0 &&
      !this.options.allowedOrigins.includes(ws.data.origin)
    ) {
      // 列挙値だけを出す（P-2）。Origin の値そのものは載せない（ADR 0012 D3）。
      this.options.logger.warn("conn-rejected", { reason: CONN_REJECT_REASONS.origin });
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
    // レート制限の鍵は受理の時点で決まる。**poker のメッセージ層はこれを
    // `ws.data.rateKey` から直接読む**（timer 側は下の onConnect で受け取る）。
    // 値そのものは両プロトコルで同じ（クライアント鍵、特定できなければ connId）。
    ws.data.rateKey = ws.data.clientKey ?? connId;
    this.connections.set(connId, ws);
    this.missedPongs.set(connId, 0);
    // poker のメッセージ層に接続受理のフックは無い（統合前の
    // `apps/poker-sync/src/adapters/ws-adapter.ts` も rateKey を入れて終わりだった）。
    if (ws.data.protocol === "poker") return;
    // onConnect は呼び出し元（アプリ層）のコールバック。throw すると Bun の
    // websocket ハンドラ内なので uncaughtException になり、本番の server.ts が
    // process.exit(1) で受ける（実測）。コールバックの失敗でプロセス全体を
    // 落とさないよう、ここで隔離する（N-3）。onConnect の実体（アプリ層の
    // handleConnectionOpen）が rateLimitGate.open() を呼ぶのはここではなく
    // application/handlers.ts 側であり、この adapter 自身はゲートを知らない。
    try {
      this.options.onConnect?.(connId, ws.data.rateKey);
    } catch (err) {
      this.options.logger.error("on-connect-error", { name: classifyError(err) });
    }
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

    // ⚠ **超過の返し方はプロトコルごとに違う。** timer は `MESSAGE_TOO_LARGE`
    // （`ServerMsg` の ErrorCode）、poker は `message-too-large`
    // （`@tasuki/poker-core` の ErrorCode）で、どちらも wire に載る値である。
    // 片方へ寄せると相手の web が知らないコードを受け取る（振る舞いが変わる）。
    if (ws.data.protocol === "poker") {
      this.handlePokerMessage(ws, raw, bytes);
      return;
    }

    if (bytes > this.options.maxMessageBytes) {
      this.sendFrame(ws, {
        type: "error",
        code: "MESSAGE_TOO_LARGE",
        message: "メッセージが大きすぎます",
      });
      return;
    }

    // 境界のパースは @tasuki/protocol に一本化してある（poker の sync / web も同じものを使う）。
    // 落ちた段（json / schema）で返すエラーコードを分けるのは timer 側の決めごと。
    const parsed = parseBoundaryMessage(CommandSchema, raw.toString());
    if (parsed.isErr()) {
      const code = parsed.error.stage === "json" ? "INVALID_JSON" : "INVALID_COMMAND";
      const message =
        parsed.error.stage === "json" ? "JSON の形式が不正です" : "コマンドの形式が不正です";
      this.sendFrame(ws, { type: "error", code, message });
      return;
    }

    // onMessage は型上 `Promise<void>` を返す契約だが、実装が async でなければ
    // 同期的に throw しうる（型は実行時の保証にはならない。`.catch` は reject
    // しか拾わない）。呼び出し自体を try/catch で囲んで別途隔離する（I-5）。
    try {
      this.options.onMessage(connId, parsed.value).catch(() => {
        this.sendInternalError(ws);
      });
    } catch (err) {
      this.options.logger.error("on-message-error", { name: classifyError(err) });
      this.sendInternalError(ws);
    }
  }

  /**
   * poker のメッセージ層へ渡す（サイズ判定・パース・ディスパッチ）。
   *
   * **本体を `try/catch` で隔離する。** poker のハンドラは同期に throw しうる。
   * 統合前はそれで死ぬのは poker のプロセスだけだったが、**統合後は同じ 1 プロセスに
   * 載っている timer のルームも道連れになる**（`server.ts` の `uncaughtException` が
   * `process.exit(1)` する・揮発インメモリ）。このアダプタが `onConnect` /
   * `onDisconnect` / timer の `onMessage` / poker の `detachFromCurrentRoom` を
   * 隔離しているのと同じ理由が、ここにも等しく当てはまる。
   *
   * **エラーフレームは返さず、接続を 1011 で閉じる。** poker の `ERROR_CODES`
   * （`packages/poker-core/src/protocol.ts`）に「内部エラー」に当たるコードが無く、
   * 足すのは wire の契約の変更になる（`docs/poker/adr/0003` 決定 4「送信側は縛ったまま」）。
   * 一方、**黙って開いたままにするのは統合前より悪い**。統合前はプロセスが落ちて
   * クライアントが切断を観測し再接続していたが、`apps/poker-web/src/hooks/useSync.ts`
   * にコマンド単位のタイムアウトは無いため（再接続のバックオフだけ）、応答も切断も
   * 無ければ画面は永久に待つ。1011（Internal Error）は WebSocket の標準の close コードで、
   * **新しい wire のコードを足さずに「何かが起きた」ことだけを伝えられる**。
   * この接続だけが閉じ、同じプロセスに載る timer のルームには波及しない。
   */
  private handlePokerMessage(ws: Socket, raw: string | Buffer, bytes: number): void {
    try {
      if (bytes > this.options.maxMessageBytes) {
        // 接続は保つ（切断ではなくエラー応答）。再送で回復できる種類の失敗のため。
        this.options.poker.sendError(ws, "message-too-large", "メッセージが大きすぎます");
        return;
      }
      const result = parseClientMessage(String(raw));
      if (result.isErr()) {
        this.options.poker.sendError(ws, result.error.code, result.error.message);
        return;
      }
      this.options.poker.dispatch(ws, result.value);
    } catch (err) {
      this.options.logger.error("on-message-error", { name: classifyError(err) });
      // 閉じるのは**この接続だけ**。close 自体が throw しても巻き込まない。
      try {
        ws.close(1011, "Internal error");
      } catch (closeErr) {
        this.options.logger.error("on-message-error", { name: classifyError(closeErr) });
      }
    }
  }

  /** onMessage 側の失敗を利用者へ返す共通の応答（同期 throw / 非同期 reject の両方から使う）。 */
  private sendInternalError(ws: Socket): void {
    this.sendFrame(ws, {
      type: "error",
      code: "INTERNAL_ERROR",
      message: "内部エラーが発生しました",
    });
  }

  /**
   * 手元の socket へ直接フレームを送る（#181）。
   *
   * **`broadcaster` を経由できない経路のための口である。** サイズ超過・不正 JSON・
   * 内部エラーの 3 つは、アダプタが `broadcaster` を持たないためここから返す。
   * ここを `ServerMsg` で受けることで、**その 3 経路も契約の型検査を通る**
   * （以前はオブジェクトリテラルを直接 `JSON.stringify` していた）。
   *
   * **`connId` が確定していないから、ではない。** 3 つの呼び出し元はいずれも
   * `handleMessage` の配下で、そこは冒頭の `connId === ""` の門を通過済みである
   * （初出の説明はそう書いていたが誤りだった。#181 の敵対的検証で判明）。
   *
   * **`send()` と同じく OPEN のときだけ送る。** `sendInternalError` は
   * `onMessage(...).catch(...)` から呼ばれるので、**利用者が切ったあとに走りうる**。
   */
  private sendFrame(ws: Socket, msg: ServerMsg): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }

  private handleClose(ws: Socket): void {
    const { connId } = ws.data;
    // Origin / 接続数で弾いた接続は受け入れていないので、切断も通知しない（ws 実装と同じ）。
    if (connId === "") return;
    this.connections.delete(connId);
    this.missedPongs.delete(connId);
    if (ws.data.protocol === "poker") {
      // poker はルーム離脱の後始末をメッセージ層が持つ（timer は presence 管理が持つ）。
      // 隔離の理由は timer 側の onDisconnect と同じ（コールバックの失敗で
      // プロセス全体を落とさない）。
      try {
        this.options.poker.detachFromCurrentRoom(ws);
      } catch (err) {
        this.options.logger.error("on-disconnect-error", { name: classifyError(err) });
      }
      return;
    }
    // onDisconnect は呼び出し元（アプリ層）のコールバック。onConnect を隔離した
    // 根拠（「コールバックの失敗でプロセス全体を落とさない」）は onDisconnect にも
    // 等しく当てはまる（I-5）。onDisconnect の実体（アプリ層の
    // handleConnectionClose）が rateLimitGate.close() を呼ぶのはここではなく
    // application/handlers.ts 側であり、この adapter 自身はゲートを知らない。
    try {
      this.options.onDisconnect(connId);
    } catch (err) {
      this.options.logger.error("on-disconnect-error", { name: classifyError(err) });
    }
  }
}
