/**
 * 呼びかけの知らせ（#677）の見せ方が読む項目。web-kit が自分で持つ型で、room-core の `RoomCall` は
 * 構造のまま代入できる（web-kit は room-core・protocol を読まない。`audit-dependency-direction`）。
 */
export interface RoomCallView {
  /** 呼ばれた先の道具の ID（知らない ID は知らせを描かない）。 */
  readonly tool: string;
  /** 呼んだ人の表示名。 */
  readonly fromName: string;
}
