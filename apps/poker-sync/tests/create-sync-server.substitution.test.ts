// ポートの差し替えテスト（docs/adr/0007 の追記が定める MUST）。
//
// 「利用者（呼び出し箇所）が 1 つしかないものを抽出しない」の例外として、
// **テストからの差し替え利用を 2 つ目の利用者と数える**。ただし
// 「テストを書けば 2 つ目になる」では足りず、**差し替えを行うテストが現に存在する**
// ことが条件である。このファイルがその条件を満たす。
//
// 4 本とも「差し替えなしでは書けなかったこと」を検証する。加えて、#165 PR-2 のレビューで
// 見つかった 2 つの配線の穴（`handleCreateRoom` の `broadcaster.resetRoom` 呼び出しと、
// `detachFromCurrentRoom` の早期 return にある `broadcaster.detach` 呼び出し）も守る。
// どちらも呼び出しを削っても既存の全テストは緑のままだった経路である（変異検査で確認済み）。
//
// **`Broadcaster` ポートの振る舞い（接続レジストリの attach/detach）を観測する目的で
// 独自実装を注入しているのは、「配線の穴 2」（`detachFromCurrentRoom` の detach
// 呼び出しを守るテスト）の 1 本だけである。**（`MonotonicClock`/`RoomStore` の各テストにも
// `Broadcaster` の偽物は登場するが、それらは「登録系メソッドは呼ばれないはず」という
// 非呼び出しの証明のためで、`sendTo` 以外は素通りしない。接続レジストリの振る舞いそのもの
// を差し替えて観測してはいないので、ここには数えない。）
// 「配線の穴 1」（`resetRoom` 呼び出しを守るテスト）と
// `RoomSocket の差し替え（配信の宛先と回数）` は、どちらも `createWsBroadcaster()`
// （本番アダプタ）をそのまま使っており、差し替えているのは `RoomSocket`
// （`oldSocket`/`newSocket`/`hostSocket` 等）であって `Broadcaster` ポートではない。
// それでも「配線の穴 1」のテストに価値があるのは、`resetRoom` の呼び出し（配線）を
// 守る唯一のテストだからである（`Broadcaster` を差し替えているかどうかとは別の理由）。
// 「Broadcaster」や「配線の穴」を名乗る describe だからといって、自動的に Broadcaster
// ポートの差し替えだと早合点しないこと（#165 PR-2 の再レビューでの指摘そのもの）。
//
// ファイル名は `create-sync-server.substitution.test.ts` だが、実体は
// `createSyncServer` ではなく `makeHandlers`（アプリケーション層）の差し替えテストである
// （`createSyncServer` は 1 度も import していない）。`src/application/handlers.ts` の
// コメントがこのファイル名で参照しているため、ファイル名自体は変えていない。
import { describe, expect, it } from 'bun:test';
import { createRoom, type ServerMessage } from '@tasuki/poker-core';
import { createTokenBucketLimiter, type RateLimiter } from '@tasuki/rate-limit';
import { createInMemoryRoomStore } from '../src/adapters/in-memory-room-store';
import { createWsBroadcaster } from '../src/adapters/ws-broadcaster';
import { makeHandlers, type HandlerConnection } from '../src/application/handlers';
import type { Broadcaster, RoomSocket } from '../src/ports/broadcaster';
import type { IdGen } from '../src/ports/id-gen';
import type { MonotonicClock } from '../src/ports/monotonic-clock';
import type { RoomStore } from '../src/ports/room-store';

/** 送信を記録するだけのソケット */
function spySocket(): RoomSocket & { sent: string[] } {
  const sent: string[] = [];
  return { sent, send: (data) => void sent.push(data) };
}

/** ソケットに `HandlerConnection` として要る `data` を足すだけの薄いラッパ */
function connectionOf(
  socket: RoomSocket,
  data: Partial<HandlerConnection['data']> = {},
): HandlerConnection {
  return { ...socket, data: { participantId: null, roomId: null, rateKey: 'k', ...data } };
}

/** 何もしない Broadcaster。attach/broadcastSnapshot 等を経由しないテストで使う */
function nullBroadcaster(): Broadcaster {
  return {
    attach: () => undefined,
    detach: () => false,
    resetRoom: () => undefined,
    countIn: () => 0,
    broadcastSnapshot: () => undefined,
    sendTo: () => undefined,
  };
}

/** 常に同じ値を返す時計。時刻そのものを検証したいテスト以外で使う */
function fixedClock(n: number): MonotonicClock {
  return { now: () => n };
}

