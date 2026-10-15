/**
 * WS アダプタ — 薄い WebSocket 抽象層
 * T040: FR-013, NFRセキュリティ(S2/S3)
 *
 * 実装は `Bun.serve`（S5・#20）。
 * 外から見える振る舞い（close コード・エラーコード・426）は ws 実装のときと同じ。
 *
 * ## 5 つのメッセージ層を 1 本の待ち受けで捌く（#95 S2・S5a・S5c・D9 / D10・#91・#94）
 *
 * timer と poker の同期サーバーを 1 プロセスへ統合した（のちに #91 でお題、#94 でルーレットも
 * 同じプロセスへ加わった）。`Bun.serve` は 1 プロセスに 1 つの `websocket` ハンドラしか
 * 持てないため、**接続層はここに 1 つだけ**置き、**メッセージ層だけをプロトコルごとに分ける**。
 *
 * | 層 | 何を持つか | 統合の影響 |
 * |---|---|---|
 * | 接続層（このクラス） | Origin 検査・クライアント鍵・接続数上限・connId 採番・死活監視・フレーム上限 | **1 つになる**（接続数上限は D22 で値を決め直した） |
 * | メッセージ層 | パース・ディスパッチ・接続ごとのアプリ状態 | **プロトコルごとに分かれたまま** |
 *
 * **振り分けは接続 URL のクエリ（`?tool=`）だけで決める**（`ws/connection-gate.ts` の
 * `protocolFromRequestUrl`）。入口は `/ws` の 1 本だけである（#95 S5c・#249 Task 5）。
 *
 * ## 部品（#368 で責務ごとに分けた）
 *
 * このクラスは `Bun.serve` と受理済みの接続の表を持ち、次の部品を束ねる。
 *
 * | 部品 | 持つもの |
 * |---|---|
 * | `ws/http-fallback.ts` | 管理用の経路・ヘッダの許可表・426 |
 * | `ws/connection-gate.ts` | `?tool=` の判定・入場の判定（順番も） |
 * | `ws/heartbeat.ts` | ping/pong と欠落の数え上げ |
 * | `ws/tool-channel.ts` | ツールごとの受け口（大きさの上限・解析・渡す先・失敗の隔離とエラーフレーム） |
 * | `ws/ws-send.ts` | OPEN のときだけ送る |
 * | `ws/error-log.ts` | ログへ出す例外の分類 |
 * | `ws/connection-data.ts` | 接続ごとに持ち回る値 |
 *
 * **新しいツールを足すときは、受け口の定義（{@link buildChannels} の表の 1 行）と
 * `?tool=` の許可リストを足す。**
 */

import { ok, type Result } from "neverthrow";
import { CommandSchema } from "@tasuki/timer-core";
import type { Command, ServerMsg } from "@tasuki/timer-core";
import { parseBoundaryMessage } from "@tasuki/protocol";
import type { HubServerMsg } from "@tasuki/room-core";
import type { Logger } from "../application/log/logger.js";
import type { TimerCommandReceiver } from "../application/timer-command-receiver.js";
// 接続層が自分で返す文言の正本（#362）。**コードごとに 1 つだけ**にする（SC-035）。
import {
  boundaryErrorCode,
  connectionErrorFrame,
} from "../application/connection-errors.js";
import { deriveClientKeySafely } from "./client-key-safety.js";
import { initialConnectionData, type ConnectionData, type Socket } from "./ws/connection-data.js";
import { admit, protocolFromRequestUrl, type AcceptedProtocol } from "./ws/connection-gate.js";
import { classifyError, errorName } from "./ws/error-log.js";
import { Heartbeat } from "./ws/heartbeat.js";
import { respondToPlainHttp, type HttpHandler } from "./ws/http-fallback.js";
import {
  createPokerChannel,
  createTextChannel,
  type PokerMessageHandlers,
  type ToolChannel,
} from "./ws/tool-channel.js";
import { sendIfOpen, sendToEach } from "./ws/ws-send.js";
import type { RouletteOwnFrame, RouletteServerMsg } from "../ports/roulette-server-msg.js";
import type { TopicOwnFrame, TopicServerMsg } from "../ports/topic-server-msg.js";

export type { PokerMessageHandlers } from "./ws/tool-channel.js";

/**
 * 生テキストを受けるメッセージ層（ハブ・お題・ルーレット）。
 *
 * **パース前の文字列を渡す。** 境界の検証はメッセージ層（`application/{hub,topic,roulette}-handlers.ts`）に
 * 置き、接続層は経路とサイズだけを見る。
 */
export interface RawMessageHandler {
  handleMessage(connId: string, raw: string): Promise<void>;
}

