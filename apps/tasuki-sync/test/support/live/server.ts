/** 同期サーバーの起動と、そこへ繋いだクライアント群の管理。 */

import { createSyncServer, type SyncServer } from "../../../src/create-sync-server.js";
import { loadSyncConfig } from "../../../src/config.js";
import { POKER_WS_URL } from "../../poker/helpers";
import { openSocket } from "./connection";
import { LiveClient } from "./timer-client";
import { LivePokerClient } from "./poker-client";
import { LiveHubClient } from "./hub-client";
import { LiveTopicClient } from "./topic-client";
import { LiveRouletteClient } from "./roulette-client";
import { LiveAgendaClient } from "./agenda-client";
import { LiveCheckinClient } from "./checkin-client";

/** 起動中の同期サーバーと、そこへ繋いだクライアント群。 */
export class LiveSyncServer {
  private readonly clients: LiveClient[] = [];
  private readonly pokerClients: LivePokerClient[] = [];
  private readonly hubClients: LiveHubClient[] = [];
  private readonly topicClients: LiveTopicClient[] = [];
  private readonly rouletteClients: LiveRouletteClient[] = [];
  private readonly agendaClients: LiveAgendaClient[] = [];
  private readonly checkinClients: LiveCheckinClient[] = [];

  constructor(private readonly server: SyncServer) {}

  /** OS が実際に割り当てたポート。 */
  get port(): number {
    return this.server.wsAdapter.port;
  }

  /** サーバー内部のルーム保管（配信されない事実を確かめたいときだけ使う）。 */
  get store(): SyncServer["store"] {
    return this.server.store;
  }

  /** サーバー内部の timer の状態の保管（輪の中身を直接見たいときだけ使う）。 */
  get timers(): SyncServer["timers"] {
    return this.server.timers;
  }

  /**
   * そのルームに timer の状態があるか（#95 S5b）。
   *
   * **「まだ作られていない」ことは wire から観測できない**ので、保管を直接覗く。
   * 遅延生成（D8）が「ルーム作成時には作らない」ことを確かめるのに要る。
   */
  hasTimerState(code: string): boolean {
    return this.server.timers.get(code) !== undefined;
  }

  /** そのルームに poker のラウンドがあるか（#95 S5b。{@link hasTimerState} と同じ理由）。 */
  hasRound(code: string): boolean {
    return this.server.rounds.get(code) !== undefined;
  }

  /**
   * timer として新しい WebSocket 接続を開く。
   *
   * `headers` はハンドシェイク要求に足すヘッダ。`X-Forwarded-For` を渡せば、
   * 本番で Caddy が付ける状況（＝レート制限の鍵が IP から導かれる状況）を
   * 実ソケットで再現できる（設計正本 D5）。
   *
   * **入口は `/ws` の 1 本で、ツールはクエリ（`?tool=timer`）が宣言する**（#95 S5c）。
   */
  async connect(
    label = `client-${this.clients.length + 1}`,
    headers: Record<string, string> = {},
  ): Promise<LiveClient> {
    const ws = await openSocket(label, `ws://127.0.0.1:${this.port}/ws?tool=timer`, headers);
    const client = new LiveClient(label, ws);
    this.clients.push(client);
    return client;
  }

  /**
   * **poker として** 新しい WebSocket 接続を開く。
   *
   * timer 側の {@link connect} と同じ引数で、違うのはクエリの宣言だけである
   * （振り分けは接続 URL のクエリだけで決まる。`src/adapters/ws-adapter.ts` の
   * `protocolFromRequestUrl`）。`headers` に `X-Forwarded-For` を渡せば、
   * **timer の接続と同じクライアント鍵**を名乗らせられる（レート制限のバケツが
   * 1 本かどうかを見るのに要る）。
   */
  async connectPoker(
    label = `poker-${this.pokerClients.length + 1}`,
    headers: Record<string, string> = {},
  ): Promise<LivePokerClient> {
    const ws = await openSocket(label, `ws://127.0.0.1:${this.port}${POKER_WS_URL}`, headers);
    const client = new LivePokerClient(label, ws);
    this.pokerClients.push(client);
    return client;
  }

  /**
   * **ハブとして** 新しい WebSocket 接続を開く（#95 S5a）。
   *
   * `?tool=` を付けない接続はハブとして扱われる（`protocolFromRequestUrl`）。
   * `headers` に `X-Forwarded-For` を渡せば、timer / poker の接続と同じクライアント鍵を
   * 名乗らせられる（レート制限のバケツが 1 本かどうかを見るのに要る）。
   */
  async connectHub(
    label = `hub-${this.hubClients.length + 1}`,
    headers: Record<string, string> = {},
  ): Promise<LiveHubClient> {
    const ws = await openSocket(label, `ws://127.0.0.1:${this.port}/ws`, headers);
    const client = new LiveHubClient(label, ws);
    this.hubClients.push(client);
    return client;
  }

