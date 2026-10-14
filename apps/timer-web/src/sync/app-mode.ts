// #369 で use-timer-sync.ts から分けた（timer-actions.ts との型の循環を断つため）。
/**
 * ルームの中で表示する画面（#95 S5c・R9）。
 *
 * **旧入口（`Setup` / `Join`）を撤去したので、ルームの外の画面はここに無い。**
 * 名乗りも合言葉もハブ（玄関）に 1 つだけあり、timer は「そのルームのどこに居るか」
 * だけを持つ。端末の完了記録（履歴）も URL（`?view=history`）が決めるもので、
 * ルームの状態ではないため、ここには現れない（`ui/entry.ts`）。
 *
 * 値は `ui/screen.ts` の {@link Screen} と同じ —— サーバー権威の `phase` に追従する。
 */
export type AppMode = "lobby" | "session" | "celebration";
