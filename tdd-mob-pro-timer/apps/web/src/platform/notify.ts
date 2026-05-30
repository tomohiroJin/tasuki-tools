/**
 * 通知・振動
 * T061: FR-033
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
