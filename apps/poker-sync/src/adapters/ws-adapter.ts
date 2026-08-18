/**
 * WS アダプタ — `Bun.serve` と接続レジストリ。
 *
 * 境界: 受信テキスト → parseClientMessage（Valibot）→ ディスパッチ（憲法原則 IV）。
 * 検証を通した値だけをアプリケーション層へ渡し、生のフレームより手前の防御
 * （Origin・同時接続数・クライアント鍵・サイズ上限）はここで完結させる。
 *
 * **接続レジストリ（connections / missedPongs / connCounter）はここが持つ。**
 * ルーム保管（`RoomStore`）や配信先（`Broadcaster` の内側）とは別物で、
 * 数えるのは「受理済みの WS 接続」である。
 */
import { parseClientMessage } from '@tasuki/poker-core';
import { deriveClientKeySafely } from '../client-key-safety';
import type { PokerSyncConfig } from '../config';
import type { Handlers } from '../application/handlers';
import type { HeartbeatConnection } from '../application/heartbeat';

/**
 * 接続ごとの状態。join 後に participantId / roomId が入る。
 *
 * `connId` は Origin / 接続数の検査を通ってから採番するため、それまでは空文字。
 * 空のまま閉じた接続は「受け入れていない接続」なので、受信もルーム離脱も行わない。
 */
export interface ConnectionData {
  participantId: string | null;
  roomId: string | null;
  connId: string;
  origin: string;
  /** X-Forwarded-For から導いた鍵。特定できなければ null。 */
  clientKey: string | null;
  /** レート制限の鍵。`connId` と同じく、受理されるまでは空文字。 */
  rateKey: string;
}

type Ws = Bun.ServerWebSocket<ConnectionData>;

/** WS アダプタがユースケース側に求めるものだけ（残りのハンドラはここを通らない）。 */
export type WsAdapterHandlers = Pick<Handlers, 'dispatch' | 'detachFromCurrentRoom' | 'sendError'>;

export interface WsAdapterDeps {
  config: PokerSyncConfig;
  handlers: WsAdapterHandlers;
  /**
   * `X-Forwarded-For` からレート制限の鍵を導く。
   * **生の IP はこの関数の中だけに存在し、戻り値はハッシュ済みの不透明な文字列である**
   * （`docs/adr/0012` D3）。
   */
  deriveClientKey: (forwardedFor: string | undefined) => string | null;
}

export interface WsAdapter {
  /**
   * 実際に bind したポート。`PORT=0`（OS に空きポートを選ばせる）で起動したとき、
   * 接続先を知る唯一の経路である。
   */
  readonly port: number;
  /** 受理済みの接続。死活監視の対象（`application/heartbeat.ts`）。 */
  readonly connections: ReadonlyMap<string, HeartbeatConnection>;
  /** 接続ごとの pong 未受信回数。死活監視が読み書きする。 */
  readonly missedPongs: Map<string, number>;
  close(): Promise<void>;
}

