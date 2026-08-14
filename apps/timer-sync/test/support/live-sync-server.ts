/**
 * 実 WebSocket 越しにサーバーを叩くためのテストヘルパ（Issue #80）。
 *
 * ## なぜ要るか
 *
 * 業務ロジックのテスト（356 件）は `handlers.handleCommand()` を直接呼ぶ in-process 方式で、
 * 送信は `SpyBroadcaster`（送信を模したもの）で観測している。速く安定していて、
 * あれはあれで正しい。ただし **「WS アダプタ → handlers → broadcaster → 実ソケット」
 * の配線が本当に繋がっているか**と**利用者の画面に届く JSON の形**は、その方式では
 * 一切見ていない。onMessage の配線を外しても、送出メッセージの `type` を別名に変えても、
 * in-process のテストは緑のまま通る。
 *
 * ここは**その 1 層だけ**を受け持つ。ルールを網羅する場所ではない（それは既存 356 件の役目）。
 *
 * ## 配線は本番と同じものを通す
 *
 * サーバーの組み立ては `createSyncServer()`（`src/create-sync-server.ts`）に一本化してあり、
 * 本番の `server.ts` とこのヘルパは**同じ関数**を呼ぶ。テスト側で組み立てを書き写すと、
 * 写しが本番からずれた瞬間に配線の検査が死ぬ（テストは緑のまま本番だけ壊れる）。
 *
 * 設定も `loadSyncConfig()` を通す。`PORT=0`（OS に空きポートを選ばせる）が
 * config を素通りすることまで含めて実経路で確かめられる。
 *
 * ## 前提の構築と検証の失敗を区別する
 *
 * ルーム作成・参加といった前提の構築が失敗したときは `throw` する（`expect` は使わない）。
 * ヘルパのバグ／使い方の誤りと、テスト対象の検証失敗を取り違えないため（FR-096）。
 */

import { WebSocket } from "ws";
import { createSyncServer, type SyncServer } from "../../src/create-sync-server.js";
import { loadSyncConfig } from "../../src/config.js";
import type { Command, Room, ServerMsg } from "@tasuki/timer-core";

/** 待ちの既定タイムアウト（ms）。実 I/O を挟むので in-process より長く取る。 */
const DEFAULT_TIMEOUT_MS = 3_000;
/** 「これ以上は届かない」を確かめるときの観測時間（ms）。 */
const SILENCE_MS = 200;

/** 前提の構築（接続・ルーム作成など）に失敗したことを表すエラー。検証の失敗と区別する。 */
export class LiveSetupError extends Error {
  constructor(message: string) {
    super(`live-sync-server: ${message}`);
    this.name = "LiveSetupError";
  }
}

type MsgType = ServerMsg["type"];
type MsgOf<T extends MsgType> = Extract<ServerMsg, { type: T }>;

/**
 * 実 WebSocket クライアント 1 本。
 *
 * 届いたフレームは**生のテキスト**（`rawFrames`）と**パース済みの値**（`received`）の
 * 両方で保持する。「JSON の形そのもの」を見たいときは前者を使う。
 */
export class LiveClient {
  /** 届いたフレームの生テキスト（順序つき）。 */
  readonly rawFrames: string[] = [];
  /** 届いたフレームをパースした値（順序つき）。 */
  readonly received: ServerMsg[] = [];
  /** `take` が読み進めた位置。ここより手前は消費済み。 */
  private cursor = 0;
  private waiters: Array<() => void> = [];

  constructor(
    /** デバッグ用の名前（タイムアウト時のメッセージに出す）。 */
    readonly label: string,
    private readonly ws: WebSocket,
  ) {
    ws.on("message", (raw: Buffer) => {
      const text = raw.toString();
      this.rawFrames.push(text);
      this.received.push(JSON.parse(text) as ServerMsg);
      for (const notify of this.waiters) notify();
      this.waiters = [];
    });
  }

  /** 妥当なコマンドを送る（型で守られている経路）。 */
  send(cmd: Command): void {
    this.ws.send(JSON.stringify(cmd));
  }

  /** 生のテキストを送る（不正 JSON・スキーマ違反を試すための経路）。 */
  sendRaw(text: string): void {
    this.ws.send(text);
  }

  /**
   * 未読の中から条件に合う最初のメッセージを 1 件取り出す。
   * 取り出した位置まで読み進めるので、同じ `take` を続けて呼べば次の 1 件が返る。
   */
  async take<T extends MsgType>(
    type: T,
    predicate?: (msg: MsgOf<T>) => boolean,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<MsgOf<T>> {
    const match = (msg: ServerMsg): msg is MsgOf<T> =>
      msg.type === type && (predicate === undefined || predicate(msg as MsgOf<T>));
    return (await this.takeMatching(match, `type=${type}`, timeoutMs)) as MsgOf<T>;
  }

  /** 型を問わず、未読の中から条件に合う最初のメッセージを取り出す。 */
  async takeMatching(
    predicate: (msg: ServerMsg) => boolean,
    label: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<ServerMsg> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      while (this.cursor < this.received.length) {
        const msg = this.received[this.cursor]!;
        this.cursor += 1;
        if (predicate(msg)) return msg;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new LiveSetupError(
          `${this.label}: ${label} を待ったが届かなかった（受信: ${this.summary()}）`,
        );
      }
      await this.waitForFrame(remaining);
    }
  }

