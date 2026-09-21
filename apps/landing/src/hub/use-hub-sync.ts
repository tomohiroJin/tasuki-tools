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
 * 2. 受信は `HubServerMsgSchema` で検める（**境界の検証**・原則 IV）。合わないフレームは捨てる
 * 3. `room.created` / `room.joined` を受けたら、復帰の組と既定の表示名を端末へ保存する
 * 4. 読み込み時、URL の `?room=` に対応する組があれば**名乗らずに復帰する**（R16）
 * 5. 再接続したら、保存済みの組で入り直す
 * 6. 合言葉を求められたら、画面に入力を促す
 * 7. 入室が混雑で弾かれたら、`joinRetryDelayMs` の間隔で自動的に試み直す
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SyncConnection,
  buildInviteUrl,
  clearResumeIdentity,
  joinRetryDelayMs,
  loadDefaultDisplayName,
  loadResumeIdentity,
  saveDefaultDisplayName,
  saveResumeIdentity,
} from '@tasuki/sync-client';
import { parseBoundaryMessage } from '@tasuki/protocol';
import { HubServerMsgSchema, type HubCommand, type RosterRoom } from '@tasuki/room-core';
import { readRoomParam } from './room-param.js';
import { usableDefaultDisplayName } from './default-display-name.js';


