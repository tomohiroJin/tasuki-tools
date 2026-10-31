import type { ConnectionNoticeKind } from '@tasuki/sync-client';
import { connectionNotice } from './connection-notice.js';

/**
 * 接続の告知の帯（`ui-banner`・#471）。画面の上端に貼りつく（位置は部品層の CSS が持つ）。
 * 繋がらない（戻る見込みが無い）ときは `role="alert"`、それ以外は `role="status"`。告知が無いときは何も描かない。
 * 位置は呼ぶ側が決める。checkin の本画面は `<main>` の中・見出しの後、roulette・topic・poker・agenda の本画面は `<main>` の直前、agenda の映す表示の間は映す表示（`.projection`）の中の上端（全面を覆うので外では見えない）、参加前の画面（checkin・agenda）は `<main>` の中・見出しの後。アプリごとに違い、揃えてはいない。
 * 部品の z-index は上げない（全面を覆うものの上に出すと、その隅の操作を覆う）。
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