  /**
   * **お題として** 新しい WebSocket 接続を開く（#91）。
   *
   * {@link connectHub} と同じ引数で、違うのはクエリの宣言（`?tool=topic`）だけである。
   * `headers` に `X-Forwarded-For` を渡せば、他ツールの接続と同じクライアント鍵を
   * 名乗らせられる（`ai.unlock` のレート制限が `room.join` と同じバケツかを見るのに要る）。
   */
  async connectTopic(
    label = `topic-${this.topicClients.length + 1}`,
    headers: Record<string, string> = {},
  ): Promise<LiveTopicClient> {
    const ws = await openSocket(label, `ws://127.0.0.1:${this.port}/ws?tool=topic`, headers);
    const client = new LiveTopicClient(label, ws);
    this.topicClients.push(client);
    return client;
  }

  /**
   * **ルーレットとして** 新しい WebSocket 接続を開く（#94）。
   *
   * {@link connectTopic} と同じ引数で、違うのはクエリの宣言（`?tool=roulette`）だけである。
   */
  async connectRoulette(
    label = `roulette-${this.rouletteClients.length + 1}`,
    headers: Record<string, string> = {},
  ): Promise<LiveRouletteClient> {
    const ws = await openSocket(label, `ws://127.0.0.1:${this.port}/ws?tool=roulette`, headers);
    const client = new LiveRouletteClient(label, ws);
    this.rouletteClients.push(client);
    return client;
  }

  /** **進行タイマーとして**（`?tool=agenda`）新しい WebSocket 接続を開く（#429）。{@link connectRoulette} の写し。 */
  async connectAgenda(
    label = `agenda-${this.agendaClients.length + 1}`,
    headers: Record<string, string> = {},
  ): Promise<LiveAgendaClient> {
    const ws = await openSocket(label, `ws://127.0.0.1:${this.port}/ws?tool=agenda`, headers);
    const client = new LiveAgendaClient(label, ws);
    this.agendaClients.push(client);
    return client;
  }

  /** **チェックインとして**（`?tool=checkin`）新しい WebSocket 接続を開く（#406）。{@link connectAgenda} の写し。 */
  async connectCheckin(
    label = `checkin-${this.checkinClients.length + 1}`,
    headers: Record<string, string> = {},
  ): Promise<LiveCheckinClient> {
    const ws = await openSocket(label, `ws://127.0.0.1:${this.port}/ws?tool=checkin`, headers);
    const client = new LiveCheckinClient(label, ws);
    this.checkinClients.push(client);
    return client;
  }

  /**
   * 全クライアントを閉じ、サーバーを停止する（afterEach から呼ぶ）。
   *
   * 1 本の close が失敗しても、残りの client とサーバーの停止まで必ず進む。
   * 失敗があれば、最後にまとめて投げる。
   */
  async close(): Promise<void> {
    const all: Array<{ close(): Promise<void> }> = [
      ...this.clients,
      ...this.pokerClients,
      ...this.hubClients,
      ...this.topicClients,
      ...this.rouletteClients,
      ...this.agendaClients,
      ...this.checkinClients,
    ];
    this.clients.length = 0;
    this.pokerClients.length = 0;
    this.hubClients.length = 0;
    this.topicClients.length = 0;
    this.rouletteClients.length = 0;
    this.agendaClients.length = 0;
    this.checkinClients.length = 0;
    const failures: unknown[] = [];
    try {
      const results = await Promise.allSettled(all.map((client) => client.close()));
      for (const r of results) if (r.status === "rejected") failures.push(r.reason);
    } finally {
      try {
        await this.server.close();
      } catch (e) {
        failures.push(e);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, `live-sync-server: close に失敗（${failures.length} 件）`);
    }
  }
}

/**
 * `createSyncServer()` を `PORT=0` で起動する。
 *
 * @param env 追加の環境変数（`ALLOWED_ORIGINS` / `AI_UNLOCK_KEY` など）。
 *   `PORT` と `HOST` は既定を与えるが、明示すれば上書きできる。
 */
export function startLiveSyncServer(
  env: Record<string, string | undefined> = {},
): LiveSyncServer {
  const config = loadSyncConfig({ PORT: "0", HOST: "127.0.0.1", ...env });
  return new LiveSyncServer(createSyncServer(config));
}
