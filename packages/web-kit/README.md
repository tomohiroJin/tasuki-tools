# @tasuki/web-kit

web アプリが共有する React の部品（#360 の波 2・設計正本 §5.8）。

## `@tasuki/web-kit/sync`（同期フックの部品）

各アプリの同期フックが共有する部品。**画面はここを直接読まない**（同期フックだけが読む。
各アプリの `screens-do-not-import-sync-client` のテストが固定する。`docs/adr/0015`）。

- `useJoinRetry(texts)` — 混雑で参加を拒まれたときの、待ってからの送り直し。待つ時間と回数の上限は
  `@tasuki/sync-client` の `joinRetryDelayMs` が決め、このフックは回数・タイマー・知らせの文言を持つ

依存してよいのは `react`（peer）と `@tasuki/sync-client` だけ（`scripts/audit-dependency-direction.mjs`）。
ドメインの core には依存しない。`@tasuki/invite-ui` は同期に依存しないと決めてある（`docs/adr/0020`）ので、
同期の部品はこちらに置く。
