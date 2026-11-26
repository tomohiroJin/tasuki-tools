/**
 * 「長く続いたら通知する」の設定（#476・設計 §4 C6）。端末ごと・既定は切。
 *
 * - **許可を求めるのは、利用者が入にしたときだけ**。許可が下りなければ入にしない（拒まれたことを `denied` で知らせる）
 * - 設定は端末の `localStorage`（読み書きの失敗は `platform/notify.ts` が吸収する）。許可が取り消されていたら切として読む
 */
import { useCallback, useState } from 'react';
import {
  loadNotifyPreference,
  notificationGranted,
  notificationUnavailable,
  notificationSupported,
  requestNotificationPermission,
  saveNotifyPreference,
} from '../platform/notify';

export interface NotifySetting {
  readonly supported: boolean;
  readonly enabled: boolean;
  /** 許可を求めたが下りなかった（ブラウザの設定で拒まれている） */
  readonly denied: boolean;
  /** この端末では通知を作れないと分かった（以後トグルを出さず、文だけを出す） */
  readonly unavailable: boolean;
  /** 通知を作れなかった: 設定を切に戻し、トグルを下げる */
  markUnavailable(): void;
  toggle(): void;
}

export function useNotifySetting(): NotifySetting {
  const [enabled, setEnabled] = useState(() => loadNotifyPreference() && notificationGranted());
  const [denied, setDenied] = useState(false);
  const [unavailable, setUnavailable] = useState(() => notificationUnavailable());
  const markUnavailable = useCallback(() => {
    saveNotifyPreference(false);
    setEnabled(false);
    setUnavailable(true);
  }, []);

  const toggle = useCallback(() => {
    if (enabled) {
      saveNotifyPreference(false);
      setEnabled(false);
      return;
    }
    // 許可はここで初めて求める
    void requestNotificationPermission().then((granted) => {
      setDenied(!granted);
      saveNotifyPreference(granted);
      setEnabled(granted);
    });
  }, [enabled]);

  return { supported: notificationSupported() || unavailable, enabled, denied, unavailable, markUnavailable, toggle };
}
