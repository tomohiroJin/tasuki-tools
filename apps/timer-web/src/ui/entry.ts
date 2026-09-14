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
    return { kind: "history", backTo: code ? `/?room=${encodeURIComponent(code)}` : "/" };
  }
  if (code) return { kind: "room", code };
  return { kind: "redirect", to: "/" };
}
