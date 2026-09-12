# @tasuki/sync-client

同期サーバーへの WebSocket 接続を持つ（#95 D18）。利用者は `apps/landing`（ハブ）と
`apps/timer-web`。S5b で `apps/poker-web` が加わる。

## 持つもの

- **WS の保持と再接続** —— `new WebSocket(` を書いてよいのはこのパッケージだけである
  （`scripts/audit-web-sync-boundary.mjs` が web アプリ側を 0 件で縛っている）
- **指数バックオフ** —— 切断後に繋ぎ直すまでの待ち時間
- **送信キュー** —— 確立前に送ろうとしたコマンドを確立時に流す
- **入室の再試行方針** —— 混雑で弾かれたときの待ち時間（ばらつきと上限つき）

## 持たないもの

- **ツール固有のコマンドとサーバーメッセージ**（timer の `snapshot`、poker の `round`、
  ハブの `roster`）。受信は生テキストのまま呼び出し側へ渡す。**境界の検証は利用側の責務**
  である（原則 IV）—— どのスキーマで検めるかは文脈ごとに違う
- **時計合わせ（`time.ping` / `clockOffset`）**。timer の語彙なので `apps/timer-web` に残る
- **画面の状態**。`@tasuki/*` のどのパッケージにも依存しない