/** 常に許可するレート制限。レート制限そのものを検証したいテスト以外で使う */
function alwaysAllowLimiter(): RateLimiter {
  return {
    shouldReject: () => false,
    consume: () => undefined,
    sweep: () => undefined,
    size: () => 0,
    sweepRunCount: () => 0,
  };
}

describe('IdGen の差し替え（衝突再試行）', () => {
  it('候補が既存 ID と衝突する間は引き直す', () => {
    // Given: 最初の 2 回だけ既存 ID と同じ候補を返す IdGen
    const store = createInMemoryRoomStore();
    store.put(createRoom('taken001', 'たろう', { participantId: 'p', token: 't' })._unsafeUnwrap().room);

    const candidates = ['taken001', 'taken001', 'fresh999'];
    let i = 0;
    const idGen: IdGen = {
      roomIdCandidate: () => candidates[i++] ?? 'exhausted',
      participantId: () => 'p-new',
      token: () => 't-new',
    };

    // When / Then: 3 回目の候補が採用される
    // （衝突再試行は 2026-08-17 時点でテストが 0 件だった。差し替えなしでは
    //  crypto.randomUUID() の衝突を起こせず、この経路を通せない）
    const roomId = makeHandlers({
      store,
      broadcaster: nullBroadcaster(),
      idGen,
      clock: fixedClock(0),
      rateLimiter: alwaysAllowLimiter(),
      maxRooms: 50,
    }).generateRoomId();

    expect(roomId).toBe('fresh999');
    expect(i).toBe(3);
  });
});

describe('MonotonicClock の差し替え（レート制限の窓の境界）', () => {
  it('時計を進めるとレート制限が回復する境界を、実時間を待たずに決定的に作れる', () => {
    // Given: 容量 1・毎秒 10 個補充のバケツ（＝満タンに戻るまで 100ms）と、
    // 進められる偽時計。存在しないルームへの join-room はレート制限の対象になる
    // （application/rate-limit-gate.ts）
    let t = 0;
    const clock: MonotonicClock = { now: () => t };
    const rateLimiter = createTokenBucketLimiter({ capacity: 1, refillPerSec: 10 });
    const store = createInMemoryRoomStore(); // 'nope' はどの時点でも存在しない
    const messages: ServerMessage[] = [];
    const broadcaster: Broadcaster = {
      ...nullBroadcaster(),
      sendTo: (_socket, msg) => void messages.push(msg),
    };
    const idGen: IdGen = {
      // room-not-found / rate-limited の経路はどちらも IdGen を呼ばない。
      // 呼ばれたら差し替えの前提が崩れているので、その場で失敗させる
      roomIdCandidate: () => {
        throw new Error('roomIdCandidate は呼ばれないはず');
      },
      participantId: () => {
        throw new Error('participantId は呼ばれないはず');
      },
      token: () => {
        throw new Error('token は呼ばれないはず');
      },
    };
    const handlers = makeHandlers({ store, broadcaster, idGen, clock, rateLimiter, maxRooms: 50 });
    const ws = connectionOf(spySocket(), { rateKey: 'client-1' });

    // When: 同時刻（t=0）で 2 回連続 join-room する
    handlers.handleJoinRoom(ws, { type: 'join-room', roomId: 'nope', name: 'たろう' });
    handlers.handleJoinRoom(ws, { type: 'join-room', roomId: 'nope', name: 'たろう' });

    // Then: 1 回目でトークンを使い切り（room-not-found）、2 回目は残量切れで拒否される
    expect(messages.map((m) => (m.type === 'error' ? m.code : m.type))).toEqual([
      'room-not-found',
      'rate-limited',
    ]);

    // When: 時計をちょうど 100ms 進める（実時間の sleep はしない。
    // WS 越しのテストがこの境界を検証するには実際に 100ms 待つしかなく、
    // 「窓の境界ちょうど」を決定的に作ることはできない。これが差し替えの価値である）
    t += 100;
    messages.length = 0;
    handlers.handleJoinRoom(ws, { type: 'join-room', roomId: 'nope', name: 'たろう' });

    // Then: 拒否が解け、再び room-not-found（＝ルームの照会まで進んだ）に戻る
    expect(messages).toEqual([{ type: 'error', code: 'room-not-found', message: expect.any(String) }]);
  });
});

