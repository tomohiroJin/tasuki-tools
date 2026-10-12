// 接続状態を利用者向けの告知に翻訳する純関数（#76 F-2）
//
// 同期サーバーへ繋がらない間、ルームの作成も参加もできない（送信しても届かないため
// ボタンを無効にしている）。ところが画面に出るのは「接続中です…」だけで、
// 一時的な状態にしか見えず、待っても直らないことも、なぜ押せないのかも分からなかった。
//
// 「まだ繋ぎに行っている途中」「切れたが戻る見込みがある」「繋がらない」を区別する。
import { connectionNoticeKind } from '@tasuki/sync-client';
import type { ConnectionStatus } from './hooks/useSync';

export type ConnectionNotice =
  | { kind: 'none' }
  | { kind: 'reconnecting'; text: string }
  | { kind: 'unreachable'; text: string }
  /** 接続は生きているのに、契約に合わないフレームを捨てて画面が古いまま（#212）。 */
  | { kind: 'stale'; text: string };

const RECONNECTING_TEXT = '接続中です…（切断された場合は自動で再接続します）';
// **「作成」とは言わない**（#95 S5c・R9）。ルームを作る口は玄関に移り、poker に残るのは
// 入室だけである。無い操作を数え上げると、告知の言うことと画面が食い違う。
const UNREACHABLE_TEXT =
  '同期サーバーに接続できません。復旧するまでルームに参加できません。再試行を続けています。';
// 再読込を促さない。継続する棄却の原因はサーバー側のルームに残った値なので直らず、
// 嘘の導線になる（`docs/poker/adr/0002`）。文言は自己ホスト書体の base 層に収まる字だけで書く。
const STALE_TEXT = '同期できていません。表示が最新でない可能性があります。';

export interface ConnectionNoticeInput {
  readonly status: ConnectionStatus;
  /** この画面で一度でも接続が確立したか */
  readonly everConnected: boolean;
  /** 直近の接続確立以降、連続して失敗した回数 */
  readonly failedAttempts: number;
  /** 契約に合わないフレームを捨てて以降、新しい状態を受け取れていないか（#212） */
  readonly syncStale: boolean;
}

/**
 * 種類を決める規則（諦めるまでの回数を含む）は `@tasuki/sync-client` の `connectionNoticeKind` にある
 * （お題ツール・ルーレットと同じ規則。#94 PR 2 で写しを寄せた）。ここは poker の文言を当てるだけである。
 */
export function connectionNotice(input: ConnectionNoticeInput): ConnectionNotice {
  const kind = connectionNoticeKind(input);
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
