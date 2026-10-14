/**
 * 参加のやり直し（#369 Task 4。お題・ルーレットの同期フックの写しを 1 つにした）。
 *
 * 混雑で参加を拒まれた（`JOIN_RATE_LIMITED`）ときに、待ってから送り直す。
 * **待つ時間と回数の上限は `@tasuki/sync-client` の `joinRetryDelayMs` が決める**（純粋な計画）。
 * このフックが持つのは、回数・予約したタイマー・知らせの文言だけである。
 *
 * - 予約は 1 つだけ。積む前に前の予約を捨てる（同じ接続へ入り直しが 2 通飛ばないように）
 * - 使い切ったら、諦めたと伝えて送らない
 * - 回数と知らせを戻すのは、入れたとき・繋ぎ直したとき（呼び出し側が `reset` を呼ぶ）
 * - 接続が切れたら予約を捨てる（呼び出し側が `cancel` を呼ぶ。待ちの分がキューに溜まらないように）
 *
 * 返す関数（`rateLimited`・`cancel`・`reset`）は描画をまたいで同じものなので、effect の依存に入れてよい。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { joinRetryDelayMs } from '@tasuki/sync-client';

/** 知らせの文言。アプリごとに言い方が違う（そろえるのは振る舞いの変更なので、ここでは受け取るだけ）。 */
export interface JoinRetryTexts {
  /** 待ってから入り直しているとき。 */
  readonly waiting: string;
  /** 試行を使い切ったとき。 */
  readonly exhausted: string;
}

export interface JoinRetry {
  /** 待っている・諦めた、の知らせ（無ければ null）。 */
  readonly notice: string | null;
  /**
   * 混雑で拒まれた。待ってから `resend` を呼ぶか、使い切っていれば諦める。
   * 送り直しを予約したら true、使い切って諦めたら false（知らせを持たない呼び出し側が出し分けに使う）。
   */
  readonly rateLimited: (resend: () => void) => boolean;
  /** 予約した送り直しを捨てる（知らせと回数はそのまま）。 */
  readonly cancel: () => void;
  /** 回数を戻し、知らせを下ろす（予約は捨てない）。 */
  readonly reset: () => void;
}

/**
 * @param texts 知らせの文言。**null なら知らせを持たない**（`notice` は null のまま。
 *   玄関は知らせの代わりにサーバーの文を見せるので、こちらを使う）。
 */
export function useJoinRetry(texts: JoinRetryTexts | null): JoinRetry {
  const [notice, setNotice] = useState<string | null>(null);
  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textsRef = useRef(texts);
  textsRef.current = texts;

  const cancel = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const reset = useCallback(() => {
    attemptsRef.current = 0;
    // 文言が無ければ知らせは null のまま。毎回の状態の届き（timer は snapshot ごと）で空の更新を積まない。
    if (textsRef.current !== null) setNotice(null);
  }, []);

  const rateLimited = useCallback(
    (resend: () => void): boolean => {
      const delay = joinRetryDelayMs((attemptsRef.current += 1));
      if (delay === null) {
        if (textsRef.current !== null) setNotice(textsRef.current.exhausted);
        return false;
      }
      if (textsRef.current !== null) setNotice(textsRef.current.waiting);
      cancel();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        resend();
      }, delay);
      return true;
    },
    [cancel],
  );

  // 外したときに予約を残さない。
  useEffect(() => cancel, [cancel]);

  return { notice, rateLimited, cancel, reset };
}
