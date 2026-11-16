/**
 * ルーム画面の入口と入室（#369 Task 9。`pages/RoomPage.tsx` の効果をここへ移した）。
 *
 * 画面は同期の手順を持たない（`docs/adr/0015`）。ルーム画面が `roomId` を知った後に要る
 * 次の手順をここに持つ。**何をするかの分岐は `../room-entry-plan.ts`（純粋判断）が持ち、
 * ここは効果の配線（いつ走るか・取り消し・状態の持ち手）だけを持つ**（#595）。
 *
 * - 端末に同一性が無ければ玄関の参加画面へ送り返す
 * - 保存済みの組で、接続が開くたびに 1 回だけ入り直す
 * - 混雑で弾かれたら、待ってから入り直す（待ち方は `join-retry-plan.ts`）
 * - 消えたルームの組を捨てる
 *
 * **混雑の入り直しは `@tasuki/web-kit/sync` の `useJoinRetry` に寄せていない。** poker の待ちは
 * 拒否 1 回（`sync.error` の値）に結び付いていて、エラーが変わると畳まれる（状態が届いた・
 * 利用者が閉じた）。案内も「送り直す名前があるか」で変わる。どちらも `useJoinRetry` の形と違い、
 * 寄せると振る舞いが変わる（`tests/room-page-join-retry.test.tsx` が固定している）。
 */
import { useEffect, useRef, useState } from 'react';
import { planJoinRetry } from './plan-join-retry';
import {
  decideAutoRejoin,
  decideEntryRedirect,
  decideRetryAction,
  isRateLimited,
  shouldForgetIdentity,
  shouldResetRetry,
} from '../room-entry-plan';
import { hubPathFor, redirectTo } from '../router';
import type { PokerSync } from './useSync';

export interface RoomEntry {
  /** 混雑で弾かれている間の案内（無ければ null）。 */
  readonly retryNotice: string | null;
}

