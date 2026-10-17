/**
 * 休憩の知らせ（#402 設計 §5.6）。snapshot の休憩の状態の変化から、チャイム・振動・OS 通知を出す。
 * 入った・終わった・（知らせるだけで）知らせた、の 3 つ。個人設定 `notify.enabled` で止まる。
 * シグナルではなく snapshot から導くので、交代と同じ snapshot で休憩に入っても取りこぼさない。
 *
 * **「知らせた」の契機は、知らせた時点の稼働の累計（`suggestedAtElapsedMs`）が新しい値に変わったこと**
 * （PR #416 の再レビュー）。帯の真偽の変化を見ていたときは、1 人の輪などの現状維持の交代で回数が進まず、
 * 2 回目以降の知らせで帯が出たままになって何も鳴らなかった。初回の描画（休憩中・知らせた後の再接続）では
 * 前の値を今の値で始めるので鳴らない。
 */

import { useEffect, useRef } from "react";
import { playChime, vibrateSwitch } from "../platform/sound.js";
import { notifyBreak } from "../platform/notify.js";
import type { NotifyPreferences } from "../prefs/local-prefs.js";
import { BREAK_TEXT } from "./break-view.js";
import { isDriverSwitch, type DriverMark } from "./session-view.js";

export function useBreakAlert(
  since: number | null,
  suggestedAtElapsedMs: number | null,
  /** いまの運転者。知らせが交代と重なったか（交代のチャイムが鳴るか）を判定する */
  driver: DriverMark,
  notify: NotifyPreferences,
): void {
  const prevSinceRef = useRef(since);
  const prevSuggestedRef = useRef(suggestedAtElapsedMs);
  const prevDriverRef = useRef(driver);
  const { index, name } = driver;
  useEffect(() => {
    const started = prevSinceRef.current === null && since !== null;
    const ended = prevSinceRef.current !== null && since === null;
    const suggested = suggestedAtElapsedMs !== null && suggestedAtElapsedMs !== prevSuggestedRef.current;
    // 交代の知らせ（use-switch-alert）と同じ判定。真のときだけ交代のチャイムが鳴る
    const driverSwitched = isDriverSwitch(prevDriverRef.current, { index, name });
    prevSinceRef.current = since;
    prevSuggestedRef.current = suggestedAtElapsedMs;
    prevDriverRef.current = { index, name };
    if (!(started || ended || suggested) || !notify.enabled) return;
    // 交代と同じ snapshot の「終わった」「知らせた」は、交代のチャイムが鳴るのでここでは鳴らさず・振動もしない
    // （休憩明けの繰り上げで終わりと交代が重なっても 1 回にする。#402）。休憩に入った知らせは交代と重なっても
    // 交代の知らせが止まる（suppressed）のでここで鳴らす。現状維持の交代（運転者が替わらない）で
    // 知らせたとき・運転者が同じまま休憩が終わったときは、交代のチャイムが無いのでここで鳴らす。
    if (started || !driverSwitched) {
      playChime(notify.soundId, notify.volume);
      vibrateSwitch();
    }
    if (notify.osNotify && (started || suggested)) notifyBreak(BREAK_TEXT.osNotifyTitle);
  }, [since, suggestedAtElapsedMs, index, name, notify.enabled, notify.soundId, notify.osNotify, notify.volume]);
}
