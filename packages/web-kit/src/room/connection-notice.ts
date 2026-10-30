/**
 * 接続の告知の種類を、利用者向けの文にする（#471・#463-C2）。
 *
 * **種類を決める規則（諦めるまでの回数を含む）は `@tasuki/sync-client` の `connectionNoticeKind` にあり、
 * 同期フックが引く**。ここは文言を当てるだけで、写しを持たない。文 3 つの正本はこのファイルの 1 か所である。
 * 文言は自己ホスト書体の base 層に収まる字だけで書く。
 */
import type { ConnectionNoticeKind } from '@tasuki/sync-client';

export type ConnectionNotice = { kind: 'none' } | { kind: Exclude<ConnectionNoticeKind, 'none'>; text: string };

const RECONNECTING_TEXT = '接続中です…（切断された場合は自動で再接続します）';
// **「作成」とは言わない**（#95 S5c・R9）。ルームを作る口は玄関に移り、各アプリに残るのは入室だけである。
// 無い操作を数え上げると、告知の言うことと画面が食い違う。
const UNREACHABLE_TEXT = '同期サーバーに接続できません。復旧するまでルームに参加できません。再試行を続けています。';
// 再読込を促さない。継続する棄却の原因はサーバー側のルームに残った値なので直らず、
// 嘘の導線になる（`docs/poker/adr/0002`）。
const STALE_TEXT = '同期できていません。表示が最新でない可能性があります。';

export function connectionNotice(kind: ConnectionNoticeKind): ConnectionNotice {
  switch (kind) {
    case 'none':
      return { kind };
    case 'stale':
      return { kind, text: STALE_TEXT };
    case 'unreachable':
      return { kind, text: UNREACHABLE_TEXT };
    case 'reconnecting':
      return { kind, text: RECONNECTING_TEXT };
  }
}