export interface WsAdapterOptions {
  port: number;
  host?: string;
  /** 同時接続数の上限。超過分は 1013 で拒否する。 */
  maxConnections?: number;
  allowedOrigins: string[];
  /**
   * timer（`?tool=timer`）のメッセージ層。**接続層で境界の検証（`CommandSchema`）を済ませた値**を、
   * 型（`Command`）のまま渡す（#363）。表示名の正規化は受け口（`application/timer-command-receiver.ts`）が
   * 掛ける（#368）。**型を {@link TimerCommandReceiver} にしてあるのは、正規化を通さない配線を型検査で
   * 落とすため**（正規化を接続層から移しても、どの入口も正規化を飛ばせないことを保つ）。
   */
  timer: TimerCommandReceiver;
  /** ハブ（選択画面。`?tool=` 無し）のメッセージ層（#95 S5a）。 */
  hub: RawMessageHandler;
  /** お題（`?tool=topic`）のメッセージ層（#91）。 */
  topic: RawMessageHandler;
  /** ルーレット（`?tool=roulette`）のメッセージ層（#94）。 */
  roulette: RawMessageHandler;
  /**
   * poker（`?tool=poker`）のメッセージ層。**ほかのツールと形が違う**: 接続そのもの（接続ごとの
   * 参加者・ルーム）を渡し、受理を `onConnect` へ知らせず、切断の後始末を自分で持つ。
   */
  poker: PokerMessageHandlers;
  /**
   * 接続が閉じたときに呼ばれる（入場の判定で弾いた接続と、poker の接続は除く。
   * 弾いた接続は「受け入れていない接続」なのでアプリ層へ通知しない）。
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
   * 接続が受理された（入場の判定を通った）ときに 1 度だけ呼ばれる（poker の接続は除く）。
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
}

/**
 * 待ち受けを起こせなかった（bind の失敗。EADDRINUSE 等）。回復できないので、受けた組み立て
 * （`server.ts`）がプロセスを終える（#368 Task 8。以前はアダプタが自分で `process.exit(1)` していた）。
 * 原因の例外は `cause` に持つ。ログ（`http-server-error`）はアダプタが投げる前に 1 行残す。
 */
export class ServerStartError extends Error {
  override readonly name = "ServerStartError";
}

/**
 * timer の境界のパース。@tasuki/protocol に一本化してある（poker の sync / web も同じものを使う）。
 * 落ちた段（json / schema）で返すエラーコードを分けるのは timer 側の決めごと。
 */
function parseTimerCommand(text: string): Result<Command, ServerMsg> {
  return parseBoundaryMessage(CommandSchema, text).mapErr((error): ServerMsg => connectionErrorFrame(boundaryErrorCode(error.stage)));
}

/**
 * 「プロトコル → 受け口」の表（#368 Task 7）。**新しいツールはここに 1 行足す。**
 *
 * timer・ハブ・お題・ルーレットは、超過・内部エラーのフレーム（文言も）もログも同じ（#381 でそろえた。
 * 文は `connectionErrorFrame`、ログは `createTextChannel` が 1 か所で決める）。**返し方が違うのは poker だけ**
 * （エラーコードがケバブ記法で、内部エラーは 1011 で閉じる。wire に載る値なので、片方へ寄せると相手の web が
 * 知らないコードを受け取る）。
 */
function buildChannels(options: WsAdapterOptions): Readonly<Record<AcceptedProtocol, ToolChannel>> {
  const { maxMessageBytes, logger } = options;
  /**
   * 生テキストを渡すツール（ハブ・お題・ルーレット）の受け口。違いはエラーフレームの型だけで、
   * フレームは行ごとに渡す（キャストせず、その行の型で検査させる）。
   */
  const rawTextChannel = <Frame>(protocol: AcceptedProtocol, handler: RawMessageHandler, frames: { tooLarge: Frame; internalError: Frame }): ToolChannel =>
    createTextChannel<string, Frame>({
      maxMessageBytes,
      logger,
      protocol,
      parse: (text) => ok(text),
      deliver: (connId, raw) => handler.handleMessage(connId, raw),
      tooLargeFrame: frames.tooLarge,
      internalErrorFrame: frames.internalError,
    });
  const frames = {
    tooLarge: connectionErrorFrame("MESSAGE_TOO_LARGE"),
    internalError: connectionErrorFrame("INTERNAL_ERROR"),
  };
  // 各行は鍵から `protocol` を受け取る（鍵と `protocol` の文字列を二重に持たない）
  return channelsByKey({
    timer: (protocol) =>
      createTextChannel<Command, ServerMsg>({
        maxMessageBytes,
        logger,
        protocol,
        parse: parseTimerCommand,
        deliver: (connId, cmd) => options.timer.handleMessage(connId, cmd),
        tooLargeFrame: frames.tooLarge,
        internalErrorFrame: frames.internalError,
      }),
    hub: (protocol) => rawTextChannel<HubServerMsg>(protocol, options.hub, frames),
    // エラーフレームの型は広い `TopicServerMsg` ではなく狭い `TopicOwnFrame`（#91 R18）。
    // `TopicServerMsg` は `HubServerMsg` を合併しており、その `error` は `code: string`（無制約）なので、
    // 契約に無いコードでも通ってしまう。ルーレットも同じ理由で `RouletteOwnFrame`。
    topic: (protocol) => rawTextChannel<TopicOwnFrame>(protocol, options.topic, frames),
    roulette: (protocol) => rawTextChannel<RouletteOwnFrame>(protocol, options.roulette, frames),
    poker: (protocol) => createPokerChannel(protocol, options.poker, maxMessageBytes, logger),
  });
}

/** 行（鍵 → 受け口の作り方）から表を作る。各行へ自分の鍵を渡す。 */
function channelsByKey(rows: { [K in AcceptedProtocol]: (protocol: K) => ToolChannel }): Readonly<Record<AcceptedProtocol, ToolChannel>> {
  const channels: Partial<Record<AcceptedProtocol, ToolChannel>> = {};
  for (const key of Object.keys(rows) as AcceptedProtocol[]) channels[key] = (rows[key] as (protocol: AcceptedProtocol) => ToolChannel)(key);
  return channels as Record<AcceptedProtocol, ToolChannel>;
}

export class WsAdapter {
  private readonly server: Bun.Server<ConnectionData>;
  private readonly connections = new Map<string, Socket>();
  private connCounter = 0;
  /** 「プロトコル → 受け口」の表。 */
  private readonly channels: Readonly<Record<AcceptedProtocol, ToolChannel>>;
  /** 死活監視（Issue #25）。受理済みの接続の表を読む。 */
  private readonly heartbeat: Heartbeat;

