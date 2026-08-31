// 接続状態を利用者向けの告知に翻訳する純関数（#76 F-2）
//
// 同期サーバーへ繋がらない間、ルームの作成も参加もできない（送信しても届かないため
// ボタンを無効にしている）。ところが画面に出るのは「接続中です…」だけで、
// 一時的な状態にしか見えず、待っても直らないことも、なぜ押せないのかも分からなかった。
//
// 「まだ繋ぎに行っている途中」「切れたが戻る見込みがある」「繋がらない」を区別する。
import type { ConnectionStatus } from './hooks/useSync';

export type ConnectionNotice =
  | { kind: 'none' }
  | { kind: 'reconnecting'; text: string }
  | { kind: 'unreachable'; text: string }
  /** 接続は生きているのに、契約に合わないフレームを捨てて画面が古いまま（#212）。 */
  | { kind: 'stale'; text: string };

/** 一度繋がった後、ここまで連続で失敗したら「戻る見込み」を諦めて伝え方を変える。 */
const GIVE_UP_AFTER_ATTEMPTS = 3;

const RECONNECTING_TEXT = '接続中です…（切断された場合は自動で再接続します）';
const UNREACHABLE_TEXT =
  '同期サーバーに接続できません。復旧するまでルームの作成と参加はできません。再試行を続けています。';
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

export function connectionNotice({
  status,
  everConnected,
  failedAttempts,
  syncStale,
}: ConnectionNoticeInput): ConnectionNotice {
  // **接続が切れているなら、そちらが先に伝えるべきことである。** 同期が古いのは
  // 切断の結果でもあり、再接続すれば新しい room-state が届いて解消しうる。
  if (status === 'open') {
    return syncStale ? { kind: 'stale', text: STALE_TEXT } : { kind: 'none' };
  }

  // 開いた直後のまだ失敗していない一瞬に警告を出すと、正常時にちらつくだけで害になる。
  if (failedAttempts === 0) return { kind: 'none' };

  // 一度も繋がっていないなら「切断された」わけではない。待っても直らないので最初から伝える。
  if (!everConnected) return { kind: 'unreachable', text: UNREACHABLE_TEXT };

  // 使えていた接続が切れた場合は、まず自動復帰に賭ける。戻らないと分かったら言い方を変える。
  if (failedAttempts >= GIVE_UP_AFTER_ATTEMPTS) {
    return { kind: 'unreachable', text: UNREACHABLE_TEXT };
  }
  return { kind: 'reconnecting', text: RECONNECTING_TEXT };
}
