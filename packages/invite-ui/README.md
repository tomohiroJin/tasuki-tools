# @tasuki/invite-ui

招待のコピー・QR 生成を行う React フックと、それを組んだ見出しの部品（`RoomHeader`）。
画面は URL（またはルームコード）を渡し、結果を表示する。ドメインや同期クライアントには依存しない。

- `useCopyText(text)` — `copy()` と `state`（`idle` / `done` / `failed`）。
  Clipboard API、従来のコピーの順に試す。`failed` の場合は手動コピーを案内する。
  **文字列は画面にも常時表示すること。**
- `useInviteQr(url, enabled)` — `dataUrl` と `failed`。
  `enabled` が真になってから qrcode を読み込む。生成失敗時も URL を残す。

- `RoomHeader` — ルーム画面の見出し・戻るリンク・ルームコード・参加用 URL を 1 つに組んだ部品（#447 段 1）。
  QR は普段は閉じておき、開くまで qrcode を読まない。文言の正本は `room-header-copy.ts` の `ROOM_HEADER_TEXT`。
  DOM は `RoomHeader.tsx` が組み、見た目は `packages/ui` の `room-header.css` が持つ。
  `compact`（#447 段 2）は詰めた見た目で、全幅で招待の行を「仲間を招く」でたたむ。40rem 未満では道具名を目に出さず読み上げに残し、1 行にする。timer のセッションが使う。

選択画面では「参加用 URL をコピー」「QR コードを表示」から共有できる。
timer のコード・URL コピーと QR、poker とお題ツール（topic-web）の招待リンクコピーも
同じ処理を使う。

配置の判断: [ADR-0020](../../docs/adr/0020-invite-browser-operations.md)。
