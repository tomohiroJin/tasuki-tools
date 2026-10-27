/**
 * ルーム画面の見出し（h1）の道具名（#447 段 2）。玄関の札・`<title>` と同じ名前。
 * 英字だけなので書体の base 層の心配が無い。文言の他の部分は `@tasuki/invite-ui` の `ROOM_HEADER_TEXT` が持つ。
 */
export const ROOM_HEADING = "TDD Mob Pro Timer";

/**
 * 選択画面へ戻るリンクの行き先（同じルームの選択画面。玄関まで戻すとルームから出たことになる）。
 * 見出しと休憩の覆いの 2 か所が使うので、組み立てはここ 1 つ。
 */
export function roomChoiceHref(roomCode: string): string {
  return `/?room=${encodeURIComponent(roomCode)}`;
}
