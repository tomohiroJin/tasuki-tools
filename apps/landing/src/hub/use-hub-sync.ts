/**
 * ハブ（選択画面）の同期フック（#95 S5a）。
 *
 * **LP の同期フックはこの 1 本だけである**（`docs/adr/0015` MUST 2・`docs/adr/0019` が
 * 適用範囲を LP へ広げた）。画面は `SyncConnection` を触らず、ここが返す値と操作だけを使う。
 *
 * ## 何をするか
 *
 * 1. `/ws` へ繋ぐ（唯一の WS 入口。`?tool=` を付けない接続はハブとして扱われる。
 *    `apps/tasuki-sync/src/adapters/ws-adapter.ts` の `protocolFromRequestUrl`）
 * 2. 受信は `classifyHubFrame`（`hub-frames.ts`）が `HubServerMsgSchema` などで検める（**境界の検証**・原則 IV）。合わないフレームは捨てる
 * 3. `room.created` / `room.joined` を受けたら、復帰の組と既定の表示名を端末へ保存する。
 *    `room.created` ではルーム名も覚える（#633。次に作るときの候補）
 * 4. 読み込み時、URL の `?room=` に対応する組があれば**名乗らずに復帰する**（R16）
 * 5. 再接続したら、保存済みの組で入り直す
 * 6. 合言葉を求められたら、画面に入力を促す
 * 7. 入室が混雑で弾かれたら、`joinRetryDelayMs` の間隔で自動的に試み直す
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SyncConnection,
  buildInviteUrl,
  buildSyncUrl,
  clearResumeIdentity,
  loadResumeIdentity,
  planForJoinError,
  saveDefaultDisplayName,
  saveResumeIdentity,
} from '@tasuki/sync-client';
import type { HubCommand, RosterRoom } from '@tasuki/room-core';
import { readRoomParam } from './room-param.js';
import { departureHubPath, redirectTo } from './departure.js';
import { classifyHubFrame, planHubError } from './hub-frames.js';
import {
  checkCommand,
  createCommand,
  joinCommand,
  lastJoinOf,
  resumeCommand,
  retryCommand,
  type LastJoin,
} from './hub-commands.js';
import { useDefaultDisplayName } from './use-default-display-name.js';
import { useRecentRoomNames } from './use-recent-room-names.js';
import { useJoinRetry } from '@tasuki/web-kit/sync';

/** 同期サーバーへの URL。**ハブの入口は `/ws`** で、LP の base（`/`）直下にある。 */
export function buildHubSyncUrl(location: { protocol: string; host: string }): string {
  return buildSyncUrl(location, null);
}

export interface HubSync {
  /** URL の `?room=`（無ければ null）。 */
  readonly code: string | null;
  /** そのルームへ参加済みか。 */
  readonly joined: boolean;
  /**
   * 端末の復帰の組で入り直そうとしていて、まだ返事が来ていないか（#95 S5c 追補）。
   *
   * **「まだ分からない」を「名乗る必要がある」と混同させないための値である。**
   * これが true の間、画面は名乗りを求めない（`hub/hub-state.ts` の `screenFor`）。
   */
  readonly resuming: boolean;
  /**
   * そのルームが見つからないと分かったか（#274）。
   *
   * **名乗る前に立つことがある。** 復帰の組を持たない人には、接続と同時に
   * 生死を尋ねている。組を持つ人は `room.join` の答えで同じ印が立つ。
   */
  readonly gone: boolean;
  /** 選択画面に映す名簿（未参加なら null）。 */
  readonly roster: RosterRoom | null;
  /** 名乗るフォームの初期値（前に名乗った名前）。 */
  readonly defaultDisplayName: string;
  /** 前に作ったルーム名（新しい順・#633）。作成画面の初期値と候補に使う。 */
  readonly recentRoomNames: readonly string[];
  /** 直前のエラーの文言（無ければ null）。 */
  readonly error: string | null;
  /** 合言葉の入力を求められているか。 */
  readonly needsPassphrase: boolean;
  /** 接続の状態。 */
  readonly connection: 'online' | 'reconnecting';
  /** ルームの作成を送って、応答を待っているか（#642 のレビュー）。待つ間は次の作成を送らない。 */
  readonly creating: boolean;
  /**
   * いま映しているルームの参加用 URL（未参加なら null）。
   *
   * 組み立ては `@tasuki/sync-client` に 1 つだけあり、**それを取り込むのはこのフックの
   * 仕事である** —— 画面（`.tsx`）は同期クライアントを直接 import しない
   * （`docs/guides/architecture.md` の層の対応表・`docs/adr/0015`）。
   */
  readonly inviteUrl: string | null;
  /**
   * いまのお題のタイトル（無ければ null）。**タイトルだけを持ち、説明は持たない**（spec §5.5）。
   *
   * お題の状態はハブの言葉ではなく、ルーム横断の `topic` フレームで届く（spec T3）。
   */
  readonly topicTitle: string | null;
  createRoom(roomName: string, displayName: string): void;
  joinRoom(displayName: string, passphrase?: string): void;
  /** 前に作ったルーム名の候補から 1 つを消す（#633）。 */
  forgetRoomName(roomName: string): void;
}

