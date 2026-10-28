// WS 接続とルーム状態の購読（T012 骨格 → T021 → T045 で拡張）
//
// **接続そのものは `@tasuki/sync-client` が持つ**（#95 S5b・D18）。接続はアプリ生存期間で
// 1 本、切断時は指数バックオフで自動再接続（US4）という性質は変わらない —— 保持・再接続・
// 送信キューの実装を、ハブ・timer と同じ 1 つへ寄せた。ここに残るのは poker の語彙
// （メッセージの振り分けと画面の状態）だけである。
//
// **送信キューをここに持たないこと。** 確立前のコマンドは `SyncConnection` が 1 つの
// キューで溜めており、ここにもう 1 つ置くと同じコマンドが 2 回出る。
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SyncConnection,
  buildInviteUrl,
  buildSyncUrl,
  clearResumeIdentity,
  loadResumeIdentity,
  planForJoinError,
  saveResumeIdentity,
  type ConnectionStatus,
  type ResumeIdentity,
} from '@tasuki/sync-client';
import {
  DEFAULT_ERROR_MESSAGE,
  isKnownErrorCode,
  parseServerMessage,
  type Card,
  type ClientMessage,
  type ErrorCode,
  type NumberCardValue,
  type RoomStateMessage,
} from '@tasuki/poker-core';
import { parseBoundaryMessage } from '@tasuki/protocol';
import type { DepartureReason } from '@tasuki/room-core';
import { TopicFrameSchema, type Topic } from '@tasuki/topic-core';

/** 接続状態（正本は `@tasuki/sync-client`。#369）。 */
export type { ConnectionStatus };

export function wsUrl(): string {
  // **入口は玄関と同じ `/ws` で、ツールはクエリが宣言する**（#95 S5c）。
  return buildSyncUrl(location, 'poker');
}

export interface SyncError {
  /**
   * サーバーが増やした未知のコードは `null`（#214・docs/poker/adr/0003 決定 2）。
   *
   * 受信の契約は前方互換のため任意の非空文字列を通すが、**画面が意味を知っているのは
   * `ERROR_CODES` に載っているものだけ**である。`as ErrorCode` で通すと、
   * `ErrorCode` を名乗る嘘の値が画面の分岐へ流れる。
   */
  code: ErrorCode | null;
  message: string;
}

/**
 * poker の画面が同期から受け取るもの。
 *
 * **`self`（`joined` 受信後の自分の識別情報）と型 `SelfIdentity` はここに無い**（#272）。
 * 読み手だった「作成 → 遷移」の効果が #95 S5c（#249）の旧入口撤去で消えたためである。
 * `joined` の中身は端末の同一性（`saveResumeIdentity`）としてだけ使う。
 */