  /**
   * 受信履歴が条件を満たすまで待つ。
   * 「最終的にこの状態が配信される」を見るときに使う（`take` と違い履歴を消費しない）。
   */
  async until(
    predicate: (received: ServerMsg[]) => boolean,
    label: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (predicate(this.received)) return;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new LiveSetupError(
          `${this.label}: ${label} にならなかった（受信: ${this.summary()}）`,
        );
      }
      await this.waitForFrame(remaining);
    }
  }

  /** 直近に届いた snapshot のルーム。1 度も届いていなければ throw する。 */
  latestRoom(): Room {
    for (let i = this.received.length - 1; i >= 0; i--) {
      const msg = this.received[i]!;
      if (msg.type === "snapshot") return msg.room;
    }
    throw new LiveSetupError(`${this.label}: snapshot が 1 度も届いていない`);
  }

  /** 条件に合う受信メッセージをすべて返す（履歴は消費しない）。 */
  all<T extends MsgType>(type: T): Array<MsgOf<T>> {
    return this.received.filter((m): m is MsgOf<T> => m.type === type);
  }

  /** これ以上メッセージが届かないことを確かめる（未読が増えないこと）。 */
  async expectSilence(ms = SILENCE_MS): Promise<void> {
    const before = this.received.length;
    await Bun.sleep(ms);
    if (this.received.length !== before) {
      const extra = this.received.slice(before).map((m) => m.type);
      throw new LiveSetupError(`${this.label}: 届かないはずのメッセージが来た（${extra.join(", ")}）`);
    }
  }

  /** ソケットを閉じ、サーバー側が close を処理し終えるのを待つ。 */
  async close(): Promise<void> {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    const closed = new Promise<void>((resolve) => this.ws.once("close", () => resolve()));
    this.ws.close();
    await closed;
  }

  private summary(): string {
    return this.received.map((m) => m.type).join(", ") || "（なし）";
  }

  private waitForFrame(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      this.waiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

/** 起動中の同期サーバーと、そこへ繋いだクライアント群。 */
export class LiveSyncServer {
  private readonly clients: LiveClient[] = [];

  constructor(private readonly server: SyncServer) {}

  /** OS が実際に割り当てたポート。 */
  get port(): number {
    return this.server.wsAdapter.port;
  }

  /** サーバー内部のルーム保管（配信されない事実を確かめたいときだけ使う）。 */
  get store(): SyncServer["store"] {
    return this.server.store;
  }

  /**
   * 新しい WebSocket 接続を開く。
   *
   * `headers` はハンドシェイク要求に足すヘッダ。`X-Forwarded-For` を渡せば、
   * 本番で Caddy が付ける状況（＝レート制限の鍵が IP から導かれる状況）を
   * 実ソケットで再現できる（設計正本 D5）。
   */
  async connect(
    label = `client-${this.clients.length + 1}`,
    headers: Record<string, string> = {},
  ): Promise<LiveClient> {
    const ws = new WebSocket(`ws://127.0.0.1:${this.port}`, { headers });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", (e) => reject(new LiveSetupError(`${label} の接続に失敗: ${e.message}`)));
    });
    const client = new LiveClient(label, ws);
    this.clients.push(client);
    return client;
  }

  /** 全クライアントを閉じ、サーバーを停止する（afterEach から呼ぶ）。 */
  async close(): Promise<void> {
    for (const client of this.clients) await client.close();
    this.clients.length = 0;
    await this.server.close();
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

/** 実 WS 越しにルームを作る。エラーが返ったら throw する（前提の構築の失敗）。 */
export async function createRoom(
  client: LiveClient,
  displayName: string,
  extra: Omit<Extract<Command, { command: "room.create" }>, "command" | "displayName"> = {},
): Promise<MsgOf<"room.created">> {
  client.send({ command: "room.create", displayName, ...extra });
  const msg = await client.takeMatching(
    (m) => m.type === "room.created" || m.type === "error",
    "room.created",
  );
  if (msg.type !== "room.created") {
    throw new LiveSetupError(`room.create("${displayName}") が ${msg.code} で失敗した`);
  }
  return msg;
}

/** 実 WS 越しにルームへ参加する。エラーが返ったら throw する（前提の構築の失敗）。 */
export async function joinRoom(
  client: LiveClient,
  code: string,
  displayName: string,
  extra: { passphrase?: string; hasAiKey?: boolean } = {},
): Promise<MsgOf<"room.joined">> {
  client.send({
    command: "room.join",
    code,
    displayName,
    hasAiKey: extra.hasAiKey ?? false,
    ...(extra.passphrase !== undefined ? { passphrase: extra.passphrase } : {}),
  });
  const msg = await client.takeMatching(
    (m) => m.type === "room.joined" || m.type === "error",
    "room.joined",
  );
  if (msg.type !== "room.joined") {
    throw new LiveSetupError(`room.join("${displayName}") が ${msg.code} で失敗した`);
  }
  return msg;
}

/**
 * 参加者をローテーションへ加える（`member.add`）。反映済みの snapshot を待つ。
 *
 * ⚠ **未読の先頭から探す（`until` ではなく `takeMatching` を使う）。** 履歴全体を見ると、
 * 送信より前に届いていた snapshot が条件を満たしてしまい、コマンドが
 * `DuplicateName` で弾かれていても素通りする。実際、ルーム作成者は
 * `room.create` の時点で既にローテーションに並んでいる（room-create.ts）ため、
 * 作成者に対する `member.add` は常に失敗する。エラーは throw して気づけるようにする。
 */
export async function addToRotation(client: LiveClient, participantId: string): Promise<void> {
  client.send({ command: "member.add", participantId });
  const msg = await client.takeMatching(
    (m) =>
      m.type === "error" ||
      (m.type === "snapshot" && m.room.session.rotation.includes(participantId)),
    `member.add(${participantId}) の反映`,
  );
  if (msg.type === "error") {
    throw new LiveSetupError(`member.add(${participantId}) が ${msg.code} で失敗した`);
  }
}
