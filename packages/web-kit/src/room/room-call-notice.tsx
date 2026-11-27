import { ClampedName } from './clamped-name.js';
import type { RoomCallView } from './room-call-view.js';
import { toolDestination } from './tool-destinations.js';

export interface RoomCallNoticeProps {
  /** 受け取った呼びかけ（最新の 1 つ）。 */
  readonly call: RoomCallView;
  /** いまのルームのコード。「移る」で同じルームへ入るのに使う。 */
  readonly roomCode: string;
  /** 「閉じる」を押した。呼ぶ側が知らせの状態を下ろす。 */
  readonly onDismiss: () => void;
}

/**
 * 呼びかけの知らせ（#677）。「{名前}さんが {道具の名前} に呼んでいます」と「移る」「閉じる」を出す。
 *
 * - **自動では移さない。** 呼ばれた側が「移る」（同じルームの道具の画面へのリンク）を選ぶ
 * - 知らない道具（古い画面が知らない新しい道具）は何も描かない（行き先が決まらない）
 * - 読み上げは `role="status"`。位置は呼ぶ側が決める（接続の告知の帯 `ConnectionBanner` と同じ流儀）
 * - 長い名前は {@link ClampedName} で 2 行に収め、押して全文に開ける（320px 幅でも横にあふれない）
 *
 * 見た目は部品層の `.ui-call`（`packages/ui/src/components/call.css`）。
 */
export function RoomCallNotice({ call, roomCode, onDismiss }: RoomCallNoticeProps) {
  const destination = toolDestination(call.tool);
  if (destination === undefined) return null;
  return (
    <div className="ui-call" role="status">
      <p className="ui-call-text">
        <ClampedName label={call.fromName} className="ui-call-name" />
        さんが {destination.name} に呼んでいます
      </p>
      <div className="ui-actions">
        <button type="button" className="ui-button ui-button--quiet" onClick={onDismiss}>
          閉じる
        </button>
        <a className="ui-button" href={`${destination.href}?room=${encodeURIComponent(roomCode)}`}>
          移る
        </a>
      </div>
    </div>
  );
}
