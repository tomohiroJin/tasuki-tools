/**
 * timer をどの入口で開いたかを決める純粋関数（#95 S5c・R9）。
 *
 * **旧入口（`Setup` / `Join`）を撤去したので、ルームコードを伴わない URL には
 * 行き先が無い。** 玄関（`/`）へ送る。名乗りと合言葉の入力はそこに 1 つだけある。
 *
 * **`?view=history` は `?room=` より先に見る。** 端末に残った完了記録は
 * ルームと無関係に見られるもので（`Setup` が持っていた性質）、順序を逆にすると
 * ルームへ入ってしまい履歴へ着けない。戻り先は開いた元 —— 玄関から来たなら `/`、
 * 選択画面から来たなら `/?room=CODE` —— を URL 自身が運ぶ。
 */
export type Entry =
  | { kind: "history"; backTo: string }
  | { kind: "room"; code: string }
  | { kind: "redirect"; to: string };

export function decideEntry(search: string): Entry {
  const params = new URLSearchParams(search);
  const code = params.get("room");
  if (params.get("view") === "history") {
    return { kind: "history", backTo: code ? hubRoomPath(code) : "/" };
  }
  if (code) return { kind: "room", code };
  return { kind: "redirect", to: "/" };
}

/**
 * 玄関のそのルーム（参加用 URL と同じ形・`docs/adr/0018` 決定 2）。
 *
 * **ルームコードにはルーム名がそのまま入り、日本語も許される**（例: `朝会モブ-a1b2`）ので、
 * 素の連結ではなく符号化を通す。行き先が 3 つ（履歴の戻り先・同一性が無いときの送り先・
 * 完了後の戻り先）に増えたので、綴りをここ 1 箇所に持つ。
 */
export function hubRoomPath(code: string): string {
  return `/?room=${encodeURIComponent(code)}`;
}
