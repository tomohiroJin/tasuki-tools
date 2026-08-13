// Bun + WebSocket 同期サーバー
// 境界: 受信テキスト → parseClientMessage（Valibot）→ ディスパッチ（憲法原則 IV）
import type { Result } from 'neverthrow';
import {
  applyAutoReveal,
  castVote,
  createRoom,
  findParticipantByToken,
  joinRoom,
  markConnected,
  markDisconnected,
  nextRound,
  parseClientMessage,
  revealBy,
  type ClientMessage,
  type ErrorCode,
  type Room,
  type RoundError,
} from '@tasuki/poker-core';
import {
  broadcast,
  dropIfEmpty,
  generateRoomId,
  getRoom,
  putRoom,
  roomCount,
  type RoomEntry,
} from './rooms';
import { loadPokerSyncConfig } from './config';

const config = loadPokerSyncConfig(process.env);

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
}

/** 受理済みの接続。同時接続数の上限と死活監視の対象になる（Issue #63） */
const connections = new Map<string, Ws>();
/** 接続ごとの「直近 ping 送信からの pong 未受信回数」 */
const missedPongs = new Map<string, number>();
let connCounter = 0;

type Ws = Bun.ServerWebSocket<ConnectionData>;

function sendError(ws: Ws, code: ErrorCode, message: string): void {
  ws.send(JSON.stringify({ type: 'error', code, message }));
}

function sendJoined(ws: Ws, roomId: string, participantId: string, token: string): void {
  // token は本人宛の joined でのみ配信する（契約）
  ws.send(JSON.stringify({ type: 'joined', roomId, participantId, token }));
}

function newIds(): { participantId: string; token: string } {
  return { participantId: crypto.randomUUID(), token: crypto.randomUUID() };
}

/**
 * 接続を現在のルームから切り離す共通処理（close と再 join/再 create で共用）。
 * connected 更新・ホスト繰上（FR-012）・自動公開の再評価（US4-AS1）・
 * 接続数 0 での即時破棄（FR-014）をここで一元的に行う。
 */
function detachFromCurrentRoom(ws: Ws): void {
  const { participantId, roomId } = ws.data;
  ws.data.participantId = null;
  ws.data.roomId = null;
  if (participantId === null || roomId === null) return;
  const entry = getRoom(roomId);
  if (!entry) return;
  // 同一参加者が別ソケットで再接続済みなら（socket が入れ替わっていたら）何もしない
  if (entry.sockets.get(participantId) !== ws) return;
  entry.sockets.delete(participantId);

  if (entry.sockets.size === 0) {
    dropIfEmpty(roomId);
    return;
  }

  entry.room = applyAutoReveal(markDisconnected(entry.room, participantId));
  broadcast(entry);
}

/**
 * join 成功の完了処理（create / token 復帰 / 新規 join の3経路で共用）。
 * 順序に不変条件がある: socket 登録 → 接続状態の更新 → joined 送信 → 全員へ配信
 */
function completeJoin(ws: Ws, entry: RoomEntry, participantId: string, token: string): void {
  entry.sockets.set(participantId, ws);
  ws.data.participantId = participantId;
  ws.data.roomId = entry.room.id;
  sendJoined(ws, entry.room.id, participantId, token);
  broadcast(entry);
}

function handleCreateRoom(ws: Ws, msg: Extract<ClientMessage, { type: 'create-room' }>): void {
  // ルーム数の上限（Issue #63）。**切り離しより先に判定する**。
  // 先に離脱させてしまうと、拒否されたときに元のルームから追い出されたままになる。
  // 上限が止めるのは新規作成だけで、既存ルームへの参加は妨げない。
  if (roomCount() >= config.maxRooms) {
    sendError(ws, 'server-busy', 'ルームの上限に達しています。しばらくしてからお試しください');
    return;
  }

  // すでに別ルームに参加中のソケット（二重送信・SPA 遷移）は先に切り離す
  detachFromCurrentRoom(ws);
  const ids = newIds();
  const result = createRoom(generateRoomId(), msg.name, ids);
  if (result.isErr()) {
    sendError(ws, 'invalid-message', result.error.message);
    return;
  }
  const { room, participant } = result.value;
  const entry: RoomEntry = { room, sockets: new Map() };
  putRoom(entry);
  completeJoin(ws, entry, participant.id, ids.token);
}

function handleJoinRoom(ws: Ws, msg: Extract<ClientMessage, { type: 'join-room' }>): void {
  const entry = getRoom(msg.roomId);
  if (!entry) {
    sendError(ws, 'room-not-found', 'ルームが見つかりません');
    return;
  }

  // 参加先の存在を確認してから、参加中の別ルームを切り離す（二重送信・SPA 遷移対策）
  detachFromCurrentRoom(ws);

  // token 照合による同一参加者の復帰（FR-013）。一致すれば name は無視する
  const existing = msg.token !== undefined ? findParticipantByToken(entry.room, msg.token) : undefined;
  if (existing) {
    entry.room = markConnected(entry.room, existing.id);
    completeJoin(ws, entry, existing.id, existing.token);
    return;
  }

  const ids = newIds();
  const result = joinRoom(entry.room, msg.name, ids);
  if (result.isErr()) {
    sendError(ws, 'invalid-message', result.error.message);
    return;
  }
  entry.room = result.value.room;
  completeJoin(ws, entry, result.value.participant.id, ids.token);
}

