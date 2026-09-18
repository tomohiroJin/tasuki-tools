/**
 * 選択画面・参加・作成の分岐（#95 S5a・設計正本 §5.7）。
 *
 * | URL | 参加状態 | 表示 |
 * |---|---|---|
 * | `/` | — | ルーム名＋自分の名前を入れて**作成** |
 * | `/?room=CODE` | 復帰を試している最中 | **読み込み中** |
 * | `/?room=CODE` | 未参加（端末に同一性が無い・復帰に失敗） | 自分の名前を入れて**参加** |
 * | `/?room=CODE` | 参加済み | **選択画面** |
 * | `/?room=CODE` | 見つからない（消えた・最初から無い） | **不在の知らせ** |
 *
 * **判定を画面から切り出しておく**（`docs/adr/0015` MUST 1・`docs/adr/0019` が LP へ広げた）。
 */

export type HubScreen = 'create' | 'join' | 'choice' | 'resuming' | 'gone';

export interface HubScreenInput {
  /** URL の `?room=`（無ければ null）。 */
  readonly code: string | null;
  /** そのルームへ参加済みか（サーバーが復帰の組を返したか）。 */
  readonly joined: boolean;
  /**
   * 端末の復帰の組で入り直そうとしていて、まだ返事が来ていないか。
   *
   * **「まだ分からない」と「名乗ってもらう」は別である**（#95 S5c 追補）。
   * ツールから `/?room=CODE` で戻ってきた人は、接続して復帰が済むまで
   * {@link joined} が false のままなので、ここを見ないと**既に参加している人へ
   * 「◯◯ に参加します／あなたの名前」を一瞬見せる**ことになる。
   */
  readonly resuming: boolean;
  /**
   * そのルームが見つからないと分かったか（#274）。
   *
   * **名乗る前に分かることがある。** 復帰の組を持たない人には、玄関が接続と同時に
   * 生死を尋ねる（`use-hub-sync.ts`）。組を持つ人は `room.join` の答えで同じ印が立つ。
   */
  readonly gone: boolean;
}

export function screenFor({ code, joined, resuming, gone }: HubScreenInput): HubScreen {
  // **ルームコードが無ければ、参加済みでも作成へ戻す。** どのルームを映すか決まらない
  // （参加用 URL から room だけ消された場合にここへ来る）。
  if (code === null) return 'create';
  if (joined) return 'choice';
  // **`joined` の後に見る。** 前に置くと「参加した後にルームが消えた」場合の
  // 選択画面の振る舞いまで変わり、#274 の射程を超える。
  //
  // **`resuming` より前に見る。** 復帰の返事が `ROOM_NOT_FOUND` だった人は、
  // 待ちが降りる前にここへ来る。後ろに置くと読み込み中の表示から抜けられない。
  if (gone) return 'gone';
  // 復帰の返事を待っている間は名乗らせない。**待ちが終われば必ずどちらかへ落ちる** ——
  // 返事が来れば `joined`、来なければ（同一性が無い・合言葉が要る）
  // `resuming` が降りて参加画面になる（`use-hub-sync.ts` を参照）。
  // **ルームが消えた場合はここへ来ない** —— 上の `if (gone) return 'gone';` で
  // 既に捌かれている。
  return resuming ? 'resuming' : 'join';
}
