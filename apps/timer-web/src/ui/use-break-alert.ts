/**
 * 休憩の知らせ（#402 設計 §5.6）。snapshot の休憩の状態の変化から、チャイム・振動・OS 通知を出す。
 * 入った・終わった・（知らせるだけで）知らせた、の 3 つ。個人設定 `notify.enabled` で止まる。
 * シグナルではなく snapshot から導くので、交代と同じ snapshot で休憩に入っても取りこぼさない。
 */

import { useEffect, useRef } from "react";
import { playChime, vibrateSwitch } from "../platform/sound.js";
import { notifyBreak } from "../platform/notify.js";
import type { NotifyPreferences } from "../prefs/local-prefs.js";
import { BREAK_TEXT } from "./break-view.js";

export function useBreakAlert(since: number | null, suggestedNow: boolean, notify: NotifyPreferences): void {
  const prevSinceRef = useRef(since);
  const prevSuggestedRef = useRef(suggestedNow);
  useEffect(() => {
    const started = prevSinceRef.current === null && since !== null;
    const ended = prevSinceRef.current !== null && since === null;
    const suggested = !prevSuggestedRef.current && suggestedNow;
    prevSinceRef.current = since;
    prevSuggestedRef.current = suggestedNow;
    if (!(started || ended || suggested) || !notify.enabled) return;
    playChime(notify.soundId, notify.volume);
    vibrateSwitch();
    if (notify.osNotify && (started || suggested)) notifyBreak(BREAK_TEXT.osNotifyTitle);
  }, [since, suggestedNow, notify.enabled, notify.soundId, notify.osNotify, notify.volume]);
}