describe('RoomStore の差し替え（上限判定を実ルームなしで再現）', () => {
  it('store.count() が上限以上を返すだけで server-busy になり、IdGen/Broadcaster の生成系は一切呼ばれない', () => {
    // Given: 実際のルームを 1 つも持たないのに count() が上限値を返す store。
    // 実ルーム作成（RoomStore 越しに maxRooms 個の Room を積む、または WS で
    // maxRooms 回 create-room する）を一切経由せずに上限判定だけを再現できるのが
    // RoomStore を差し替える価値。put/remove/has が実際に呼ばれたら
    // 上限判定がこの前提から外れているので、その場で失敗させる
    const store: RoomStore = {
      // get() は常に undefined（＝存在するはずの部屋が無い）を返す契約非整合な偽物だが、
      // このテストの経路では読まれない。上限判定が count() しか読まないことをこの
      // テスト自身が確認しているので無害（#165 PR-2 のレビュー指摘）
      get: () => undefined,
      put: () => {
        throw new Error('put は呼ばれないはず（上限判定は count() だけで完結するはず）');
      },
      remove: () => {
        throw new Error('remove は呼ばれないはず');
      },
      has: () => {
        throw new Error('has は呼ばれないはず');
      },
      count: () => 3,
    };
    // 上限判定は idGen も broadcaster の登録系も一切呼ばずに完結するはず。
    // WS 越しのテスト（tests/guards.test.ts の MAX_ROOMS=1）は最終応答（server-busy）
    // までは確認できるが、「本物の crypto.randomUUID() や ws-broadcaster の
    // 登録処理に一度も触れていないこと」までは、ブラックボックスの外からは見えない
    const idGen: IdGen = {
      roomIdCandidate: () => {
        throw new Error('roomIdCandidate は呼ばれないはず');
      },
      participantId: () => {
        throw new Error('participantId は呼ばれないはず');
      },
      token: () => {
        throw new Error('token は呼ばれないはず');
      },
    };
    const sent: ServerMessage[] = [];
    const broadcaster: Broadcaster = {
      attach: () => {
        throw new Error('attach は呼ばれないはず');
      },
      detach: () => {
        throw new Error('detach は呼ばれないはず');
      },
      resetRoom: () => {
        throw new Error('resetRoom は呼ばれないはず');
      },
      countIn: () => {
        throw new Error('countIn は呼ばれないはず');
      },
      broadcastSnapshot: () => {
        throw new Error('broadcastSnapshot は呼ばれないはず');
      },
      sendTo: (_socket, msg) => void sent.push(msg),
    };
    const handlers = makeHandlers({
      store,
      broadcaster,
      idGen,
      clock: fixedClock(0),
      rateLimiter: alwaysAllowLimiter(),
      maxRooms: 3,
    });
    const ws = connectionOf(spySocket());

    // When
    handlers.handleCreateRoom(ws, { type: 'create-room', name: 'たろう' });

    // Then
    expect(sent).toEqual([{ type: 'error', code: 'server-busy', message: expect.any(String) }]);
  });
});

describe('RoomStore の差し替え（判定順序: 上限判定は切り離しより先）', () => {
  it('上限に達していれば、別ルームに参加中の接続でも detachFromCurrentRoom の store.get までは進まない', () => {
    // Given: handleCreateRoom のコメントが明記する不変条件——
    // 「ルーム数の上限（Issue #63）。切り離しより先に判定する。先に離脱させてしまうと、
    //  拒否されたときに元のルームから追い出されたままになる。」
    // （src/application/handlers.ts の handleCreateRoom 冒頭のコメント、逐語）
    //
    // 判定が detachFromCurrentRoom の後ろへ動くと、そちらの store.get が呼ばれる。
    // それを検出するため、store.get は「上限判定より先には呼ばれないはず」の例外を投げる。
    // これは RoomStore の不変条件そのもの（get が呼ばれる/呼ばれない）を守るテストであり、
    // 1 本目の RoomStore テストが守っていた IdGen/Broadcaster 側の非依存とは別の性質
    const store: RoomStore = {
      get: () => {
        throw new Error('get は呼ばれないはず（上限判定は detachFromCurrentRoom より先のはず）');
      },
      put: () => {
        throw new Error('put は呼ばれないはず');
      },
      remove: () => {
        throw new Error('remove は呼ばれないはず');
      },
      has: () => {
        throw new Error('has は呼ばれないはず');
      },
      count: () => 1,
    };
    const idGen: IdGen = {
      roomIdCandidate: () => {
        throw new Error('roomIdCandidate は呼ばれないはず');
      },
      participantId: () => {
        throw new Error('participantId は呼ばれないはず');
      },
      token: () => {
        throw new Error('token は呼ばれないはず');
      },
    };
    const sent: ServerMessage[] = [];
    const broadcaster: Broadcaster = {
      attach: () => {
        throw new Error('attach は呼ばれないはず');
      },
      detach: () => {
        throw new Error('detach は呼ばれないはず（切り離し処理へ進んでしまっている）');
      },
      resetRoom: () => {
        throw new Error('resetRoom は呼ばれないはず');
      },
      countIn: () => {
        throw new Error('countIn は呼ばれないはず');
      },
      broadcastSnapshot: () => {
        throw new Error('broadcastSnapshot は呼ばれないはず');
      },
      sendTo: (_socket, msg) => void sent.push(msg),
    };
    const handlers = makeHandlers({
      store,
      broadcaster,
      idGen,
      clock: fixedClock(0),
      rateLimiter: alwaysAllowLimiter(),
      maxRooms: 1,
    });
    // 既に別ルーム 'r1' に参加中の接続（二重送信・SPA 遷移で create-room を送ってきた想定）
    const ws = connectionOf(spySocket(), { participantId: 'p1', roomId: 'r1' });

    // When
    handlers.handleCreateRoom(ws, { type: 'create-room', name: 'たろう' });

    // Then: server-busy が返り、detachFromCurrentRoom（store.get を経由する）にも
    // idGen にも broadcaster の登録系にも一切触れない。
    //
    // **これは RoomStore を差し替えないと観測できない。** WS 越しでは「元のルームから
    // 追い出されていないこと」を、別クライアントから元のルームへ check-room や
    // join-room を送って生存を確認する間接的な方法でしか見られない
    // （かつ、その間接確認自体が detachFromCurrentRoom を経由しない別経路なので、
    // 「上限判定が detach より先か後か」という順序そのものは証明できない）
    expect(sent).toEqual([{ type: 'error', code: 'server-busy', message: expect.any(String) }]);
  });
});

