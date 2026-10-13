/**
 * WS アダプタ — 薄い WebSocket 抽象層
 * T040: FR-013, NFRセキュリティ(S2/S3)
 *
 * 実装は `Bun.serve`（S5・#20）。
 * 外から見える振る舞い（close コード・エラーコード・426）は ws 実装のときと同じ。
 *
 * ## 4 つのメッセージ層を 1 本の待ち受けで捌く（#95 S2・S5a・S5c・D9 / D10・#91 でお題を追加）
 *
 * timer と poker の同期サーバーを 1 プロセスへ統合した（のちに #91 でお題も同じ
 * プロセスへ加わった）。`Bun.serve` は 1 プロセスに 1 つの `websocket` ハンドラしか
 * 持てないため、**接続層はここに 1 つだけ**置き、**メッセージ層だけをプロトコルごとに分ける**。
 *
 * | 層 | 何を持つか | 統合の影響 |
 * |---|---|---|
 * | 接続層（このクラス） | Origin 検査・クライアント鍵・接続数上限・connId 採番・死活監視・フレーム上限 | **1 つになる**（接続数上限は D22 で値を決め直した） |
 * | メッセージ層 | パース・ディスパッチ・接続ごとのアプリ状態 | **プロトコルごとに分かれたまま** |
 *
 * **振り分けは接続 URL のクエリ（`?tool=`）だけで決める**（{@link protocolFromRequestUrl}）。
 * 入口は `/ws` の 1 本だけである（#95 S5c・#249 Task 5）。`/timer/ws`・`/poker/ws` という
 * パスによる振り分けは撤去した —— 旧パスは Caddy 断片ごと落としたので、本番でこの層へ
 * 届くことはもう無い。
 */

import { CommandSchema } from "@tasuki/timer-core";
import type { Command, ServerMsg } from "@tasuki/timer-core";
import { parseClientMessage } from "@tasuki/poker-core";
import { parseBoundaryMessage } from "@tasuki/protocol";
import type { HubServerMsg } from "@tasuki/room-core";
import { classifyErrorKind } from "@tasuki/rate-limit";
import type { Logger } from "../application/log/logger.js";
import { publicText, type LogSafe } from "../application/log/log-safe.js";
// 接続層が自分で返す文言の正本（#362）。**コードごとに 1 つだけ**にする（SC-035）。
// poker はコード体系が違う（`message-too-large`）が、上限超えはこの接続層が同じ判定で返すので、
// 文は同じ正本から取る。
import {
  CONNECTION_ERROR_TEXT,
  TIMER_INTERNAL_ERROR_TEXT,
  boundaryErrorCode,
} from "../application/connection-errors.js";
import { deriveClientKeySafely } from "./client-key-safety.js";
import { admit, protocolFromRequestUrl } from "./ws/connection-gate.js";
import { Heartbeat } from "./ws/heartbeat.js";
import { sendIfOpen, sendToEach } from "./ws/ws-send.js";
import { respondToPlainHttp, type HttpHandler } from "./ws/http-fallback.js";
import type { PokerHandlers } from "../application/poker-handlers.js";
import type { RouletteOwnFrame, RouletteServerMsg } from "../ports/roulette-server-msg.js";
import type { TopicOwnFrame, TopicServerMsg } from "../ports/topic-server-msg.js";

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
  /**
   * timer へ届いたコマンド。**接続層で境界の検証（`CommandSchema`）を済ませた値**を、
   * 型（`Command`）のまま渡す（#363。以前は `unknown` で渡し、受け手が `as Command` で戻していた）。
   * 表示名の正規化は受け手（`application/timer-command-receiver.ts`）が掛ける（#368）。
   */
  onMessage: (connId: string, msg: Command) => Promise<void>;
  /**
   * ハブ（選択画面）へ届いた生テキスト（#95 S5a）。
   *
   * **timer の `onMessage` と違い、パース前の文字列を渡す。** 境界の検証を
   * メッセージ層（`application/hub-handlers.ts`）に置き、この層は経路とサイズだけを見る。
   */
  onHubMessage: (connId: string, raw: string) => Promise<void>;
  /**
   * お題（topic）へ届いた生テキスト（#91）。
   *
   * **`onHubMessage` と同じく、パース前の文字列を渡す。** 境界の検証はメッセージ層
   * （Task 9 で配線するアプリ層）に置き、この層は経路とサイズだけを見る。
   */
  onTopicMessage: (connId: string, raw: string) => Promise<void>;
  /**
   * ルーレット（roulette）へ届いた生テキスト（#94）。
   *
   * **`onTopicMessage` と同じく、パース前の文字列を渡す。** 境界の検証はメッセージ層
   * （`application/roulette-handlers.ts`）に置き、この層は経路とサイズだけを見る。
   */
  onRouletteMessage: (connId: string, raw: string) => Promise<void>;
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
  httpHandler?: HttpHandler;
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
  /** poker のメッセージ層。`?tool=poker` を宣言した接続だけがここへ流れる。 */
  poker: PokerMessageHandlers;
}

