/**
 * デスクトップ OS 通知（背面タブ時のみ）。
 *
 * 交代時、タブが前面なら音＋全画面オーバーレイで足りるため OS 通知は出さない。
 * タブが隠れている（document.hidden）ときだけ OS 通知を出して気づかせる。
 * 個人設定（NotifyPreferences.osNotify）が ON のときに use-switch-alert から呼ばれる。
 */

import type { NotifyPreferences } from "../prefs/local-prefs.js";

/** 通知許可を要求する（設定 ON 時に一度だけ呼ぶ）。granted なら true。 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/**
 * 通知を ON にした変更なら OS 通知許可を要求し、granted を返す。
 * それ以外（enabled が ON に変わっていない、または osNotify が OFF）は null を返す。
 * NotifySettings と Lobby の両方で使い、許可要求ロジックを DRY に保つ。
 */
export async function requestPermissionIfEnabling(
  patch: Partial<NotifyPreferences>,
  next: NotifyPreferences,
): Promise<boolean | null> {
  if (patch.enabled === true && next.osNotify) {
    return requestNotificationPermission();
  }
  return null;
}

/** 背面タブ時のみ OS 通知を出す。許可が無い/前面/未対応では何もしない。 */
export function notifyDriverChange(driverName: string): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  if (typeof document === "undefined" || document.hidden !== true) return;
  try {
    new Notification("あなたの番です！", {
      body: `${driverName} さん、ドライバーに交代しました`,
      icon: "/icon.png",
    });
  } catch {
    /* 無視 */
  }
}