describe('RoomSocket の差し替え（配信の宛先と回数）', () => {
  it('broadcastSnapshot はそのルームに attach された全員へちょうど 1 回ずつ届き、他室へは届かない', () => {
    // Given: 2 部屋。room01 にはホストが attach 済み、room02 は無関係な部屋
    const store = createInMemoryRoomStore();
    const room = createRoom('room01', 'ホスト', { participantId: 'host', token: 'ht' })._unsafeUnwrap()
      .room;
    store.put(room);
    store.put(
      createRoom('room02', '無関係', { participantId: 'other', token: 'ot' })._unsafeUnwrap().room,
    );

    const broadcaster = createWsBroadcaster();
    const hostSocket = spySocket();
    const otherRoomSocket = spySocket();
    broadcaster.attach('room01', 'host', hostSocket);
    broadcaster.attach('room02', 'other', otherRoomSocket);

    const guestSocket = spySocket();
    const idGen: IdGen = {
      roomIdCandidate: () => {
        throw new Error('roomIdCandidate は呼ばれないはず（join-room は既存ルームに参加する）');
      },
      participantId: () => 'guest',
      token: () => 'gt',
    };
    const handlers = makeHandlers({
      store,
      broadcaster,
      idGen,
      clock: fixedClock(0),
      rateLimiter: alwaysAllowLimiter(),
      maxRooms: 50,
    });

    // When: ゲストが room01 に参加する
    handlers.handleJoinRoom(connectionOf(guestSocket), {
      type: 'join-room',
      roomId: 'room01',
      name: 'ゲスト',
    });

    // Then: room01 の 2 人（host / guest）だけが room-state を受け取る。
    // **両者に届くこと自体は tests/join.test.ts:49「2人目の参加が両者の room-state に
    // 配信される」が WS 越しに既に検証済み。** ここで新しいのは
    // 「無関係な room02 には 0 件（不達）」と「ちょうど 1 回（多重配信していない）」の 2 点。
    // 不達は WS 越しでは待ち受けをタイムアウトさせて確認するしかなく、回数は受信側の
    // 1 本のソケットからは「他人に何回届いたか」を直接数えられない（#165 PR-2 のレビュー指摘）
    expect(hostSocket.sent).toHaveLength(1); // room-state のみ
    expect(guestSocket.sent).toHaveLength(2); // joined + room-state
    expect(otherRoomSocket.sent).toHaveLength(0); // room02 には一切届かない

    // 直前で toHaveLength を確認済みなので、この時点で両インデックスは必ず存在する
    const hostSnapshot = JSON.parse(hostSocket.sent[0] as string) as ServerMessage;
    expect(hostSnapshot).toMatchObject({ type: 'room-state', roomId: 'room01', you: 'host' });
    const guestSnapshot = JSON.parse(guestSocket.sent[1] as string) as ServerMessage;
    expect(guestSnapshot).toMatchObject({ type: 'room-state', roomId: 'room01', you: 'guest' });
  });
});

