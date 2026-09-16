# @tasuki/invite-ui

招待のコピー・QR 生成を行う React フック。画面は URL（またはルームコード）を渡し、
結果を表示する。ドメインや同期クライアントには依存しない。

- `useCopyText(text)` — `copy()` と `state`（`idle` / `done` / `failed`）。
  Clipboard API、従来のコピーの順に試す。`failed` の場合は手動コピーを案内する。
  **文字列は画面にも常時表示すること。**
- `useInviteQr(url, enabled)` — `dataUrl` と `failed`。
  `enabled` が真になってから qrcode を読み込む。生成失敗時も URL を残す。

選択画面では「参加用 URL をコピー」「QR コードを表示」から共有できる。
timer のコード・URL コピーと QR、poker の招待リンクコピーも同じ処理を使う。

配置の判断: [ADR-0020](../../docs/adr/0020-invite-browser-operations.md)。