/**
 * ルームの生死だけを返す（#76 J-1）。
 *
 * **無いときだけ応える。** 生存を伝える新しいメッセージは足さない。
 * 画面は「参加フォームを出しておき、無いと分かったらエラー表示へ切り替える」形で、
 * 無音＝生きているとして扱えば足りるため。
 *
 * 読み取りだけなので `detachFromCurrentRoom` は呼ばない。呼ぶと、参加中の人が
 * 別の招待リンクの生死を尋ねただけで自分のルームから外れてしまう。
 */
function handleCheckRoom(ws: Ws, msg: Extract<ClientMessage, { type: 'check-room' }>): void {
  if (!getRoom(msg.roomId)) {
    sendError(ws, 'room-not-found', 'ルームが見つかりません');
  }
}

/**
 * join 済み接続によるルーム状態変更の単一コミットポイント。
 * not-joined 検査 → ドメイン操作 → エラー応答/状態反映 → 自動公開の再評価（FR-008）→ 配信
 * をここで一元的に行う。新しい操作の追加はドメイン関数を渡すだけでよい
 */
function commitRoomAction(
  ws: Ws,
  action: (room: Room, participantId: string) => Result<Room, RoundError>,
): void {
  const { participantId, roomId } = ws.data;
  if (participantId === null || roomId === null) {
    sendError(ws, 'not-joined', 'ルームに参加していません');
    return;
  }
  const entry = getRoom(roomId);
  if (!entry) return;
  const result = action(entry.room, participantId);
  if (result.isErr()) {
    sendError(ws, result.error.code, result.error.message);
    return;
  }
  entry.room = applyAutoReveal(result.value);
  broadcast(entry);
}

function dispatch(ws: Ws, msg: ClientMessage): void {
  switch (msg.type) {
    case 'create-room':
      handleCreateRoom(ws, msg);
      return;
    case 'join-room':
      handleJoinRoom(ws, msg);
      return;
    case 'check-room':
      handleCheckRoom(ws, msg);
      return;
    case 'vote':
      commitRoomAction(ws, (room, participantId) => castVote(room, participantId, msg.card));
      return;
    case 'reveal':
      commitRoomAction(ws, revealBy);
      return;
    case 'next-round':
      commitRoomAction(ws, nextRound);
      return;
  }
}

/**
 * 接続の受理判定（Issue #63）。
 *
 * **Origin と接続数の検査はハンドシェイクではなくここで行う。** upgrade を拒否すると
 * クライアントには「接続失敗」としか見えず、理由を表す close コード（1008 / 1013）が
 * 届かない。通してから閉じることで理由を伝えられる。
 */
function handleOpen(ws: Ws): void {
  if (config.allowedOrigins.length > 0 && !config.allowedOrigins.includes(ws.data.origin)) {
    ws.close(1008, 'Origin not allowed');
    return;
  }

  if (connections.size >= config.maxConnections) {
    ws.close(1013, 'Server connection limit reached');
    return;
  }

  const connId = `conn-${++connCounter}`;
  ws.data.connId = connId;
  connections.set(connId, ws);
  missedPongs.set(connId, 0);
}

function handleClose(ws: Ws): void {
  // 検査で弾いた接続は受け入れていないので、ルーム離脱の処理も行わない
  if (ws.data.connId === '') return;
  connections.delete(ws.data.connId);
  missedPongs.delete(ws.data.connId);
  detachFromCurrentRoom(ws);
}

function handleMessage(ws: Ws, raw: string | Buffer): void {
  if (ws.data.connId === '') return; // 検査で弾いた接続からは受け取らない

  // サイズ制限は**バイト数で測る**。Bun はテキストフレームを string で渡してくるため、
  // `raw.length` だと日本語 1 文字が 1 と数えられ、制限が実質 1/3 に緩む。
  const bytes = typeof raw === 'string' ? Buffer.byteLength(raw) : raw.length;
  if (bytes > config.maxMessageBytes) {
    // 接続は保つ（切断ではなくエラー応答）。再送で回復できる種類の失敗のため。
    sendError(ws, 'message-too-large', 'メッセージが大きすぎます');
    return;
  }

  const result = parseClientMessage(String(raw));
  if (result.isErr()) {
    sendError(ws, result.error.code, result.error.message);
    return;
  }
  dispatch(ws, result.value);
}

/**
 * サーバー主導の死活監視（Issue #63。timer の #25 と同じ設計）。
 *
 * 一定間隔で各接続へ ping を送り、前回の送信から pong が返っていなければ欠落を数える。
 * 閾値に達した接続は terminate し、あとの処理は通常の close 経路
 * （参加者の disconnected 化・ホスト繰上・自動公開の再評価）に委ねる。
 *
 * 半開き接続（TCP は生きているが相手が応答しない）は close イベントが発生しないため、
 * これが無いと参加者は connected のまま残り続ける。
 */
function startHeartbeat(): void {
  const timer = setInterval(() => {
    for (const [connId, ws] of connections) {
      const missed = missedPongs.get(connId) ?? 0;
      if (missed >= config.heartbeatMaxMisses) {
        ws.terminate();
        continue;
      }
      missedPongs.set(connId, missed + 1);
      ws.ping();
    }
  }, config.heartbeatIntervalMs);
  // 定期タイマーだけでプロセスの終了を妨げないようにする
  timer.unref?.();
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

startHeartbeat();

// この 1 行は tests/helpers.ts が JSON.parse して実ポートを受け取る機械可読な契約である。
// 形式を変えると poker-sync のテストが全滅する（helpers.ts が '"listening"' を含む行を探す）。
console.log(JSON.stringify({ event: 'listening', port: server.port })); // log-hygiene:allow テストハーネスとの契約
