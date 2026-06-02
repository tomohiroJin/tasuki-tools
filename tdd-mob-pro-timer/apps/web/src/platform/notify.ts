/**
 * @deprecated 未配線（将来枠）。デスクトップ通知/振動は spec の必須要件ではなく
 * （状態変化は画面更新＋aria-live で伝達: FR-035）、App から未参照。導入する場合は
 * Session の交代検知から notifyDriverChange を呼び、初回に requestNotificationPermission する。
 *
 * 通知・振動
 */

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function notifyDriverChange(driverName: string): void {
  if (Notification.permission === "granted") {
    new Notification("あなたの番です！", {
      body: `${driverName} さん、ドライバーに交代しました`,
      icon: "/icon.png",
    });
  }

  // モバイルの振動（FR-033）
  if ("vibrate" in navigator) {
    navigator.vibrate([200, 100, 200]);
  }
}