export interface PokerSync {
  status: ConnectionStatus;
  /** この画面で一度でも接続が確立したか（繋がらない/切れたの区別に使う。#76 F-2） */
  everConnected: boolean;
  /** 直近の接続確立以降、連続して接続に失敗した回数 */
  failedAttempts: number;
  /** 最新の受信者別ルーム状態（受信スナップショットで丸ごと置換。research R1） */
  snapshot: RoomStateMessage | null;
  /**
   * いまのお題（#91・spec §5.5）。**poker は読むだけ**（spec T4）。
   *
   * `topic` フレームは poker の契約をまたぐ（`@tasuki/topic-core` のスキーマで検める）ので、
   * `snapshot` とは別に持つ。null = お題なし（既定）。
   */
  topic: Topic | null;
  /**
   * 現在の WS 接続で joined を受信済みか。再接続するとサーバー側は未 join に戻るため、
   * 自動再入室の判定はこのフラグで行う（古い snapshot では判定しない）
   */
  joinedThisConnection: boolean;
  /** 直近のエラー（room-not-found はページ側で専用表示にする。FR-015） */
  error: SyncError | null;
  /**
   * 契約に合わないフレームを捨てて以降、契約を満たすフレームを 1 通も受け取っていない（#212）。
   * 接続は生きているので `status` では表せない。告知の `stale` に使う。
   */
  syncStale: boolean;
  clearError: () => void;
  /**
   * 抜けた・外された理由（無ければ `null`。#427）。
   *
   * 別のタブ・別のツールの操作でも届く（サーバーは同じ人の全接続へ送る）。立ったら
   * 復帰の組を捨てて接続を畳んであるので、画面は理由を持って玄関へ戻る。
   */
  departed: DepartureReason | null;
  /**
   * その部屋に保存してある復帰の組（無ければ `null`）。
   *
   * **端末の保存を読むのはこのフックの仕事である。** 画面（`.tsx`）が触ってよいのは
   * 同期フックと純粋判断だけで、同期クライアントを直接 import しない
   * （`docs/guides/architecture.md` の層の対応表・`docs/adr/0015`）。
   */
  storedIdentity: (roomId: string) => ResumeIdentity | null;
  /** その部屋の復帰の組を捨てる（消滅したルームへの再試行ループを防ぐ）。 */
  forgetIdentity: (roomId: string) => void;
  /**
   * その部屋の参加用 URL（配るもの）。**選択画面の URL である**（#95 D11）。
   *
   * 組み立ては `@tasuki/sync-client` に 1 つだけあり、**それを取り込むのはこのフックの
   * 仕事である** —— 画面（`.tsx`）は同期クライアントを直接 import しない
   * （`docs/guides/architecture.md` の層の対応表・`docs/adr/0015`）。
   */
  inviteUrl: (roomId: string) => string;
  joinRoom: (roomId: string, name: string, token?: string) => void;
  /** 参加する前にルームの生死だけを尋ねる（#76 J-1）。無ければ room-not-found が返る */
  checkRoom: (roomId: string) => void;
  vote: (card: Card) => void;
  reveal: () => void;
  /** いま見積もっているアイテムの名前を決める（#93） */
  setItem: (item: string) => void;
  /** 同じアイテムをもう一度投票する（#93） */
  revote: () => void;
  /** 次のアイテムへ進む。開票した回のポイント（任意）を添える（#93） */
  nextItem: (points: NumberCardValue | null) => void;
  /** 記録済みのアイテムのポイントを直す（#93） */
  setPoints: (groupId: number, points: NumberCardValue | null) => void;
  /** 見積もりの記録を始める・止める。ルーム全員に効く（#427・設計 D） */
  setRecording: (recording: boolean) => void;
  /** 閉じた束の名前を直す（#427・設計 E） */
  renameGroup: (groupId: number, item: string) => void;
  /** 自分の見学を切り替える。true で投票の輪から外れ、false で加わる（#419） */
  setSpectator: (spectator: boolean) => void;
  /** 接続の無い他人を一覧から外す（#419）。サーバーは接続中の人・自分を拒む */
  removeParticipant: (participantId: string) => void;
  /** 隠しモードのテーブルの席に着く・離れる（#403）。入口が true、テーブルの「閉じる」が false を送る */
  setTableSeat: (seated: boolean) => void;
  /** テーブルの席の全員へ配る（#403）。配るのはサーバーで、ここは頼むだけ */
  dealHands: () => void;
  /** テーブルの手を全員へ見せる（#403） */
  showHands: () => void;
}

