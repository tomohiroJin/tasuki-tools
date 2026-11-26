/**
 * デスクトップ通知（端末 I/O・#476・FR-6・設計 §4 C6・C7）。
 *
 * `apps/timer-web/src/platform/notify.ts` の作りを写したもの（共有化しない。原則 X。3 つ目の使い手が出たら寄せる）。
 *
 * - **既定は切。** 許可を求めるのは、利用者が「長く続いたら通知する」を押したときだけ（`requestNotificationPermission`）
 * - 出すのは、ページが非表示のときだけ（前面なら画面の知らせで足りる）。許可が無い・未対応では何もしない
 * - **文は呼ぶ側が渡す。作業名は渡さない**（通知はロック画面など画面の外に出る。作業名は個人に紐づく）
 * - 設定（切／入）は端末の `localStorage`。読み書きが失敗しても画面は動く（既定の切のまま）
 */

/** 「長く続いたら通知する」の設定の鍵。値は "1"（入）だけを書き、切は鍵ごと消す */
export const NOTIFY_PREFERENCE_KEY = 'tasuki:track:notify-long-running:v1';

/**
 * この端末では通知を作れないと分かったか（Android の Chrome は `new Notification()` が TypeError を投げる）。
 * **端末のメモリだけ**で覚える（このページを開いている間。判定の結果を保存しない）。
 */
let constructorFailed = false;

/** 通知を作れないと分かった端末か。 */
export function notificationUnavailable(): boolean {
  return constructorFailed;
}

/** 通知を出せるブラウザか。 */
export function notificationSupported(): boolean {
  return typeof Notification !== 'undefined' && !constructorFailed;
}

/** 通知の許可が下りているか。 */
export function notificationGranted(): boolean {
  return notificationSupported() && Notification.permission === 'granted';
}

/** 通知の許可が拒まれているか（ブラウザの設定で変えるまで、こちらからは求め直せない）。 */
export function notificationDenied(): boolean {
  return notificationSupported() && Notification.permission === 'denied';
}

/** 通知の許可を求める。**「通知する」を押したときにだけ呼ぶ。** 下りたら true。 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationSupported()) return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/** 設定を読む（読めなければ切）。 */
export function loadNotifyPreference(): boolean {
  try {
    return localStorage.getItem(NOTIFY_PREFERENCE_KEY) === '1';
  } catch {
    return false;
  }
}

/** 設定を書く（書けなくても画面は動く）。 */
export function saveNotifyPreference(on: boolean): void {
  try {
    if (on) localStorage.setItem(NOTIFY_PREFERENCE_KEY, '1');
    else localStorage.removeItem(NOTIFY_PREFERENCE_KEY);
  } catch {
    /* 書けない環境では、この画面を開いている間だけ有効にする */
  }
}

/** ページが非表示か。 */
export function pageHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * 非表示のときだけ通知を出す。許可が無い・前面・未対応では何もしない（`skipped`）。
 * **`new Notification()` が投げたら `failed` を返し、以後この端末では出さない**（黙って握りつぶさない。呼ぶ側が設定を切に戻して知らせる）。
 */
export function notifyWhenHidden(title: string, body: string): 'sent' | 'skipped' | 'failed' {
  if (!notificationGranted() || !pageHidden()) return 'skipped';
  try {
    // 同じ知らせが重ならないよう tag を付ける
    new Notification(title, { body, tag: 'tasuki-track-long-running' });
    return 'sent';
  } catch {
    constructorFailed = true;
    return 'failed';
  }
}

/** 試験のため、通知を作れない端末の記憶を戻す。 */
export function resetNotificationAvailability(): void {
  constructorFailed = false;
}
