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

## `@tasuki/web-kit/reader`（読む面の部品・#371）

画面から読んでよい（同期の入口 `./sync` とは別）。

- `Markdown` — お題の説明・共有メモの描画。解析は `@tasuki/markdown`。見出しの段（`headingBase`）は置く場所に合わせて渡す
  （お題の札はタイトルが h3 なので 4、timer の共有メモは 3）。見た目は部品層の `.ui-md-*`
- `useReaderDrawer` — 「続きを読む」の引き出し（`<dialog class="ui-drawer">`）の開閉と、閉じたときに開いたボタンへ
  フォーカスを戻す処理。マークアップは各画面が持つ


## `@tasuki/web-kit/room`（ルーム画面の部品・#471・#472）

画面から読んでよい。`@tasuki/sync-client` は型（`import type`）だけを読む。

- `connectionNotice(kind)` — 接続の告知の種類（`ConnectionNoticeKind`）を文にする。**文 3 つ（再接続中・最新でない・届かない）の正本はここ 1 か所**
- `ConnectionBanner` — 告知の帯（`ui-banner`）。届かないは `role="alert"`、それ以外は `role="status"`、無いときは描かない。
  checkin・roulette・topic・agenda・poker が同じ文・役割で出す。位置は、checkin の本画面は `<main>` の中・見出しの後、roulette・topic・poker・agenda の本画面は `<main>` の直前、agenda の映す表示の間は映す表示（`.projection`）の中の上端（全面を覆うので外では見えない）、参加前の画面（checkin・agenda）は `<main>` の中・見出しの後。アプリごとに違い、揃えてはいない。
  agenda は映す表示に出入りするたびに帯の親が変わる（main の直前 ↔ 映す表示の中）ので、帯は mount し直され、`role` の読み上げもやり直される。映す表示は fixed で全面を覆うため、同じ要素を保つ手段が無い（外に残すと覆われ、z-index を上げると隅の操作を覆う）。

- `LoadingView` — 読み込み中・送り返している間の画面（`main` の中の `role="status"` の一言。見た目の `.loading-note` は `packages/ui` が持つ）
- `RoomGoneView` — ルームが無いときの画面（h1・説明・トップ（`/`）へのリンク。消えたルームの選択画面へは送らない）
- `RoomJoiningView` — 最初の入室が成立するまでの画面（h1・戻るリンク・混雑の知らせ・失敗の一言）。戻るリンクの文（`backLabel`）は web-kit が invite-ui に依存しないので呼ぶ側が渡す。帯は `notice`（接続の告知の種類）を受け取って中で描き、位置は `bannerPlacement`（`before-main`: roulette・topic、`after-header`: agenda・checkin。揃えてはいない）
- `useHubRedirect` — 玄関のそのルームへ送り返す（理由つきの `departed` を先に、次に `needsHub`）。`hubPathFor`・`redirectTo` は各アプリの `router.ts` のものを渡す
- `usePrefersReducedMotion` — 動きを減らす設定か（変化を購読）。timer-web の `use-reduced-motion` は書き方が違うので寄せていない
- `ROOM_GATE_TEXT` — 入室の門の文 5 つの正本。書体の base 層に収まるかは `tests/room-gate-copy-fits-font-base.test.ts` が測る

種類を決める規則（諦めるまでの回数を含む）は `@tasuki/sync-client` の `connectionNoticeKind` で、同期フックが引いて `notice` として返す。

依存してよいのは `react`（peer）・`@tasuki/sync-client`・`@tasuki/markdown` だけ（`scripts/audit-dependency-direction.mjs`）。
ドメインの core には依存しない。`@tasuki/invite-ui` は同期に依存しないと決めてある（`docs/adr/0020`）ので、
同期の部品はこちらに置く。