export function createWsAdapter({ config, handlers, deriveClientKey }: WsAdapterDeps): WsAdapter {
  /** 受理済みの接続。同時接続数の上限と死活監視の対象になる（Issue #63） */
  const connections = new Map<string, Ws>();
  /** 接続ごとの「直近 ping 送信からの pong 未受信回数」 */
  const missedPongs = new Map<string, number>();
  let connCounter = 0;

  /**
   * 接続の受理判定（Issue #63）。
   *
   * **Origin と接続数の検査はハンドシェイクではなくここで行う。** upgrade を拒否すると
   * クライアントには「接続失敗」としか見えず、理由を表す close コード（1008 / 1013）が
   * 届かない。通してから閉じることで理由を伝えられる。
   */
  function handleOpen(ws: Ws): void {
    // クライアント鍵の検査は Origin より前に置く（どちらも 1008 で、reason でしか区別できない）。
    if (config.requireClientAddress && ws.data.clientKey === null) {
      // 列挙値だけを出す。生の IP・Origin の値・鍵・XFF の値は載せない（ADR 0012 D3）。
      console.log(JSON.stringify({ event: 'conn-rejected', reason: 'client-address' })); // log-hygiene:allow 列挙値のみ
      ws.close(1008, 'Client address required');
      return;
    }

    if (config.allowedOrigins.length > 0 && !config.allowedOrigins.includes(ws.data.origin)) {
      // 列挙値だけを出す（S-4）。Origin の値そのものは載せない（ADR 0012 D3）。
      // これが無いと、運用者は client-address 拒否と Origin 拒否を journal だけでは
      // 区別できず、Caddy 側の Origin ヘッダ転送が壊れても気づけない。
      console.log(JSON.stringify({ event: 'conn-rejected', reason: 'origin' })); // log-hygiene:allow 列挙値のみ
      ws.close(1008, 'Origin not allowed');
      return;
    }

    if (connections.size >= config.maxConnections) {
      ws.close(1013, 'Server connection limit reached');
      return;
    }

    const connId = `conn-${++connCounter}`;
    ws.data.connId = connId;
    ws.data.rateKey = ws.data.clientKey ?? connId;
    connections.set(connId, ws);
    missedPongs.set(connId, 0);
  }

  function handleClose(ws: Ws): void {
    // 検査で弾いた接続は受け入れていないので、ルーム離脱の処理も行わない
    if (ws.data.connId === '') return;
    connections.delete(ws.data.connId);
    missedPongs.delete(ws.data.connId);
    handlers.detachFromCurrentRoom(ws);
  }

  function handleMessage(ws: Ws, raw: string | Buffer): void {
    if (ws.data.connId === '') return; // 検査で弾いた接続からは受け取らない

    // サイズ制限は**バイト数で測る**。Bun はテキストフレームを string で渡してくるため、
    // `raw.length` だと日本語 1 文字が 1 と数えられ、制限が実質 1/3 に緩む。
    const bytes = typeof raw === 'string' ? Buffer.byteLength(raw) : raw.length;
    if (bytes > config.maxMessageBytes) {
      // 接続は保つ（切断ではなくエラー応答）。再送で回復できる種類の失敗のため。
      handlers.sendError(ws, 'message-too-large', 'メッセージが大きすぎます');
      return;
    }

    const result = parseClientMessage(String(raw));
    if (result.isErr()) {
      handlers.sendError(ws, result.error.code, result.error.message);
      return;
    }
    handlers.dispatch(ws, result.value);
  }

  const server = Bun.serve<ConnectionData, never>({
    port: config.port,
    hostname: config.host,
    fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname === '/ws') {
        const upgraded = srv.upgrade(req, {
          data: {
            participantId: null,
            roomId: null,
            connId: '',
            origin: req.headers.get('origin') ?? '',
            // **鍵はここで作る。** 生の IP をこの行より先へ持ち出さない（ADR 0012 D3）。
            // deriveClientKey 自体は try/catch なしで呼ばない（S-2）。throw すると
            // 例外メッセージ（XFF を含みうる）がそのまま stderr に出る（Bun 1.3.14 実測）。
            clientKey: deriveClientKeySafely(
              deriveClientKey,
              req.headers.get('x-forwarded-for') ?? undefined,
              (name) => {
                console.log(JSON.stringify({ event: 'derive-client-key-error', name })); // log-hygiene:allow 例外の分類のみ
              },
            ),
            rateKey: '',
          } satisfies ConnectionData,
        });
        if (upgraded) return undefined;
        return new Response('WebSocket upgrade failed', { status: 400 });
      }
      return new Response('Not Found', { status: 404 });
    },
    websocket: {
      // フレーム上限は**設定から導出して明示指定する**。
      //
      // 既定（16MB）のままにすると 2 つの問題がある。ひとつは、アプリの上限が 64KB でも
      // 1 フレームあたり 16MB を確保させられること。もうひとつは、運用者が
      // MAX_MESSAGE_BYTES を 16MB 以上にしたとき、超過フレームがプロトコル層で
      // 切られてしまい「エラー応答を返して接続は保つ」が成立しなくなること。
      //
      // maxFrameBytes はメッセージ上限の 2 倍なので、上限〜フレーム上限の帯域は
      // 自前で検出して message-too-large を返せる。それを超えるものは 1006 で切れる。
      maxPayloadLength: config.maxFrameBytes,
      open: handleOpen,
      message: handleMessage,
      close: handleClose,
      /** pong 受信 = 生存確認。欠落カウントを戻す（一時的な通信の揺れからの復帰） */
      pong(ws) {
        if (ws.data.connId === '') return;
        missedPongs.set(ws.data.connId, 0);
      },
    },
  });

  return {
    // Bun の型は unix ソケット起動も含むため `number | undefined`。このアダプタは
    // 常に TCP ポートで listen するので undefined にはならないが、型を守るため
    // 届かないポート 0 へ倒す（S-3）。
    port: server.port ?? 0,
    connections,
    missedPongs,
    close() {
      // `server.stop()` が返す Promise は、**サーバー側から閉じた接続が 1 つでもあると
      // 解決しない**（timer-sync 側で Bun 1.3.14 に対し実測）。Origin 拒否・接続数超過・
      // ハートビートの terminate はいずれもサーバー側からの close なので、待つと詰まる。
      // 一方 stop(true) の副作用（新規受付の停止・既存接続の切断・ポート解放）は
      // 同期的に効くため、待たない。
      void server.stop(true);
      return Promise.resolve();
    },
  };
}
