import type { ConnectionNoticeKind } from '@tasuki/sync-client';
import { connectionNotice } from './connection-notice.js';

/**
 * 接続の告知の帯（`ui-banner`・#471）。画面の上端に貼りつく（位置は部品層の CSS が持つ）。
 * 繋がらない（戻る見込みが無い）ときは `role="alert"`、それ以外は `role="status"`。告知が無いときは何も描かない。
 * 位置は呼ぶ側が決める。本画面では `<main>` の直前、checkin・agenda の参加前の画面では `<main>` の中の見出しの後に置いている（揃えてはいない）。
 */
export function ConnectionBanner({ kind }: { kind: ConnectionNoticeKind }) {
  const notice = connectionNotice(kind);
  if (notice.kind === 'none') return null;
  const unreachable = notice.kind === 'unreachable';
  return (
    <p className={`ui-banner${unreachable ? ' ui-banner--unreachable' : ''}`} role={unreachable ? 'alert' : 'status'}>
      {notice.text}
    </p>
  );
}
