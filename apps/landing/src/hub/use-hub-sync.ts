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
 * 8. 道具の入口から送り返された人（URL の `?from=`）が入れたら、選択画面へ進まず元の道具へ戻す（#638）
 * 9. ルームの合言葉を設定・解除する（`room.passphrase.set`。#638）。付いているかは名簿の印で映す
 * 10. ルームの全員を同じ道具へ呼ぶ（`room.call`。#677）。**受け付け（`room.called`）を受けてから**その道具へ移る。
 *     ほかの人が呼んだ知らせ（`room.call` フレーム）は、ハブの言葉より先に見分けて最新の 1 つを持つ
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
import type { HubCommand, RoomCall, RosterRoom } from '@tasuki/room-core';
import { readRoomParam } from './room-param.js';
import { returnPathFor } from './return-to-tool.js';
import { departureHubPath, redirectTo } from './departure.js';
import { navigateTo } from './navigate.js';
import { classifyHubFrame, planHubError } from './hub-frames.js';
import {
  callCommand,
  checkCommand,
  createCommand,
  joinCommand,
  lastJoinOf,
  passphraseCommand,
  resumeCommand,
  retryCommand,
  type LastJoin,
} from './hub-commands.js';
import { useDefaultDisplayName } from './use-default-display-name.js';
import { useRecentRoomNames } from './use-recent-room-names.js';
import { useJoinRetry } from '@tasuki/web-kit/sync';
import { toolDestination } from '@tasuki/web-kit/room';

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
  /**
   * このルームに合言葉が付いているか（#638）。名簿の印から映す（名簿が届くまで・古いサーバーは null＝まだ分からない）。
   * 合言葉そのものは持たない・受け取らない。
   */
  readonly passphraseProtected: boolean | null;
  /** 合言葉の設定の失敗の文言（無ければ null）。 */
  readonly passphraseError: string | null;
  /** 合言葉の設定の応答を待っているか（待つ間は呼びかけを送らせない・#677 の /code-review）。 */
  readonly settingPassphrase: boolean;
  /** 受け取った呼びかけ（最新の 1 つ。無ければ null・#677）。閉じるまで、新しいものが来るまで残る。 */
  readonly roomCall: RoomCall | null;
  /** 呼びかけを送って、受け付けを待っているか（#677）。待つ間は次を送らない。 */
  readonly calling: boolean;
  /** 呼びかけの失敗の文言（無ければ null・#677）。 */
  readonly callError: string | null;
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
  /** ルームの合言葉を設定・解除する（#638）。空文字で解除。ルームに居る誰でも実行できる。 */
  setPassphrase(passphrase: string): void;
  /** ルームの全員を同じ道具へ呼ぶ（#677）。道具の ID を渡す。受け付けを受けたら呼んだ人もその道具へ移る。 */
  callRoom(tool: string): void;
  /** 受け取った呼びかけの知らせを閉じる（#677）。 */
  dismissRoomCall(): void;
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
   * ページ読み込みの時点の URL（道具が運んだ `?from=` を、入れたあとに読む・#638）。以後変わらない。
   */
  const initialHref = useMemo(() => window.location.href, []);

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
  /** 受け取った呼びかけ（最新の 1 つ・#677）。 */
  const [roomCall, setRoomCall] = useState<RoomCall | null>(null);
  /**
   * 呼びかけを送って受け付けを待っているときの道具の ID（待っていなければ null・#677）。
   * **移るのは、これを待っている間に `room.called` を受けたときだけ**（頼んでいない受け付けでは動かない）。
   * エラーのフレームは相関の手がかりを持たないので、待つ呼びかけを 1 つに限って、その間のエラーは呼びかけのものとして扱う。
   */
  const pendingCallRef = useRef<string | null>(null);
  const [calling, setCalling] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const settleCall = useCallback(() => {
    pendingCallRef.current = null;
    setCalling(false);
  }, []);
  /** 合言葉の設定の失敗（入ったあとのエラーは、設定の送信でしか起きない）。次の送信か名簿（成功）で消す。 */
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  /**
   * 合言葉の設定の応答（名簿かエラー）を待っているか（#677 の /code-review）。エラーのフレームは相関の手がかりを持たないので、
   * **呼びかけと合言葉の設定を同時に待たない**ことで、入ったあとのエラーの持ち主を 1 つに決める
   * （どちらかを待つ間は、もう一方を送らせない。画面のボタンも止める）。サーバーは設定に必ず名簿かエラーを返す。
   */
  const pendingPassphraseRef = useRef(false);
  const [settingPassphrase, setSettingPassphrase] = useState(false);
  const settlePassphrase = useCallback(() => {
    pendingPassphraseRef.current = false;
    setSettingPassphrase(false);
  }, []);
  const joinedRef = useRef(false);
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
   * 接続が開いた回数（初回を含む）。**いま開いている接続の番号**として使う（#642 の再確認と 4 回目のレビュー）。
   *
   * `onOpen` が溜めた送信を流す前に数えるので、溜めた送信は「次に開く接続」＝この番号が 1 つ進んだ接続で流れる。
   */
  const openCountRef = useRef(0);
  /**
   * 待っている作成が流れる（流れた）接続の番号（待っていなければ null）。
   *
   * 閉じかけ（CLOSING）や確立前の接続へ送った作成は `SyncConnection` に溜められ、次に開く接続で流れる。
   * その応答はその接続に届くので、**その接続が開いた繋ぎ直しでは待ちを降ろさない** —— 降ろすと、応答を待つ間に
   * 別の名前で送り直せて、名前を取り違える。それより前の接続で送った作成は、切れたら応答ごと失われているので降ろす。
   *
   * 「溜めたか」の真偽で持たないのは、初回の open（`onReconnected` が呼ばれない）で流れた作成の印を
   * 下ろし損ね、次の繋ぎ直しで待ちが降りなくなるためである（4 回目のレビュー）。番号なら、何回目の open で
   * 流れても同じ比べ方で済む。
   */
  const pendingCreateConnRef = useRef<number | null>(null);
  /** 作成の応答待ちか。画面は作るボタンを止める（{@link pendingCreateRoomNameRef} の写し）。 */
  const [creating, setCreating] = useState(false);
  const settleCreate = useCallback(() => {
    pendingCreateRoomNameRef.current = null;
    pendingCreateConnRef.current = null;
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
        if (frame.kind === 'call') {
          setRoomCall(frame.call);
          return;
        }
        if (frame.kind === 'drop') return;
        const msg = frame.msg;

        if (msg.type === 'roster') {
          setRoster(msg.room);
          setPassphraseError(null);
          settlePassphrase();
          return;
        }
        if (msg.type === 'room.called') {
          // 頼んだ呼びかけの受け付け。**これを受けてから**移る（送ってすぐ移ると、ページを離れる時にコマンドが届かないことがある）。
          const destination = pendingCallRef.current === null ? undefined : toolDestination(msg.tool);
          settleCall();
          if (destination !== undefined) {
            navigateTo(`${destination.href}?room=${encodeURIComponent(codeRef.current ?? '')}`);
          }
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
          // 道具から送り返された人は、通ったら元の道具へ戻す（#638）。**選択画面へ進めない**
          // （一瞬映ると、戻る先を持つ人に別の画面を見せる）。復帰の組は置いてあるので、道具が復帰できる。
          // 作成（`room.created`）は戻る理由を持たない。
          const returnPath = msg.type === 'room.joined' ? returnPathFor(initialHref, msg.code) : null;
          if (returnPath !== null) {
            // 退出の道と同じく、先に閉じてから戻る（道具の復帰の接続と、このハブの接続が重ならないように）。
            cancelRetry();
            conn.dispose();
            redirectTo(returnPath);
            return;
          }
          joinedRef.current = true;
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
        // **呼びかけの待ちも終わらせる**（#677）。弾かれたら送り直せるようにし、失敗は呼ぶ操作の近くへ出す。
        const callWasPending = pendingCallRef.current !== null;
        settleCall();
        settlePassphrase();
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
            // 入ったあとのエラーは、呼びかけを待っていたならそれの失敗、そうでなければ合言葉の設定の失敗である。
            // 入る前の画面の `error` と混ぜない。
            if (joinedRef.current) {
              if (callWasPending) setCallError(intent.message);
              else setPassphraseError(intent.message);
            }
            else setError(intent.message);
            return;
        }
      },
      onOpen: () => {
        // 溜めた送信が流れる前に数える（`SyncConnection` は onOpen の後に流す）。{@link openCountRef}
        openCountRef.current += 1;
        setConnection('online');
      },
      onConnectionChange: (state) => setConnection(state),
      onReconnected: () => {
        // 作成の待ちの扱い（{@link pendingCreateConnRef}・#642 のレビューと再確認）。`SyncConnection` は
        // 溜めた送信を流してからここを呼ぶ。
        // - **いま開いた接続で流れた作成**（溜めていた）は、応答がこれから届くので待ちを続ける
        // - **それより前の接続で送った作成**は、応答が前の接続と一緒に失われた。降ろさないと、作るボタンが止まったまま戻らない
        if (pendingCreateConnRef.current !== openCountRef.current) settleCreate();
        // 呼びかけの受け付けも、前の接続と一緒に失われた（#677）。待ちを降ろして送り直せるようにする
        settleCall();
        settlePassphrase();
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
  }, [initialCode, initialHref, resumeIfPossible, checkIfNeeded, send, cancelRetry, rateLimited, resetRetry, rememberRoomName, settleCreate, settleCall, settlePassphrase]);

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
      // どの接続で流れるかを控える（{@link pendingCreateConnRef}）。溜めたなら次に開く接続、その場で送ったならいまの接続。
      // 捨てたなら応答は来ないので待たない
      if (delivery === 'dropped') settleCreate();
      else pendingCreateConnRef.current = openCountRef.current + (delivery === 'queued' ? 1 : 0);
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

  const setPassphrase = useCallback(
    (passphrase: string) => {
      // 呼びかけの受け付けを待つ間と、設定の応答を待つ間は送らない（エラーの持ち主を取り違えない）
      if (pendingCallRef.current !== null || pendingPassphraseRef.current) return;
      setPassphraseError(null);
      pendingPassphraseRef.current = true;
      setSettingPassphrase(true);
      // 溜められた・捨てられた送信の応答は、この接続には来ない。繋ぎ直しで降ろす（溜めたものは流れるので、応答は来る）
      if (send(passphraseCommand(passphrase)) === 'dropped') settlePassphrase();
    },
    [send, settlePassphrase],
  );

  const callRoom = useCallback(
    (tool: string) => {
      // 待っている呼びかけがあれば送らない（画面のボタンも止めるが、クリック以外の送信経路はここで止める）
      // 合言葉の設定の応答を待つ間も送らない（エラーの持ち主を取り違えない）
      if (pendingCallRef.current !== null || pendingPassphraseRef.current) return;
      setCallError(null);
      pendingCallRef.current = tool;
      setCalling(true);
      // **その場で送れたときだけ送ったことにする**（溜めない）。閉じかけ・確立前の接続へ送ると溜められ、繋ぎ直しで
      // `room.join` より先に流れて NOT_IN_ROOM になる（呼んだ人は移らず、ほかの人にだけ知らせが届く順にもなる）。
      const sent = connRef.current?.sendIfOpen(callCommand(tool) as unknown as Record<string, unknown>) ?? false;
      if (!sent) {
        settleCall();
        setCallError('接続し直しています。もう一度押してください。');
      }
    },
    [settleCall],
  );

  const dismissRoomCall = useCallback(() => setRoomCall(null), []);

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
    // 名簿が届くまで・印の無い名簿（古いサーバー）は null（まだ分からない）。false と取り違えると、付いている合言葉を黙って上書きする。
    passphraseProtected: roster?.passphraseProtected ?? null,
    passphraseError,
    settingPassphrase,
    roomCall,
    calling,
    callError,
    connection,
    creating,
    createRoom,
    joinRoom,
    forgetRoomName,
    setPassphrase,
    callRoom,
    dismissRoomCall,
  };
}
