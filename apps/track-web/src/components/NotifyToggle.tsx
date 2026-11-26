/**
 * 「長く続いたら通知する」（#476・FR-6・設計 §4 C6）。端末ごとの設定で、既定は切。
 * 押したときにだけ、ブラウザへ通知の許可を求める。未対応のブラウザには出さない（代わりの道は作らない）。
 */
import { NOTIFY_BUTTON, NOTIFY_DENIED_TEXT, NOTIFY_UNAVAILABLE_TEXT } from '../copy';
import type { NotifySetting } from '../hooks/use-notify-setting';

export function NotifyToggle({ setting }: { setting: NotifySetting }) {
  if (!setting.supported) return null;
  // 通知を作れない端末では、以後トグルを出さない（文だけ）
  if (setting.unavailable) {
    return (
      <div className="track-notify">
        <p className="track-hint" role="status">
          {NOTIFY_UNAVAILABLE_TEXT}
        </p>
      </div>
    );
  }
  return (
    <div className="track-notify">
      <button type="button" className="ui-button ui-button--quiet ui-button--sm" aria-pressed={setting.enabled} onClick={setting.toggle}>
        {NOTIFY_BUTTON}
      </button>
      {setting.denied && (
        <p className="track-hint" role="status">
          {NOTIFY_DENIED_TEXT}
        </p>
      )}
    </div>
  );
}
