# @tasuki/web-kit

web アプリが共有する React の部品（#360 の波 2・設計正本 §5.8）。

## `@tasuki/web-kit/sync`（同期フックの部品）

各アプリの同期フックが共有する部品。**画面はここを直接読まない**（同期フックだけが読む。
各アプリの `screens-do-not-import-sync-client` のテストが固定する。`docs/adr/0015`）。

- `useJoinRetry(texts | null)` — 混雑で参加を拒まれたときの、待ってからの送り直し。待つ時間と回数の上限は
  `@tasuki/sync-client` の `joinRetryDelayMs` が決め、このフックは回数・タイマー・知らせの文言を持つ
- `useToolRoomSync(options)` — 1 つのルームへ入るツールの画面（お題・ルーレット）の同期の共通部分。
  接続と接続の状態・保存した組での参加と入り直し・参加の失敗の扱い（`planForJoinError`）・混雑のやり直しを持つ。
  ツール固有のフレームとコマンドは持たず、受けたフレームは `onFrame` でツールのフックへ渡す

使っているのは各アプリの同期フック。

- `useToolRoomSync`: お題（`apps/topic-web`）・ルーレット（`apps/roulette-web`）
- `useJoinRetry`（上に加えて）: 玄関（`apps/landing`）・タイマー（`apps/timer-web`）。どちらも知らせの文言は渡さない
  （`null`）。玄関はサーバーの文を見せ、タイマーは `rateLimited` が返す「予約したか」でバナーを出し分ける
- ポーカー（`apps/poker-web`）は使っていない。入り直しの待ちがエラーの変化で畳まれる形で、寄せると振る舞いが変わるため
  （`apps/poker-web/src/hooks/useRoomEntry.ts` の注記）

依存してよいのは `react`（peer）と `@tasuki/sync-client` だけ（`scripts/audit-dependency-direction.mjs`）。
ドメインの core には依存しない。`@tasuki/invite-ui` は同期に依存しないと決めてある（`docs/adr/0020`）ので、
同期の部品はこちらに置く。