/**
 * すべての接続が持つ値。
 * `connId` は Origin / 接続数の検査を通ってから採番するため、それまでは空文字。
 * 空のまま閉じた接続は「受け入れていない接続」なので onDisconnect を呼ばない。
 */
interface ConnectionBase {
  connId: string;
  origin: string;
  /** `X-Forwarded-For` から導いた鍵。特定できなければ null。 */
  clientKey: string | null;
  /** レート制限の鍵（クライアント鍵。特定できなければ接続 ID）。受理まで空文字。 */
  rateKey: string;
}

/**
 * どのメッセージ層へ渡すかと、その層だけが持つ値（#95 S5c）。
 *
 * **S4b までは 3 つの項目（`rateKey` / `participantId` / `roomId`）を全接続が持ち回っていた。**
 * 統合前の poker が同じ 3 つを持っており、`HandlerConnection`
 * （`application/poker-handlers.ts`）が構造的にこれを要求するためである。timer 側は
 * `participantId` / `roomId` を読み書きしない。**この段で入口が `/ws` 1 本になり、
 * `protocol` の決まり方そのものが変わったので、割り方もここで決めた。**
 *
 * `"hub"` は選択画面（#95 S5a）。**在席の宣言もここで決まる** —— ハブの接続はどのツールも
 * 宣言しない（`tool: null`）ので、ツールの参加者一覧には出ない。
 * `"unknown"` は許可リストに無い `?tool=` の値。`handleOpen` が 1008 で閉じる。
 */
type ToolContext =
  | { readonly protocol: "timer" }
  | { readonly protocol: "topic" }
  | { readonly protocol: "roulette" }
  | { readonly protocol: "hub" }
  | { readonly protocol: "unknown" }
  | { readonly protocol: "poker"; participantId: string | null; roomId: string | null };

type ConnectionData = ConnectionBase & ToolContext;

type Socket = Bun.ServerWebSocket<ConnectionData>;

/** poker の枝だけに絞った {@link Socket}。{@link isPokerSocket} が絞り込みに使う。 */
type PokerSocket = Bun.ServerWebSocket<Extract<ConnectionData, { protocol: "poker" }>>;

/**
 * `ws.data.protocol === "poker"` を型ガードとして使うための関数（#95 S5c）。
 *
 * **`ws.data.protocol === "poker"` という条件式そのものは `ws`（`Socket` =
 * `Bun.ServerWebSocket<ConnectionData>`）を絞り込まない。** TypeScript はプロパティ
 * アクセス式 `ws.data` の型は絞り込むが、ジェネリックで実体化した `ws` 自体の型までは
 * 絞り込まないため、`poker.dispatch` 等が要求する `HandlerConnection`
 * （`data.participantId` / `data.roomId` を無条件に持つ）へそのまま渡せない
 * （実測: `tsc` はここで `Socket` を `PokerSocket` に代入できないと報告する）。
 * 型ガード関数として明示すれば、`ws` そのものを `PokerSocket` へ絞り込める。
 */
function isPokerSocket(ws: Socket): ws is PokerSocket {
  return ws.data.protocol === "poker";
}

export class WsAdapter {
  private readonly server: Bun.Server<ConnectionData>;
  private readonly connections = new Map<string, Socket>();
  private connCounter = 0;
  /** 死活監視（Issue #25）。受理済みの接続の表を読む。 */
  private readonly heartbeat: Heartbeat;