  constructor(private readonly options: WsAdapterOptions) {
    this.channels = buildChannels(options);
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
      // 起動時の bind 失敗（EADDRINUSE 等）は回復不能。ログを 1 行残して投げ、終えるのは組み立て
      // （`server.ts`）に任せる（#368 Task 8）。未処理例外の経路（`uncaught`）には乗せない。
      this.options.logger.error("http-server-error", { name: classifyError(err) });
      throw new ServerStartError("待ち受けを起こせませんでした", { cause: err });
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
    const data = initialConnectionData(protocol, origin, clientKey);
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
        this.options.logger.error("derive-client-key-error", { name: errorName(name) });
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
    // `ws.data.rateKey` から直接読む**（ほかのツールは下の onConnect で受け取る）。
    // 値そのものはどのプロトコルでも同じ（クライアント鍵、特定できなければ connId）。
    ws.data.rateKey = ws.data.clientKey ?? connId;
    this.connections.set(connId, ws);
    this.heartbeat.track(connId);
    // 受理を知らせない受け口は poker だけ（`ToolChannel.notifiesConnect` の docstring）。
    if (!this.channelOf(ws)?.notifiesConnect) return;
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

  /** 接続のプロトコルの受け口。`"unknown"` は受理されないので受け口を持たない。 */
  private channelOf(ws: Socket): ToolChannel | undefined {
    const { protocol } = ws.data;
    return protocol === "unknown" ? undefined : this.channels[protocol];
  }

  private handleMessage(ws: Socket, raw: string | Buffer): void {
    if (ws.data.connId === "") return; // 検査で弾いた接続からは受け取らない

    // サイズ制限（S3）。**バイト数で測る**。Bun はテキストフレームを string で
    // 渡してくるため、`raw.length` だと日本語 1 文字が 1 と数えられ、
    // ws 実装（Buffer.length）より制限が緩くなってしまう。
    const bytes = typeof raw === "string" ? Buffer.byteLength(raw) : raw.length;

    this.channelOf(ws)?.receive(ws, raw, bytes);
  }

  private handleClose(ws: Socket): void {
    const { connId } = ws.data;
    // 入場の判定で弾いた接続は受け入れていないので、切断も通知しない（ws 実装と同じ）。
    if (connId === "") return;
    this.connections.delete(connId);
    this.heartbeat.forget(connId);
    // 後始末を受け口が自分で持つ（poker）なら、そちらだけを呼ぶ。
    // 隔離の理由は onDisconnect と同じ（コールバックの失敗でプロセス全体を落とさない）。
    const channel = this.channelOf(ws);
    if (channel?.closed !== undefined) {
      try {
        channel.closed(ws);
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