export function usePokerSync(): PokerSync {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [snapshot, setSnapshot] = useState<RoomStateMessage | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [joinedThisConnection, setJoinedThisConnection] = useState(false);
  const [error, setError] = useState<SyncError | null>(null);
  const [departed, setDeparted] = useState<DepartureReason | null>(null);
  // 契約に合わないフレームを捨てて以降、契約を満たすフレームを受け取っていない（#212）。
  const [syncStale, setSyncStale] = useState(false);
  // 「一度も繋がっていない」と「使えていたのに切れた」は利用者への伝え方が違う（#76 F-2）
  const [everConnected, setEverConnected] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const connectionRef = useRef<SyncConnection | null>(null);
  /** joined 時に識別情報を保存するため、直近の join の名前を控える */
  const pendingNameRef = useRef<string>('');
  /** 直近に入ろうとした（入った）部屋。`error` のフレームは部屋を名指ししないので、ここから引く。 */
  const currentRoomRef = useRef<string | null>(null);

  useEffect(() => {
    const connection = new SyncConnection({
      url: wsUrl(),
      // **再接続の待ち時間は公開以来の値を保つ**（#95 S5b）。接続の実装を
      // `@tasuki/sync-client` へ寄せたが、**既定（1 秒 / 上限 30 秒）をそのまま受けると
      // poker だけ再接続が最大 6 倍遅くなる**。実装の共有と、利用者が体感する待ち時間の
      // 変更は別の判断である（値の統一は根拠を測ってから別途決める）。
      backoff: { initialDelayMs: 500, maxDelayMs: 5_000 },
      onOpen: () => {
        setStatus('open');
        setEverConnected(true);
        setFailedAttempts(0);
      },
      onClose: () => {
        setStatus('closed');
        setFailedAttempts((n) => n + 1);
        // 新しい接続はサーバー側で未 join 状態から始まる（再入室は `useRoomEntry` が行う）
        setJoinedThisConnection(false);
        // 捨てたフレームの告知も前の接続のものなので畳む（#212）。
        // 残すと、**1 通も受け取っていない新しい接続に対して**警告が出続ける。
        setSyncStale(false);
      },
      onMessage: (raw) => handleMessage(raw),
    });
    connectionRef.current = connection;
    setStatus('connecting');
    connection.connect();
    return () => {
      connection.dispose();
      connectionRef.current = null;
    };
    // 依存は空。**接続はアプリ生存期間で 1 本**である（張り直すと入室からやり直しになる）。
  }, []);

  function handleMessage(raw: string): void {
    // **お題のフレームは poker の契約より先に見分ける**（#91・spec §5.5）。
    // 順を逆にすると `parseServerMessage` が落とし、#212 の告知（同期できていません）が立つ。
    const topicFrame = parseBoundaryMessage(TopicFrameSchema, raw);
    if (topicFrame.isOk()) {
      setTopic(topicFrame.value.state.topic);
      return;
    }

    const result = parseServerMessage(raw);
    if (result.isErr()) {
      // 境界検証に失敗したフレームは画面へ渡さない（憲法原則 IV）。
      //
      // **捨てたことは必ず利用者へ伝える（#212）。** 黙って捨てると、画面は生きて
      // 見えたまま古い状態で固まり、利用者には原因が分からない。
      //
      // **どのフレームを捨てたかで態度を変えない。** 落ちた項目の経路から
      // 「一過性の棄却」を選り分ける案は採らなかった（`docs/poker/adr/0002` 決定 2 に
      // 実測を記録）。そもそも**捨てて無害なフレームは 1 つも無い** ——
      // `room-state` を捨てれば画面が固まり、`joined` を捨てれば入室が成立せず、
      // `error` を捨てれば消えたルームの案内（#76 J-1）も入室の再試行（#147）も起きない。
      console.warn('契約に合わないサーバーメッセージを捨てました'); // log-hygiene:allow 固定の文言のみ（経路も値も出さない）
      setSyncStale(true);
      return;
    }
    // 契約を満たすフレームが届いた＝サーバーとの間で話が通じている。
    // **poker に定期的なデータフレームは無い**ので、ここで解除しても点滅しない
    // （死活監視は WS の制御フレーム ping で、`onmessage` には来ない）。
    setSyncStale(false);
    const msg = result.value;
    switch (msg.type) {
      case 'joined':
        setJoinedThisConnection(true);
        currentRoomRef.current = msg.roomId;
        // **端末に置く同一性は 4 つの画面で 1 つ**（#95 S5b・D12）。選択画面で名乗った人が
        // poker でも同じ人として扱われるのは、同じ鍵を読み書きしているからである。
        saveResumeIdentity({
          code: msg.roomId,
          participantId: msg.participantId,
          resumeToken: msg.token,
          displayName: pendingNameRef.current,
        });
        break;
      case 'room-state':
        setSnapshot(msg);
        setError(null); // 正常な状態受信で過去のエラーは解消したとみなす
        break;
      case 'error': {
        // 抜けた・外された（別のタブの操作でも届く）は帯に出さず、組を捨てて接続を畳み、
        // 理由を持って玄関へ戻る（#427。topic・roulette の共通フックと同じ判断）。
        // **畳まないと「押せるのに効かない」画面が残る。**
        const plan = planForJoinError(msg.code, msg.message, DEFAULT_ERROR_MESSAGE);
        if (plan.kind === 'left') {
          if (currentRoomRef.current !== null) clearResumeIdentity(currentRoomRef.current);
          connectionRef.current?.dispose();
          setJoinedThisConnection(false);
          setDeparted(plan.reason);
          break;
        }
        // 未知のコードは畳む。意味を知らないコードから専用画面や再試行を起こすと、
        // 無関係な対処へ利用者を誘導することになる（docs/poker/adr/0003 決定 2）。
        // 文言はサーバーのものを使う —— 未知のコードの意味を知るのは向こうだけである。
        setError({
          code: isKnownErrorCode(msg.code) ? msg.code : null,
          // **空白だけの message も空の箱になる。** `v.string()` は空文字も
          // 空白のみの文字列も通すので、見た目で空になるものをまとめて逃がす。
          message: msg.message.trim() === '' ? DEFAULT_ERROR_MESSAGE : msg.message,
        });
        break;
      }
    }
  }

  // アクションは ref と安定な setter しか参照しないため一度だけ生成する
  // （メッセージ受信のたびにコールバック群が新品になり、子のメモ化や effect を無駄に動かすのを防ぐ）
  const actions = useMemo(() => {
    // 確立前のコマンドは `SyncConnection` が溜めて `onopen` で流す（キューは 1 つだけ）。
    const send = (msg: ClientMessage) => connectionRef.current?.send(msg);
    return {
      clearError: () => setError(null),
      storedIdentity: (roomId: string) => loadResumeIdentity(roomId),
      forgetIdentity: (roomId: string) => clearResumeIdentity(roomId),
      inviteUrl: (roomId: string) => buildInviteUrl(location.origin, roomId),
      joinRoom: (roomId: string, name: string, token?: string) => {
        pendingNameRef.current = name;
        currentRoomRef.current = roomId;
        setError(null);
        send({ type: 'join-room', roomId, name, ...(token !== undefined ? { token } : {}) });
      },
      // 照会は状態を変えないので、過去のエラーもリセットしない
      checkRoom: (roomId: string) => send({ type: 'check-room', roomId }),
      vote: (card: Card) => send({ type: 'vote', card }),
      reveal: () => send({ type: 'reveal' }),
      setItem: (item: string) => send({ type: 'set-item', item }),
      revote: () => send({ type: 'revote' }),
      nextItem: (points: NumberCardValue | null) => send({ type: 'next-item', points }),
      setPoints: (groupId: number, points: NumberCardValue | null) => send({ type: 'set-points', groupId, points }),
      setRecording: (recording: boolean) => send({ type: 'set-recording', recording }),
      renameGroup: (groupId: number, item: string) => send({ type: 'set-group-item', groupId, item }),
      setSpectator: (spectator: boolean) => send({ type: 'set-spectator', spectator }),
      removeParticipant: (participantId: string) => send({ type: 'remove-participant', participantId }),
      setTableSeat: (seated: boolean) => send({ type: 'table-seat', seated }),
      dealHands: () => send({ type: 'table-deal' }),
      showHands: () => send({ type: 'table-show' }),
    };
  }, []);

  return useMemo(
    () => ({
      status,
      everConnected,
      failedAttempts,
      snapshot,
      topic,
      joinedThisConnection,
      error,
      departed,
      syncStale,
      ...actions,
    }),
    [
      status,
      everConnected,
      failedAttempts,
      snapshot,
      topic,
      joinedThisConnection,
      error,
      departed,
      syncStale,
      actions,
    ],
  );
}