export function useRoomEntry(sync: PokerSync, roomId: string): RoomEntry {
  // 効果の依存に `sync` そのものを入れないための持ち手（混雑の入り直しの効果）。
  const syncRef = useRef(sync);
  syncRef.current = sync;

  // 抜けた・外された（別のタブ・別のツールの操作でも届く）は、理由を持って玄関へ戻る（#427）。
  // 復帰の組と接続は同期フックが片付けてある。**帯に出して留まると「押せるのに効かない」画面になる。**
  const departed = sync.departed;
  useEffect(() => {
    if (departed !== null) redirectTo(hubPathFor(roomId, departed));
  }, [departed, roomId]);

  // 入口: 端末に同一性が無ければ、**玄関の参加画面へ送り返す**（#95 S5c・R9）。
  //
  // **接続を待たない。** timer は同じ決定を mount 時の効果で、接続状態を見ずに適用する
  // （`apps/timer-web/src/sync/use-timer-sync.ts` の入口の効果）。ここだけ WS の確立を
  // 待つと、同じ URL の形に対して 2 つの道具の挙動が割れるうえ、サーバーが落ちている間は
  // 入室を試みられないのに「ルームに参加しています」を見せ続けることになる。
  //
  // 名乗る場所はハブに 1 つだけあり、ここでもう一度聞かない。**コードは落とさない**
  // —— 落とすと、招待リンクやブックマークから来た人が入りたかったルームを失う。
  //
  // **不在は名乗る前に分かる。** 玄関は、復帰の組を持たない人のために接続と同時に
  // ルームの生死を尋ね、見つからなければ名乗りフォームを出さずに知らせる
  // （`apps/landing/src/hub/use-hub-sync.ts` と `screens/RoomGone.tsx`・#76 J-1）。
  // ここへ送り返した人は、その判定を玄関側で受ける。
  //
  // 守りが 1 つ要る（`decideEntryRedirect`）: `room-not-found` を受けると下の効果が
  // `forgetIdentity` で保存を捨てるので、そのまま走り直すと**消滅の案内を出す前に玄関へ飛ぶ**。
  //
  // 続けて、保存済みトークンでの自動復帰（US4 / FR-013）。接続が開くたびに 1 回だけ試みる。
  // 保存が無い＝まだ名乗っていない人は、上の判断が玄関へ送っているので、ここは何もしない。
  const entryAppliedRef = useRef(false);
  const attemptedRef = useRef(false);
  useEffect(() => {
    const errorCode = sync.error?.code;
    const entry = decideEntryRedirect(
      entryAppliedRef.current,
      errorCode,
      () => sync.storedIdentity(roomId) !== null,
    );
    entryAppliedRef.current = entry.applied;
    if (entry.redirect) redirectTo(hubPathFor(roomId));

    const rejoin = decideAutoRejoin({
      status: sync.status,
      attempted: attemptedRef.current,
      joinedThisConnection: sync.joinedThisConnection,
      errorCode,
      stored: () => sync.storedIdentity(roomId),
    });
    attemptedRef.current = rejoin.attempted;
    if (rejoin.join) sync.joinRoom(roomId, rejoin.join.displayName, rejoin.join.resumeToken);
  }, [sync, roomId]);

  // 混雑で弾かれたら、待ってから入り直す（#147）。
  //
  // #103 でレート制限が IP 単位になり、同一 NAT の利用者はバケツを共有する。
  // バースト容量を超えた人は `rate-limited` を受けるが、上の `attemptedRef` は
  // 接続ごとに 1 回しか試みないため、**接続済み・未入室のまま滞留**していた。
  // **即時に送り直してはならない** — 待ち時間とばらつきは join-retry.ts が決める。
  const rateLimitAttemptRef = useRef(0);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);

  // 入室できたら・接続し直したら数え直す（`shouldResetRetry`）。前の接続で諦めていても、
  // 新しい接続では改めて入り直しを試みてよい。これが無いと、回線が切れて戻ってきた新しい接続で、
  // 一度も再試行しないまま諦め表示に戻る。
  const wasJoinedRef = useRef(false);
  const wasOpenRef = useRef(sync.status === 'open');
  useEffect(() => {
    const isOpen = sync.status === 'open';
    if (
      shouldResetRetry({
        joinedThisConnection: sync.joinedThisConnection,
        wasJoinedThisConnection: wasJoinedRef.current,
        isOpen,
        wasOpen: wasOpenRef.current,
      })
    ) {
      rateLimitAttemptRef.current = 0;
      setRetryNotice(null);
    }
    wasJoinedRef.current = sync.joinedThisConnection;
    wasOpenRef.current = isOpen;
  }, [sync.joinedThisConnection, sync.status]);

  useEffect(() => {
    // **依存は `sync.error` だけにする。** `sync` そのものを依存に置くと、
    // 再接続で `status` などが変わるたびに効果が畳まれて張り直され、
    // **一度も送り直さないまま試行回数だけを使い切る**（#147 の敵対的検証で判明）。
    // `sync.error` はエラーごとに新しいオブジェクトなので、1 回の拒否につき 1 回走る。
    const errorCode = sync.error?.code;
    // 消滅したルームのトークンは破棄する（再試行ループ防止）
    if (shouldForgetIdentity(errorCode)) syncRef.current.forgetIdentity(roomId);
    if (!isRateLimited(errorCode)) return;
    const stored = syncRef.current.storedIdentity(roomId);
    // **保存が消えていることがある。** 同じ端末の別のタブが、消滅したルームの
    // トークンを捨てる（上の `forgetIdentity`）と、この画面の足元から名乗りが消える。
    // 送り直す名前を持たないのに「入り直しています」と出すと、画面の言うことが嘘になる。
    const name = stored?.displayName ?? null;
    const plan = planJoinRetry(rateLimitAttemptRef.current, name !== null);
    setRetryNotice(plan.notice);
    // 使い切った。**数え直さない**（数え直すと諦めたはずが送り続ける形になる）。
    if (plan.kind === 'give-up') return;
    rateLimitAttemptRef.current = plan.attempt;
    const timer = setTimeout(() => {
      const s = syncRef.current;
      const action = decideRetryAction(name, stored?.resumeToken);
      if (action.kind === 'join') s.joinRoom(roomId, action.displayName, action.resumeToken);
      else s.checkRoom(roomId);
    }, plan.delayMs);
    return () => clearTimeout(timer);
  }, [sync.error, roomId]);

  return { retryNotice };
}