export function useHubSync(): HubSync {
  /**
   * **ページ読み込みの時点で URL にあったルームコード。以後変わらない。**
   *
   * 接続はこれだけに依存させる（下の `useEffect`）。**いま映しているルーム
   * （{@link code}）に依存させてはいけない** —— ルームを作ると `room.created` で
   * そちらが変わり、**いま使ったばかりの WS を捨てて張り直したうえ、保存したての
   * 復帰の組で `room.join` を送り直す**（無駄な再接続に加えて、切断と再参加が
   * サーバー側で競合し、選択画面の名簿がちらつく）。
   */
  const initialCode = useMemo(() => readRoomParam(window.location.href), []);

  /**
   * いま映しているルーム。
   *
   * **URL の `?room=` だけで決めてはいけない。** ルームを**作った**ときは、その時点まで
   * URL に `room` が無い（サーバーがコードを決めるまで存在しない）。初期値を URL から
   * 取り、`room.created` を受けたらここを進める —— 進めないと、作成が成功しても
   * 「ルームを作る画面」のままになる（E2E が実際にこの形で落ちた）。
   */
  const [code, setCode] = useState<string | null>(initialCode);
  /**
   * {@link code} の現在値を、接続の `useEffect` の中から読むための控え。
   *
   * `onMessage` は張った時点のクロージャを持ち続けるので、素の `code` を読むと
   * **作成前の値（`null`）を見続ける**。接続を張り直さずに現在値を知るために置く。
   */
  const codeRef = useRef<string | null>(initialCode);
  const [joined, setJoined] = useState(false);
  /**
   * 復帰の返事待ち。
   *
   * **初期値は「この端末がこのルームの復帰の組を持っているか」で決める。** 持っていない
   * 人（招待リンクを受け取っただけの人）は待つ対象が無いので、いままでどおり
   * すぐ参加画面を出す —— ここを常に true から始めると、**名乗るべき人が
   * 読み込み中のまま止まる**。
   *
   * 降りるのは**復帰に対するサーバーの最初の返事が来たとき**である（入室の成立でも
   * エラーでも降ろす）。降ろさない経路を作ると待ちが終わらない。
   */
  const [resuming, setResuming] = useState(
    () => initialCode !== null && loadResumeIdentity(initialCode) !== null,
  );
  const [gone, setGone] = useState(false);
  const [roster, setRoster] = useState<RosterRoom | null>(null);
  const [topicTitle, setTopicTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsPassphrase, setNeedsPassphrase] = useState(false);
  const [connection, setConnection] = useState<'online' | 'reconnecting'>('online');
  /** 名乗るフォームの初期値と端末の片付け（`use-default-display-name.ts`・#284）。 */
  const defaultDisplayName = useDefaultDisplayName();
  /** 前に作ったルーム名（`use-recent-room-names.ts`・#633）。 */
  const { names: recentRoomNames, remember: rememberRoomName, forget: forgetRoomName } = useRecentRoomNames();
  /**
   * 応答を待っている作成で送ったルーム名（待っていなければ null）。**覚えるのは `room.created` を
   * 受けてから**である（送っただけでは覚えない —— 弾かれた名前を候補に残さない。#633 EARS 1）。
   *
   * **null でない間は次の作成を送らない**（{@link creating}）。応答（`room.created`）は送った名前を
   * 持たないので、待つ間に別の名前で送り直せると、成功した 1 つ目の応答で 2 つ目の名前を覚えてしまう
   * （#642 のレビュー。2 つ目はサーバーが弾く）。ハブのエラーも作成のものとは限らないので、送った名前と
   * 応答を数で対応づけるのではなく、**待つ作成を 1 つに限る**。
   */
  const pendingCreateRoomNameRef = useRef<string | null>(null);
  /**
   * 待っている作成が、接続に**溜められた**ままか（#642 の再確認）。
   *
   * 閉じかけ（CLOSING）の接続へ送った作成は `SyncConnection` に溜められ、繋ぎ直しで新しい接続へ流れる。
   * その応答は新しい接続に届くので、繋ぎ直しで待ちを降ろしてはいけない —— 降ろすと、応答を待つ間に
   * 別の名前で送り直せて、名前を取り違える。その場で送った作成は、切れたら応答ごと失われるので降ろす。
   */
  const pendingCreateQueuedRef = useRef(false);
  /** 作成の応答待ちか。画面は作るボタンを止める（{@link pendingCreateRoomNameRef} の写し）。 */
  const [creating, setCreating] = useState(false);
  const settleCreate = useCallback(() => {
    pendingCreateRoomNameRef.current = null;
    pendingCreateQueuedRef.current = false;
    setCreating(false);
  }, []);

  const connRef = useRef<SyncConnection | null>(null);
  /**
   * 混雑で弾かれたときの再試行（回数とタイマーは `@tasuki/web-kit/sync` の `useJoinRetry`。#369）。
   * **入室と照会で共有する。** 知らせは持たない（玄関はサーバーの文を `error` で見せる）。
   *
   * **照会と入室は同時に飛びうる** —— 照会の返事を待つ間も名乗りフォームは操作でき、
   * 利用者が名乗ると両方の応答が別々に届く。その取り違えを防ぐのが `if (last === null)`
   * の判定である。
   *
   * それでも数え手が 1 本で足りるのは、**仕掛かる再試行が常に 1 本だけ**だから ——
   * 予約は単一で、積む前に必ず前の予約を捨てる。`joinRoom` / `createRoom` は利用者の操作として、
   * 仕掛かっていた再試行を先に取り消す。
   *
   * **利用者が自分で動いたら取り消す。** 待ち時間の間、名乗りフォームは操作できる
   * （`screenFor` は `join` を返し続ける）。取り消さないと、**利用者が名乗った後に、名乗る前の
   * 状態を捕まえたタイマーが発火する** —— 照会の再試行が幽霊のように飛び、回数の予算を入室と食い合う。
   */
  const { rateLimited, cancel: cancelRetry, reset: resetRetry } = useJoinRetry(null);
  /** 自動で入り直すときに使う、直近の名乗り。 */
  const lastJoinRef = useRef<LastJoin | null>(null);
  /** 送る。その場で送ったか・溜めたか・捨てたかを返す（`SyncConnection.send`。接続が無ければ捨てた扱い）。 */
  const send = useCallback(
    (cmd: HubCommand): 'sent' | 'queued' | 'dropped' =>
      connRef.current?.send(cmd as unknown as Record<string, unknown>) ?? 'dropped',
    [],
  );

  /**
   * 保存済みの組で入り直す（再接続・読み込み時の復帰）。
   *
   * **見るのは URL 由来の {@link initialCode} である。** 作成で得たコードを見ると、
   * 作った直後に「復帰」が走って `room.join` を送ってしまう（作成の応答で既に入っている）。
   */
  const resumeIfPossible = useCallback(() => {
    if (initialCode === null) return false;
    const saved = loadResumeIdentity(initialCode);
    if (saved === null) return false;
    send(resumeCommand(initialCode, saved));
    return true;
  }, [initialCode, send]);

  /**
   * ルームの生死だけを尋ねる（#274）。**復帰の組を持たない人にだけ送る。**
   *
   * 組を持つ人には `room.join` が同じ答えを返すので、送るとバケツを二重に使うだけである
   * （レート制限は IP 単位で、同じ NAT の利用者が枠を共有する）。
   */
  const checkIfNeeded = useCallback(() => {
    if (initialCode === null) return;
    if (loadResumeIdentity(initialCode) !== null) return;
    send(checkCommand(initialCode));
  }, [initialCode, send]);

  useEffect(() => {
    const conn = new SyncConnection({
      url: buildHubSyncUrl(window.location),
      onMessage: (raw) => {
        // 受信フレームの見分け（境界の検証・原則 IV）は `hub-frames.ts`。
        const frame = classifyHubFrame(raw);
        if (frame.kind === 'topic') {
          setTopicTitle(frame.title);
          return;
        }
        if (frame.kind === 'drop') return;
        const msg = frame.msg;

        if (msg.type === 'roster') {
          setRoster(msg.room);
          return;
        }
        if (msg.type === 'room.created' || msg.type === 'room.joined') {
          saveResumeIdentity({
            code: msg.code,
            participantId: msg.participantId,
            resumeToken: msg.resumeToken,
            displayName: lastJoinRef.current?.displayName ?? '',
          });
          saveDefaultDisplayName(lastJoinRef.current?.displayName ?? '');
          setJoined(true);
          setResuming(false);
          setGone(false);
          setError(null);
          setNeedsPassphrase(false);
          resetRetry();
          // 作成したときは URL に `?room=` が無いので、履歴を汚さず差し替える。
          // **画面の側も同時に進める**（URL を書き換えても状態は追随しない）。
          if (msg.type === 'room.created') {
            if (pendingCreateRoomNameRef.current !== null) rememberRoomName(pendingCreateRoomNameRef.current);
            settleCreate();
            codeRef.current = msg.code;
            setCode(msg.code);
            const url = new URL(window.location.href);
            url.searchParams.set('room', msg.code);
            window.history.replaceState(null, '', url.toString());
          }
          return;
        }
        // エラー
        //
        // **どのエラーでも復帰の待ちは終わらせる。** ここへ来た時点で「この端末の組では
        // 入れなかった」ことが確定しており、待ち続けると読み込み中の表示から抜けられない
        // （合言葉を求められた・混雑で弾かれた場合も、参加画面で文言を読ませて操作させる）。
        setResuming(false);
        // **作成の待ちも終わらせる**（#642 のレビュー）。作成を弾かれたら送り直せるようにする。
        // 作成と無関係のエラーで降りても、覚える名前は捨てるだけなので、弾かれた名前は残らない。
        settleCreate();
        // 次の一手の決め方は `hub-frames.ts` の `planHubError`。ここは実行だけを受け持つ。
        const intent = planHubError(msg, planForJoinError(msg.code, msg.message, msg.message), {
          currentCode: codeRef.current,
          initialCode,
        });
        switch (intent.kind) {
          case 'leave':
            // 抜けた・外された（別のタブ・別のツールの操作でも届く）。組を捨てて接続を畳み、
            // 理由を持って玄関のそのルームへ置き換えて戻る（#427）。画面に留まると、名簿が
            // 古いまま押せる画面が残る。
            cancelRetry();
            clearResumeIdentity(intent.target);
            conn.dispose();
            redirectTo(departureHubPath(intent.target, intent.reason));
            return;
          case 'passphrase':
            setNeedsPassphrase(true);
            setError(intent.message);
            return;
          case 'rate-limited': {
            // 混雑で弾かれた人を、操作なしで先へ運ぶ（#147 と同じ方針）。
            setError(intent.message);
            const last = lastJoinRef.current;
            const target = codeRef.current;
            // 前の予約は `rateLimited` が捨ててから積む（消さずに上書きすると、消えた側は取り消せない
            // まま生き残る。最終レビュー I1）。使い切ったら送らない。
            rateLimited(() => {
              // **コードが無い（作成が弾かれた）ときは送り直す先が無い。** 回数だけは数える
              // （載せ替えの前と同じ）。コードは null から決まるだけで戻らないので、このとき
              // 取り消される予約は無い。
              if (target === null) return;
              send(retryCommand(target, last));
            });
            return;
          }
          case 'gone':
            // **保存済みの組で入れなかったら捨てる。** 残すと、消えたルームへ
            // 毎回入り直そうとして参加画面に戻れない（poker の clearIdentity と同じ扱い）。
            clearResumeIdentity(intent.target);
            // **名乗りフォームを出さない**（#274・#76 J-1）。ここで返す。`error` を埋めると、
            // 不在の画面と参加画面用の文言が同じことを 2 通りの言い方で出すことになる。
            setGone(true);
            return;
          case 'ignore':
            return;
          case 'show':
            setError(intent.message);
            return;
        }
      },
      onOpen: () => {
        setConnection('online');
      },
      onConnectionChange: (state) => setConnection(state),
      onReconnected: () => {
        // 作成の待ちの扱い（#642 のレビューと再確認）。`SyncConnection` は溜めた送信を流してから
        // ここを呼ぶ。
        // - **溜めた作成**（閉じかけの接続へ送った）は、いま新しい接続へ流れた。応答はこれから届くので
        //   待ちを続け、「その場で送った」扱いに変える（この接続も切れたら、次の繋ぎ直しで降ろす）
        // - **その場で送った作成**は、応答が前の接続と一緒に失われた。降ろさないと、作るボタンが止まったまま戻らない
        if (pendingCreateQueuedRef.current) {
          pendingCreateQueuedRef.current = false;
        } else {
          settleCreate();
        }
        // 切断中に名簿が変わっているので、入り直して新しい名簿を受け取る。
        resumeIfPossible();
        // **切断中にルームが終わっていることがある。** 名乗りフォームの前で
        // 待っている人はそれを知らないので、尋ね直す（#274）。
        checkIfNeeded();
      },
    });
    connRef.current = conn;
    conn.connect();

    // 読み込み時の復帰（R16）。同じ端末・同じルームなら名乗りを求めない。
    const saved = initialCode === null ? null : loadResumeIdentity(initialCode);
    if (saved !== null) {
      lastJoinRef.current = { displayName: saved.displayName };
      resumeIfPossible();
    }
    // **組が無い人には生死を尋ねる**（#274）。名乗る前に不在を知らせるため。
    checkIfNeeded();

    return () => {
      // **画面が消えた後にタイマーが発火するのを防ぐ。** 取り消さないと、
      // dispose 済みの接続へ向けて送信を試みることになる。
      cancelRetry();
      conn.dispose();
      connRef.current = null;
    };
    // **依存は URL 由来の値だけにする。** 入口の URL はページ読み込みで決まり
    // （全ページ読み込みで WS が張り直しになる・D14）、作成で得たコードをここへ混ぜると
    // 作成のたびに接続が張り直る（`tests/hub/use-hub-sync.test.tsx` が固定している）。
  }, [initialCode, resumeIfPossible, checkIfNeeded, send, cancelRetry, rateLimited, resetRetry, rememberRoomName, settleCreate]);

  const createRoom = useCallback(
    (roomName: string, displayName: string) => {
      // **待っている作成があれば送らない**（{@link pendingCreateRoomNameRef}・#642 のレビュー）。
      // 画面のボタンも止めるが、クリック以外の送信経路（requestSubmit・支援技術）はここで止める。
      if (pendingCreateRoomNameRef.current !== null) return;
      // **利用者が別の道を選んだ。** 仕掛かっていた再試行（照会の可能性がある）は
      // もう意味を持たないので取り消す。
      cancelRetry();
      lastJoinRef.current = { displayName };
      pendingCreateRoomNameRef.current = roomName;
      setCreating(true);
      setError(null);
      const delivery = send(createCommand(roomName, displayName));
      // 溜めたなら、繋ぎ直しで流れて応答が来る（{@link pendingCreateQueuedRef}）。捨てたなら応答は来ないので待たない
      if (delivery === 'queued') pendingCreateQueuedRef.current = true;
      if (delivery === 'dropped') settleCreate();
    },
    [send, cancelRetry, settleCreate],
  );

  const joinRoom = useCallback(
    (displayName: string, passphrase?: string) => {
      if (code === null) return;
      // **利用者が自分で名乗った。** 待ち時間の間に仕掛かっていた再試行（名乗る前の
      // 状態を捕まえている）を取り消さないと、名乗った後に幽霊の照会が飛ぶ（#274）。
      cancelRetry();
      const last = lastJoinOf(displayName, passphrase);
      lastJoinRef.current = last;
      setError(null);
      resetRetry();
      send(joinCommand(code, last));
    },
    [code, send, cancelRetry, resetRetry],
  );

  return {
    code,
    joined,
    resuming,
    gone,
    inviteUrl: code === null ? null : buildInviteUrl(window.location.origin, code),
    roster,
    topicTitle,
    defaultDisplayName,
    recentRoomNames,
    error,
    needsPassphrase,
    connection,
    creating,
    createRoom,
    joinRoom,
    forgetRoomName,
  };
}
