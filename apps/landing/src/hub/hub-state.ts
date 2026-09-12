/**
 * 選択画面・参加・作成の分岐（#95 S5a・設計正本 §5.7）。
 *
 * | URL | 参加状態 | 表示 |
 * |---|---|---|
 * | `/` | — | ルーム名＋自分の名前を入れて**作成** |
 * | `/?room=CODE` | 未参加 | 自分の名前を入れて**参加** |
 * | `/?room=CODE` | 参加済み | **選択画面** |
 *
 * **判定を画面から切り出しておく**（`docs/adr/0015` MUST 1・`docs/adr/0019` が LP へ広げた）。
 */

export type HubScreen = 'create' | 'join' | 'choice';

export interface HubScreenInput {
  /** URL の `?room=`（無ければ null）。 */
  readonly code: string | null;
  /** そのルームへ参加済みか（サーバーが復帰の組を返したか）。 */
  readonly joined: boolean;
}

export function screenFor({ code, joined }: HubScreenInput): HubScreen {
  // **ルームコードが無ければ、参加済みでも作成へ戻す。** どのルームを映すか決まらない
  // （参加用 URL から room だけ消された場合にここへ来る）。
  if (code === null) return 'create';
  return joined ? 'choice' : 'join';
}
