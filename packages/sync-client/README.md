# @tasuki/sync-client

同期サーバーへの WebSocket 接続を持つ（#95 D18）。利用者は `apps/landing`（ハブ）と
`apps/timer-web`。S5b で `apps/poker-web` が加わる。

## 持つもの

- **WS の保持と再接続** —— `apps/landing` と `apps/timer-web` では `new WebSocket(` を
  1 行も書かない（`scripts/audit-web-sync-boundary.mjs` が両者の `wsHolders` を空で縛る）。
  **`apps/poker-web` はまだ自分で持っている**（`src/hooks/useSync.ts`。寄せるのは S5b・#248）
- **指数バックオフ** —— 切断後に繋ぎ直すまでの待ち時間
- **送信キュー** —— 確立前に送ろうとしたコマンドを確立時に流す
- **入室の再試行方針** —— 混雑で弾かれたときの待ち時間（ばらつきと上限つき）
- **参加の失敗から次の一手を決める規則**（`planForJoinError`）—— ハブの参加のコード体系から
  「消えた・抜けた・玄関へ・待って入り直す・その場で伝える」を決める。お題ツールとルーレットが
  写しで持っていたものを寄せた（#94 PR 2）。既定の文は利用側が渡す
- **接続の告知の種類を決める規則**（`connectionNoticeKind`）—— 「繋ぎに行く途中・再接続中・
  繋がらない・同期できていない」と諦めるまでの回数。poker・お題・ルーレットが写しで持っていた
  ものを寄せた（#94 PR 2）。**文言は持たない**（各アプリの文言表にある）

## 持たないもの

- **ツール固有のコマンドとサーバーメッセージ**（timer の `snapshot`、poker の `round`、
  ハブの `roster`）。受信は生テキストのまま呼び出し側へ渡す。**境界の検証は利用側の責務**
  である（原則 IV）—— どのスキーマで検めるかは文脈ごとに違う
- **時計合わせ（`time.ping` / `clockOffset`）**。timer の語彙なので `apps/timer-web` に残る
- **画面の状態と同期フック**。`@tasuki/*` のどのパッケージにも、React にも依存しない
  （お題とルーレットの同期フックは形が似ているが、フックごとは寄せていない。理由は
  `docs/superpowers/specs/2026-10-12-facilitator-roulette-design.md` の「写しの扱い」）
