/**
 * `room.join` の答えを待つ期限（#292。#369 Task 10 で `use-timer-sync.ts` から分けた）。
 *
 * **これが無いと、繋がっているのにサーバーが答えない場合に無言で永久に待つ。**
 * 切断なら `onDisconnected` がバナーを出し、棄却・退出・混雑もそれぞれ表示を持つが、
 * **無応答だけがどこにも現れなかった**（`@tasuki/sync-client` のタイマーは再接続用の
 * 1 つだけで、応答が来ないことを測る場所がどこにも無い）。
 *
 * 混雑の入り直し（`@tasuki/web-kit/sync` の `useJoinRetry`）とは別物で、あちらは
 * 「待ってから送り直す」、こちらは「送ってから諦める」を測る。
 *
 * 返す関数は描画をまたいで同じものなので、effect の依存に入れてよい。
 */
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * `room.join` を送ってから諦めるまでの待ち時間（#292・利用者が承認した値）。
 *
 * **混雑の待ち（`joinRetryDelayMs`）より短くてよい。** あちらは最大 30 秒＋ばらつきで
 * この値を必ず超えるが、混雑は「待てば入れる」経路で、届いた拒否ごとにこの期限を
 * 畳んでいる（`retry-later` の分岐）。期限が測るのは**入り直しを送ってからの沈黙**である。
 */
export const JOIN_RESPONSE_DEADLINE_MS = 10_000;

export interface JoinDeadline {
  /** 期限が切れた（または、待っても入れないと確定した）。 */
  readonly timedOut: boolean;
  /**
   * 期限を張り直す。**`room.join` を送った直後に呼ぶ**（送る前ではない）。
   *
   * ⚠ **コールバックの中で closure の値を読まない**（#283）。`setTimeout` のクロージャは
   * 「送る時点」の値を捕まえるので、ここで `room` や `mode` を見ると、発火時には
   * とうに古くなっている。立てるのは setter だけにして、畳む判断は呼び出し側の各ハンドラが持つ。
   */
  readonly arm: () => void;
  /** 待つのをやめる（＝先へ進めた・もう待つ相手が居ない）。印も降ろす。 */
  readonly cancel: () => void;
  /**
   * **待っても入れないと確定した。期限の発火を待たずに印を立てる**（#292 のレビュー）。
   *
   * 混雑の入り直しを使い切った枝は、**期限を張り直す相手（送信）が無い**。
   * ここで印を立てないと、諦めのバナーは出るのに本文は「読み込んでいます…」のままで、
   * もう入れないのに待っているように見え、次にできることも出ない（EARS 1 の穴）。
   * さらに 10 秒待ってから同じ表示を出す理由は無いので、その場で立てる。
   */
  readonly giveUp: () => void;
}

export function useJoinDeadline(): JoinDeadline {
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 期限のタイマーだけを片付ける。**印（`timedOut`）には触らない。** */
  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    clearTimer();
    // 畳むときは印も降ろす。残すと、次にこの受け皿へ戻ってきた人（退出後の遷移待ち・
    // 別ルームへの入り直し）が、いきなり行き止まりの画面を見る。
    setTimedOut(false);
  }, [clearTimer]);

  const giveUp = useCallback(() => {
    clearTimer();
    setTimedOut(true);
  }, [clearTimer]);

  const arm = useCallback(() => {
    clearTimer();
    setTimedOut(false);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setTimedOut(true);
    }, JOIN_RESPONSE_DEADLINE_MS);
  }, [clearTimer]);

  // unmount 時にタイマーを掃除する（残すと setState-on-unmounted になる）。
  useEffect(() => clearTimer, [clearTimer]);

  return { timedOut, arm, cancel, giveUp };
}