  constructor(private readonly options: WsAdapterOptions) {
    this.heartbeat = new Heartbeat(this.connections, {
      intervalMs: options.heartbeatIntervalMs,
      maxMisses: options.heartbeatMaxMisses,
    });

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

    this.heartbeat.start();
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
    // `new URL` は upgrade の成否に関わらず必要で、失敗しても handleFetch の try/catch が受ける。
    const url = new URL(req.url);
    // 入口は /ws の 1 本だけなので、振り分けはクエリ（?tool=）だけで決まる（#95 S5c）。
    const protocol = protocolFromRequestUrl(url);
    // poker の枝だけが participantId / roomId を持つ（判別可能ユニオン。#95 S5c）。
    const base = { connId: "", origin, clientKey, rateKey: "" };
    const data: ConnectionData =
      protocol === "poker"
        ? { ...base, protocol, participantId: null, roomId: null }
        : { ...base, protocol };
    if (server.upgrade(req, { data })) {
      return undefined;
    }

    return respondToPlainHttp(req, url, this.options.httpHandler);
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
   * **`data` は `ServerMsg` に限る（#181）。** 以前は `unknown` で、
   * `ServerMsgSchema` が定める契約を製品コードの誰も参照していなかった。
   * 実行時の検証は受信側（`apps/timer-web/src/sync/dispatch.ts`）が持ち、
   * ここは**新しい送信箇所が黙って契約から外れること**を型で止める。
   */
  send(connId: string, data: ServerMsg): void {
    sendIfOpen(this.connections.get(connId), JSON.stringify(data));
  }

  /**
   * ハブ（選択画面）の接続へ送る（#95 S5a）。
   *
   * **timer の {@link send} と分けてある。** 型が違う（`HubServerMsg`）だけでなく、
   * 混ぜると「timer の snapshot をハブへ送る」経路が型検査を通ってしまう。
   */
  sendHub(connId: string, data: HubServerMsg): void {
    sendIfOpen(this.connections.get(connId), JSON.stringify(data));
  }

  /** ハブの接続へ一斉に送る。 */
  broadcastHub(connIds: string[], data: HubServerMsg): void {
    sendToEach(this.connections, connIds, JSON.stringify(data));
  }

  /**
   * お題（topic）の接続へ送る（#91）。
   *
   * **`TopicServerMsg` はハブ・timer・poker の接続へ送るときも使う**
   * （配信先はルームの全接続・spec §9）。{@link sendHub} と分けてあるのは、`sendHub` の型
   * （`HubServerMsg`）ではお題のフレーム（`topic` / `error`（お題のコード体系））を
   * 型検査が拒むためである。
   */
  sendTopic(connId: string, data: TopicServerMsg): void {
    sendIfOpen(this.connections.get(connId), JSON.stringify(data));
  }

  /** お題（topic）の接続へ一斉に送る。 */
  broadcastTopic(connIds: string[], data: TopicServerMsg): void {
    sendToEach(this.connections, connIds, JSON.stringify(data));
  }

  /**
   * ルーレット（roulette）の接続へ送る（#94）。{@link sendTopic} と同じく、`sendHub` の型
   * （`HubServerMsg`）ではルーレットのフレームを型検査が拒むため分けてある。
   */
  sendRoulette(connId: string, data: RouletteServerMsg): void {
    sendIfOpen(this.connections.get(connId), JSON.stringify(data));
  }

  /** ルーレット（roulette）の接続へ一斉に送る。 */
  broadcastRoulette(connIds: string[], data: RouletteServerMsg): void {
    sendToEach(this.connections, connIds, JSON.stringify(data));
  }

  broadcast(connIds: string[], data: ServerMsg): void {
    sendToEach(this.connections, connIds, JSON.stringify(data));
  }

  close(): Promise<void> {
    this.heartbeat.stop();
    // `server.stop()` が返す Promise は、**サーバー側から閉じた接続が 1 つでもあると
    // 解決しない**（2026-08-05 に Bun 1.3.14 で実測）。Origin 拒否・接続数超過・
    // ハートビートの terminate はいずれもサーバー側からの close なので、待つと詰まる。
    // 一方 stop(true) の副作用（新規受付の停止・既存接続の切断・ポート解放）は同期的に
    // 効き、直後に同じポートで listen し直せることも実測済み。そのため待たない。
    void this.server.stop(true);
    return Promise.resolve();
  }

  private handleOpen(ws: Socket): void {
    // 判定は入場の門（`ws/connection-gate.ts`）が持つ。ここは実行するだけ（#368 Task 4）。
    const admission = admit(ws.data, this.options, this.connections.size);
    if (admission.kind === "reject") {
      if (admission.logReason !== null) {
        this.options.logger.warn("conn-rejected", { reason: admission.logReason });
      }
      ws.close(admission.code, admission.reason);
      return;
    }

    const connId = `conn-${++this.connCounter}`;
    ws.data.connId = connId;
    // レート制限の鍵は受理の時点で決まる。**poker のメッセージ層はこれを
    // `ws.data.rateKey` から直接読む**（timer 側は下の onConnect で受け取る）。
    // 値そのものは両プロトコルで同じ（クライアント鍵、特定できなければ connId）。
    ws.data.rateKey = ws.data.clientKey ?? connId;
    this.connections.set(connId, ws);
    this.heartbeat.track(connId);
    // poker のメッセージ層に接続受理のフックは無い（統合前の
    // `apps/poker-sync/src/adapters/ws-adapter.ts` も rateKey を入れて終わりだった）。
    // ⚠ **ルーレット（roulette）もこの分岐に足してはならない**（#94・spec §5.2。お題と同じ理由）。
    // ⚠ **お題（topic）をこの分岐に足してはならない**（#91・spec §5.3 の MUST）。
    // ここで return すると onConnect が呼ばれず、`rateLimitGate.open` が接続とクライアント鍵を
    // 結ばない。すると鍵は connId へ落ち、`ai.unlock` の総当たりが**張り直すだけで**
    // 枠を回避できる（2026-09-23 のレビューで見つかった）。
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

  /** pong 受信 = 生存確認（受理していない接続の pong は数えない）。 */
  private handlePong(ws: Socket): void {
    const { connId } = ws.data;
    if (connId === "") return;
    this.heartbeat.pong(connId);
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
    // `isPokerSocket` で絞り込む（`ws.data.protocol === "poker"` だけでは
    // `ws` 自体の型が絞り込めず、`handlePokerMessage` へ渡せない。docstring 参照）。
    if (isPokerSocket(ws)) {
      this.handlePokerMessage(ws, raw, bytes);
      return;
    }

    if (ws.data.protocol === "hub") {
      this.handleHubMessage(ws, raw, bytes);
      return;
    }

    if (ws.data.protocol === "topic") {
      this.handleTopicMessage(ws, raw, bytes);
      return;
    }

    if (ws.data.protocol === "roulette") {
      this.handleRouletteMessage(ws, raw, bytes);
      return;
    }

    if (bytes > this.options.maxMessageBytes) {
      this.sendFrame(ws, {
        type: "error",
        code: "MESSAGE_TOO_LARGE",
        message: CONNECTION_ERROR_TEXT.MESSAGE_TOO_LARGE,
      });
      return;
    }

    // 境界のパースは @tasuki/protocol に一本化してある（poker の sync / web も同じものを使う）。
    // 落ちた段（json / schema）で返すエラーコードを分けるのは timer 側の決めごと。
    const parsed = parseBoundaryMessage(CommandSchema, raw.toString());
    if (parsed.isErr()) {
      const code = boundaryErrorCode(parsed.error.stage);
      this.sendFrame(ws, { type: "error", code, message: CONNECTION_ERROR_TEXT[code] });
      return;
    }

    // 表示名の正規化（業務の検証）はここでは掛けない。アプリケーション層の受け口
    // （`application/timer-command-receiver.ts`）が掛ける（#368 Task 2）。

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
  private handlePokerMessage(ws: PokerSocket, raw: string | Buffer, bytes: number): void {
    try {
      if (bytes > this.options.maxMessageBytes) {
        // 接続は保つ（切断ではなくエラー応答）。再送で回復できる種類の失敗のため。
        this.options.poker.sendError(ws, "message-too-large", CONNECTION_ERROR_TEXT.MESSAGE_TOO_LARGE);
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
      message: TIMER_INTERNAL_ERROR_TEXT,
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
    sendIfOpen(ws, JSON.stringify(msg));
  }

  /**
   * ハブ（選択画面）のメッセージ層へ渡す（#95 S5a）。
   *
   * **境界のパースはメッセージ層が持つ**（`application/hub-handlers.ts` が
   * `HubCommandSchema` で検める）。ここはサイズ制限だけを掛ける —— 大きすぎるフレームを
   * パーサへ渡さないのは timer / poker と同じ規律である。
   *
   * **本体を `try/catch` で隔離する**（#91 PR 3 Task 5・`handleTopicMessage` と同じ形）。
   * `onHubMessage` は型上 `Promise<void>` を返す契約だが、実装が async でなければ
   * 同期的に throw しうる（型は実行時の保証にはならない。`.catch` は reject しか拾わない）。
   * 呼び出し自体を try/catch で囲んで別途隔離しないと、ここでの同期 throw が Bun の
   * websocket ハンドラを抜けて `uncaughtException` に達し、`server.ts` が
   * `process.exit(1)` して**同じプロセスに載る timer / poker / お題のルームも
   * 道連れで消える**（揮発インメモリ）。
   *
   * ⚠ 以前はここが `.catch()` だけで、同期 throw を隔離していなかった
   * （既知の差分として `handleTopicMessage` の docstring に記されていた）。
   */
  private handleHubMessage(ws: Socket, raw: string | Buffer, bytes: number): void {
    if (bytes > this.options.maxMessageBytes) {
      this.sendHubFrame(ws, {
        type: "error",
        code: "MESSAGE_TOO_LARGE",
        message: CONNECTION_ERROR_TEXT.MESSAGE_TOO_LARGE,
      });
      return;
    }
    try {
      void this.options.onHubMessage(ws.data.connId, raw.toString()).catch((err: unknown) => {
        this.options.logger.error("on-message-error", { name: classifyError(err) });
        this.sendHubFrame(ws, {
          type: "error",
          code: "INTERNAL_ERROR",
          message: CONNECTION_ERROR_TEXT.INTERNAL_ERROR,
        });
      });
    } catch (err) {
      this.options.logger.error("on-message-error", { name: classifyError(err) });
      this.sendHubFrame(ws, {
        type: "error",
        code: "INTERNAL_ERROR",
        message: CONNECTION_ERROR_TEXT.INTERNAL_ERROR,
      });
    }
  }

  /** ハブの接続へ 1 通送る（OPEN のときだけ）。 */
  private sendHubFrame(ws: Socket, msg: HubServerMsg): void {
    sendIfOpen(ws, JSON.stringify(msg));
  }

  /**
   * お題（topic）のメッセージ層へ渡す（#91）。
   *
   * 境界のパースはメッセージ層（Task 9 で配線するアプリ層）が持つ。ここはサイズ制限
   * だけを掛ける —— 大きすぎるフレームをパーサへ渡さないのは timer / poker / ハブと
   * 同じ規律である。
   *
   * **本体を `try/catch` で隔離する。** `onTopicMessage` は型上 `Promise<void>` を
   * 返す契約だが、実装が async でなければ同期的に throw しうる（型は実行時の保証には
   * ならない。`.catch` は reject しか拾わない）。呼び出し自体を try/catch で囲んで
   * 別途隔離する（timer の `handleMessage` / I-5 と同じ形）。隔離しないと、
   * ここでの同期 throw が Bun の websocket ハンドラを抜けて `uncaughtException` に
   * 達し、`server.ts` が `process.exit(1)` して**同じプロセスに載る timer / poker /
   * ハブのルームも道連れで消える**（揮発インメモリ）。
   *
   * `handleHubMessage` も同じ理由で同じ形の隔離を持つ（#91 PR 3 Task 5）。
   */
  private handleTopicMessage(ws: Socket, raw: string | Buffer, bytes: number): void {
    if (bytes > this.options.maxMessageBytes) {
      this.sendTopicFrame(ws, {
        type: "error",
        code: "MESSAGE_TOO_LARGE",
        message: CONNECTION_ERROR_TEXT.MESSAGE_TOO_LARGE,
      });
      return;
    }
    try {
      void this.options.onTopicMessage(ws.data.connId, raw.toString()).catch((err: unknown) => {
        this.options.logger.error("on-message-error", { name: classifyError(err) });
        this.sendTopicFrame(ws, {
          type: "error",
          code: "INTERNAL_ERROR",
          message: CONNECTION_ERROR_TEXT.INTERNAL_ERROR,
        });
      });
    } catch (err) {
      this.options.logger.error("on-message-error", { name: classifyError(err) });
      this.sendTopicFrame(ws, {
        type: "error",
        code: "INTERNAL_ERROR",
        message: CONNECTION_ERROR_TEXT.INTERNAL_ERROR,
      });
    }
  }

  /**
   * お題（topic）の接続へ 1 通送る（OPEN のときだけ）。
   *
   * **型は広い `TopicServerMsg` ではなく狭い `TopicOwnFrame` にする**（#91 R18）。
   * `TopicServerMsg` は `HubServerMsg` を合併しており、その `error` は `code: string`
   * （無制約）なので、`TOPIC_ERROR_CODES` に無いコードでも通ってしまう。この口は
   * アダプタが自分でエラーを組み立てて送る経路（サイズ超過・内部エラー）専用であり、
   * 契約に無いコードを型検査で弾く。
   */
  private sendTopicFrame(ws: Socket, msg: TopicOwnFrame): void {
    sendIfOpen(ws, JSON.stringify(msg));
  }

  /**
   * ルーレット（roulette）のメッセージ層へ渡す（#94）。
   *
   * 境界のパースはメッセージ層（`application/roulette-handlers.ts`）が持つ。ここはサイズ制限
   * だけを掛ける。**本体を `try/catch` で隔離する**（`handleTopicMessage` と同じ形・理由）:
   * 同期 throw が Bun の websocket ハンドラを抜けて `uncaughtException` に達すると、
   * `server.ts` が `process.exit(1)` して同じプロセスに載る他のツールのルームも道連れで消える
   * （揮発インメモリ）。
   */
  private handleRouletteMessage(ws: Socket, raw: string | Buffer, bytes: number): void {
    if (bytes > this.options.maxMessageBytes) {
      this.sendRouletteFrame(ws, {
        type: "error",
        code: "MESSAGE_TOO_LARGE",
        message: CONNECTION_ERROR_TEXT.MESSAGE_TOO_LARGE,
      });
      return;
    }
    try {
      void this.options.onRouletteMessage(ws.data.connId, raw.toString()).catch((err: unknown) => {
        this.options.logger.error("on-message-error", { name: classifyError(err) });
        this.sendRouletteFrame(ws, {
          type: "error",
          code: "INTERNAL_ERROR",
          message: CONNECTION_ERROR_TEXT.INTERNAL_ERROR,
        });
      });
    } catch (err) {
      this.options.logger.error("on-message-error", { name: classifyError(err) });
      this.sendRouletteFrame(ws, {
        type: "error",
        code: "INTERNAL_ERROR",
        message: CONNECTION_ERROR_TEXT.INTERNAL_ERROR,
      });
    }
  }

  /** ルーレットの接続へ 1 通送る（OPEN のときだけ）。型は狭い {@link RouletteOwnFrame}（`sendTopicFrame` と同じ理由）。 */
  private sendRouletteFrame(ws: Socket, msg: RouletteOwnFrame): void {
    sendIfOpen(ws, JSON.stringify(msg));
  }

  private handleClose(ws: Socket): void {
    const { connId } = ws.data;
    // Origin / 接続数で弾いた接続は受け入れていないので、切断も通知しない（ws 実装と同じ）。
    if (connId === "") return;
    this.connections.delete(connId);
    this.heartbeat.forget(connId);
    // `isPokerSocket` で絞り込む（`handlePokerMessage` と同じ理由。docstring 参照）。
    if (isPokerSocket(ws)) {
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