/** 同期サーバーへの URL。**ハブの入口は `/ws`** で、LP の base（`/`）直下にある。 */
export function buildHubSyncUrl(location: { protocol: string; host: string }): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}/ws`;
}

/**
 * timer 時代の設定の鍵（#284）。**読み手も書き手も #272 で消えた。**
 *
 * 中身（`{ displayName, language, difficulty, members[], intervalMinutes }`）のうち
 * `displayName` は `docs/adr/0011` の「個人に紐づく情報」に当たる。読む者が居ないなら、
 * 端末に置き続ける理由が無い。**移行はしない** —— 語彙も画面も入れ替わった値を
 * 引き写すより、一度名乗り直してもらうほうが確かである。
 */
const LEGACY_PREFERENCES_KEY = 'tdd-mob:preferences:v1';

/**
 * timer 時代の設定を落とす。**落とせなくても先へ進む。**
 *
 * 保管庫そのものが使えない端末がある（cookie を全面禁止した Chrome では**読むだけで**
 * `SecurityError` が飛び、容量超過では書き込みが投げる）。投げたまま外へ出すと、
 * 玄関が**画面ごと真っ白になる** ——「片付けができない」は利用者に見せる話ではない
 * （EARS 3）。
 *
 * **例外はここで飲み切る。** 呼び手をまとめて try で包まないのは、そうすると
 * **片付けの失敗が前回の名前を道連れにする**ためである（読み書きはできるのに消去だけが
 * 拒まれる端末では、名前は読めていたはずである）。読み書きの側は `@tasuki/sync-client` が
 * 自分で飲み込むので、生の保管庫操作はここだけになる。
 */
function dropLegacyPreferences(): void {
  try {
    localStorage.removeItem(LEGACY_PREFERENCES_KEY);
  } catch {
    // 使えない保管庫。落とせないだけで、名乗ること自体はできる
  }
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
  /** 直前のエラーの文言（無ければ null）。 */
  readonly error: string | null;
  /** 合言葉の入力を求められているか。 */
  readonly needsPassphrase: boolean;
  /** 接続の状態。 */
  readonly connection: 'online' | 'reconnecting';
  /**
   * いま映しているルームの参加用 URL（未参加なら null）。
   *
   * 組み立ては `@tasuki/sync-client` に 1 つだけあり、**それを取り込むのはこのフックの
   * 仕事である** —— 画面（`.tsx`）は同期クライアントを直接 import しない
   * （`docs/guides/architecture.md` の層の対応表・`docs/adr/0015`）。
   */
  readonly inviteUrl: string | null;
  createRoom(roomName: string, displayName: string): void;
  joinRoom(displayName: string, passphrase?: string): void;
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
  const [error, setError] = useState<string | null>(null);
  const [needsPassphrase, setNeedsPassphrase] = useState(false);
  const [connection, setConnection] = useState<'online' | 'reconnecting'>('online');
  /**
   * 読み込みの時点で端末に入っていた表示名（FR-053 / FR-054・#284）。
   *
   * **読むだけで、書かない。** 保管庫への書き込みは下の `useEffect` が受け持つ
   * （`App.tsx` の `readDepartureNotice` と同じ分け方 —— **初期化子に副作用を混ぜない**）。
   * ここに `removeItem` / `setItem` を混ぜると、`StrictMode` が初期化子を 2 度走らせる
   * テストと、`StrictMode` を持たない本番（`main.tsx`）とで**読む対象が変わりうる**。
   */
  const storedDisplayName = useMemo(() => loadDefaultDisplayName(), []);
  /**
   * 名乗りの欄の既定。**読むのは読み込みの 1 度だけ。**
   *
   * 以後の書き換えは画面側の `useState` が持つ（EARS 4）。ここを描画のたびに読み直すと、
   * 入力中の値を保存値で上書きしてしまう。
   */
  const defaultDisplayName = useMemo(
    () => usableDefaultDisplayName(storedDisplayName),
    [storedDisplayName],
  );

  /**
   * 端末の片付け（#284）。**片付け専用の経路は作らない**（憲法 原則 X）ので、
   * 玄関を開くたびに通るここへ 2 つを相乗りさせている:
   *
   * 1. **提示できない保存値を、その鍵ごと捨てる。** 残すと玄関を開くたびに同じ値で
   *    弾かれ続ける（`resume-identity.ts` の壊れた組と同じ扱い）
   * 2. timer 時代の設定（{@link LEGACY_PREFERENCES_KEY}）を落とす
   *
   * **捨てる以外の書き込みはしない**（#284 のレビュー所見 3）。提示できる値まで
   * 正規形で上書きすると、**利用者の保存値を黙って書き潰す**。`normalizeDisplayName` の
   * 巻き添え（`display-name.ts` の `LABEL_MARKER` が既知として挙げる
   * `"会社 (ID: 部署)"` → `"会社"`）を覚えている端末では、玄関を開いた瞬間に
   * 元の値が失われ、手で直す手掛かりごと消える。EARS 3 が求めているのは
   * 「**提示できない値を捨てる**」ことだけである。
   *
   * **何度走っても同じ結果になる。** することは「消す」だけで、消去は冪等である
   * （`StrictMode` は effect を 2 度走らせる）。
   */
  useEffect(() => {
    dropLegacyPreferences();
    // 空文字を渡すと鍵ごと消える（`saveDefaultDisplayName` の約束）。
    if (defaultDisplayName === "" && storedDisplayName !== "") saveDefaultDisplayName("");
  }, [storedDisplayName, defaultDisplayName]);

  const connRef = useRef<SyncConnection | null>(null);
  /**
   * 混雑で弾かれたときの再試行回数。**入室と照会で共有する。**
   *
   * **照会と入室は同時に飛びうる** —— 照会の返事を待つ間も名乗りフォームは操作でき、
   * 利用者が名乗ると両方の応答が別々に届く。その取り違えを防ぐのが `if (last === null)`
   * の判定である。
   *
   * それでも数え手が 1 本で足りるのは、**仕掛かる再試行が常に 1 本だけ**だから ——
   * `retryTimerRef` は単一で、積む前に必ず `cancelRetry()` を通す。`joinRoom` /
   * `createRoom` は利用者の操作として、仕掛かっていた再試行を先に取り消す。
   */
  const retryRef = useRef(0);
  /** 自動で入り直すときに使う、直近の名乗り。 */
  const lastJoinRef = useRef<{ displayName: string; passphrase?: string } | null>(null);
  /**
   * 再試行のタイマー。**利用者が自分で動いたら取り消す。**
   *
   * 待ち時間の間、名乗りフォームは操作できる（`screenFor` は `join` を返し続ける）。
   * 取り消さないと、**利用者が名乗った後に、名乗る前の状態を捕まえたタイマーが発火する**
   * —— 照会の再試行が幽霊のように飛び、`retryRef` の予算を入室と食い合う。
   */
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = useCallback((cmd: HubCommand) => {
    connRef.current?.send(cmd as unknown as Record<string, unknown>);
  }, []);

  /** 仕掛かっている再試行を取り消す。**利用者の操作が優先する。** */
  const cancelRetry = useCallback(() => {
    if (retryTimerRef.current === null) return;
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

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
    send({
      command: 'room.join',
      code: initialCode,
      displayName: saved.displayName,
      resumeToken: saved.resumeToken,
    });
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
    send({ command: 'room.check', code: initialCode });
  }, [initialCode, send]);

  useEffect(() => {
    const conn = new SyncConnection({
      url: buildHubSyncUrl(window.location),
      onMessage: (raw) => {
        // 境界の検証（原則 IV）。契約に合わないフレームは**捨てる** ——
        // 画面の状態を壊すより、更新されないほうが害が小さい。
        const parsed = parseBoundaryMessage(HubServerMsgSchema, raw);
        if (parsed.isErr()) return;
        const msg = parsed.value;

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
          retryRef.current = 0;
          // 作成したときは URL に `?room=` が無いので、履歴を汚さず差し替える。
          // **画面の側も同時に進める**（URL を書き換えても状態は追随しない）。
          if (msg.type === 'room.created') {
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
        if (msg.code === 'PASSPHRASE_REQUIRED' || msg.code === 'PASSPHRASE_MISMATCH') {
          setNeedsPassphrase(true);
          setError(msg.message);
          return;
        }
        if (msg.code === 'JOIN_RATE_LIMITED') {
          // 混雑で弾かれた人を、操作なしで先へ運ぶ（#147 と同じ方針）。
          const attempt = (retryRef.current += 1);
          const delay = joinRetryDelayMs(attempt);
          const last = lastJoinRef.current;
          const target = codeRef.current;
          if (delay === null || target === null) {
            setError(msg.message);
            return;
          }
          setError(msg.message);
          // **仕掛かっているタイマーを消してから積む。** 消さずに上書きすると、
          // 消えた側は `retryTimerRef` から外れたまま生き残り、`cancelRetry()` でも
          // 接続の後始末でも取り消せなくなる（最終レビュー I1）。
          cancelRetry();
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            // **`last === null` は「まだ名乗っていない」** ＝ 送ったのは照会だけである
            // （#274）。エラーのフレームに相関の手がかりが無いので、送った側の状態で
            // 見分ける。経路2 の人は復帰を送る前に `lastJoinRef` が埋まっている。
            if (last === null) {
              send({ command: 'room.check', code: target });
              return;
            }
            send({
              command: 'room.join',
              code: target,
              displayName: last.displayName,
              ...(last.passphrase !== undefined ? { passphrase: last.passphrase } : {}),
            });
          }, delay);
          return;
        }
        if (msg.code === 'ROOM_NOT_FOUND' && codeRef.current !== null) {
          // **保存済みの組で入れなかったら捨てる。** 残すと、消えたルームへ
          // 毎回入り直そうとして参加画面に戻れない（poker の clearIdentity と同じ扱い）。
          clearResumeIdentity(codeRef.current);
          // **名乗りフォームを出さない**（#274・#76 J-1）。照会の答えでも
          // 入室の答えでも、行き先は同じ画面である。
          setGone(true);
          // ここで返す。`error` を埋めると、不在の画面と参加画面用の文言が
          // 同じことを 2 通りの言い方で出すことになる。
          return;
        }
        setError(msg.message);
      },
      onOpen: () => {
        setConnection('online');
      },
      onConnectionChange: (state) => setConnection(state),
      onReconnected: () => {
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
  }, [initialCode, resumeIfPossible, checkIfNeeded, send, cancelRetry]);

  const createRoom = useCallback(
    (roomName: string, displayName: string) => {
      // **利用者が別の道を選んだ。** 仕掛かっていた再試行（照会の可能性がある）は
      // もう意味を持たないので取り消す。
      cancelRetry();
      lastJoinRef.current = { displayName };
      setError(null);
      send({ command: 'room.create', roomName, displayName });
    },
    [send, cancelRetry],
  );

  const joinRoom = useCallback(
    (displayName: string, passphrase?: string) => {
      if (code === null) return;
      // **利用者が自分で名乗った。** 待ち時間の間に仕掛かっていた再試行（名乗る前の
      // 状態を捕まえている）を取り消さないと、名乗った後に幽霊の照会が飛ぶ（#274）。
      cancelRetry();
      lastJoinRef.current = { displayName, ...(passphrase !== undefined ? { passphrase } : {}) };
      setError(null);
      retryRef.current = 0;
      send({
        command: 'room.join',
        code,
        displayName,
        ...(passphrase !== undefined ? { passphrase } : {}),
      });
    },
    [code, send, cancelRetry],
  );

  return {
    code,
    joined,
    resuming,
    gone,
    inviteUrl: code === null ? null : buildInviteUrl(window.location.origin, code),
    roster,
    defaultDisplayName,
    error,
    needsPassphrase,
    connection,
    createRoom,
    joinRoom,
  };
}
