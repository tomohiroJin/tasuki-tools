/**
 * 個人通知設定（NotifyPreferences）をライブ購読するフック。
 *
 * NotifySettings は StatusStrip 内に常時表示され、セッション中にも設定を変更できる。
 * 単純に loadNotifyPreferences() をマウント時に一度だけ読むと、変更が現在のセッションへ
 * 反映されない（Session の再マウントまで無効）。そこで保存時のカスタムイベント
 * （同一タブ）と storage イベント（別タブ）を購読して都度読み直し、即時反映する。
 */

import { useEffect, useState } from "react";
import {
  loadNotifyPreferences,
  NOTIFY_CHANGED_EVENT,
  type NotifyPreferences,
} from "../prefs/local-prefs.js";

export function useNotifyPreferences(): NotifyPreferences {
  const [prefs, setPrefs] = useState<NotifyPreferences>(() => loadNotifyPreferences());

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const reload = () => setPrefs(loadNotifyPreferences());
    // 同一タブの保存（NotifySettings）と別タブの storage 変更の両方で読み直す。
    window.addEventListener(NOTIFY_CHANGED_EVENT, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(NOTIFY_CHANGED_EVENT, reload);
      window.removeEventListener("storage", reload);
    };
  }, []);

  return prefs;
}