describe('配線の穴 1: handleCreateRoom の resetRoom 呼び出し', () => {
  it('同じ ID が再採番されたとき、古い接続には新しいルームのスナップショットが届かない', () => {
    // Given: 到達不能になったルーム 'reused01' に、古い接続だけが接続レジストリに残っている
    // （store には対応するルームが無い。#165 の設計で実際に起こりうる状態として
    // src/application/handlers.ts のコメントが説明しているもの）
    const store = createInMemoryRoomStore();
    const broadcaster = createWsBroadcaster();
    const oldSocket = spySocket();
    broadcaster.attach('reused01', 'old-participant', oldSocket);

    // idGen は常に同じ ID 'reused01' を候補に返す（store に無いので再採番として通る）
    const idGen: IdGen = {
      roomIdCandidate: () => 'reused01',
      participantId: () => 'new-host',
      token: () => 'tok',
    };
    const handlers = makeHandlers({
      store,
      broadcaster,
      idGen,
      clock: fixedClock(0),
      rateLimiter: alwaysAllowLimiter(),
      maxRooms: 50,
    });
    const newSocket = spySocket();

    // When: 'reused01' で新しいルームが作られる
    handlers.handleCreateRoom(connectionOf(newSocket), { type: 'create-room', name: 'たろう' });

    // Then: 新しい接続だけが joined + room-state を受け取り、古い接続には何も届かない。
    // `broadcaster.resetRoom(room.id)` を削ると、attach が古い接続レジストリを再利用し、
    // 古い接続にも broadcastSnapshot が届くようになる（変異検査で確認済み）
    expect(newSocket.sent).toHaveLength(2);
    expect(oldSocket.sent).toHaveLength(0);
  });
});

describe('配線の穴 2: detachFromCurrentRoom の早期 return での detach 呼び出し', () => {
  it('store に対応するルームが無い接続でも、Broadcaster の接続レジストリからは外す', () => {
    // Given: 接続は roomId を持っているが、store にはそのルームが無い
    // （#165 handlers.ts のコメントが説明する「到達不能ルームに attach されたまま」の状態）
    const store = createInMemoryRoomStore(); // 何も put しない → get は常に undefined
    const detachCalls: Array<[roomId: string, participantId: string, socket: RoomSocket]> = [];
    const broadcaster: Broadcaster = {
      attach: () => {
        throw new Error('attach は呼ばれないはず');
      },
      detach: (roomId, participantId, socket) => {
        detachCalls.push([roomId, participantId, socket]);
        return true;
      },
      resetRoom: () => {
        throw new Error('resetRoom は呼ばれないはず');
      },
      countIn: () => {
        throw new Error('countIn は呼ばれないはず（detach 後は早期 return するはず）');
      },
      broadcastSnapshot: () => {
        throw new Error('broadcastSnapshot は呼ばれないはず（配信は行わない契約）');
      },
      sendTo: () => {
        throw new Error('sendTo は呼ばれないはず');
      },
    };
    const idGen: IdGen = {
      roomIdCandidate: () => {
        throw new Error('roomIdCandidate は呼ばれないはず');
      },
      participantId: () => {
        throw new Error('participantId は呼ばれないはず');
      },
      token: () => {
        throw new Error('token は呼ばれないはず');
      },
    };
    const handlers = makeHandlers({
      store,
      broadcaster,
      idGen,
      clock: fixedClock(0),
      rateLimiter: alwaysAllowLimiter(),
      maxRooms: 50,
    });
    const ws = connectionOf(spySocket(), { participantId: 'p1', roomId: 'gone-room' });

    // When
    handlers.detachFromCurrentRoom(ws);

    // Then: 接続レジストリからの detach は 1 回だけ、正しい引数で呼ばれる。
    // `broadcaster.detach(roomId, participantId, ws)` の呼び出しを削ると、この配列は
    // 空のままになる（変異検査で確認済み）。落とすと、到達不能ルームへの接続が
    // Broadcaster の接続レジストリに恒久的に蓄積する
    expect(detachCalls).toHaveLength(1);
    expect(detachCalls[0]?.[0]).toBe('gone-room');
    expect(detachCalls[0]?.[1]).toBe('p1');
    // ソケットは構造比較ではなく同一性（toBe）で見る。意図は「まさにこの接続」であり、
    // 構造的に等価な別ソケットを渡す変異を取り逃さないため（#165 PR-2 のレビュー指摘）
    expect(detachCalls[0]?.[2]).toBe(ws);
    // 接続側の 2 フィールドはこの関数の先頭で必ずクリアされる（早期 return の手前）
    expect(ws.data.participantId).toBeNull();
    expect(ws.data.roomId).toBeNull();
  });
});
