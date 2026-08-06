# S4: timer を `/timer/` へ移設し、ルートを LP にする（#19）

**Date**: 2026-08-05 | **Epic**: [#15](https://github.com/tomohiroJin/tasuki-tools/issues/15) | **Issue**: [#19](https://github.com/tomohiroJin/tasuki-tools/issues/19)

epic #15 の最終段。玄関 LP をトップに据え、timer をサブパスへ移し、**poker を初めて本番公開する**。

前提の [#63](https://github.com/tomohiroJin/tasuki-tools/issues/63)（poker-sync の防御）は
[PR #64](https://github.com/tomohiroJin/tasuki-tools/pull/64) で解消済み。本段はその上に乗る。

## S4 後の公開パス

| URL | 配信元 | 備考 |
|---|---|---|
| `/` | `/var/www/tasuki-home`（LP） | 包括フォールバック |
| `/?room=CODE` | → `/timer/?room=CODE` へ 301 | 旧共有リンクの救済（下記） |
| `/timer/` | `/var/www/tasuki`（timer web） | `/timer` は `/timer/` へ 301 |
| `/timer/ws` | `127.0.0.1:8787` | Caddy が `/ws` へ rewrite |
| `/poker/` | `/var/www/tasuki-poker` | **今回が初公開** |
| `/poker/ws` | `127.0.0.1:3311` | 変更なし |

**`WEB_ROOT` は両アプリとも据え置く。** 変えるのは公開パスだけなので、ホスト上の
ファイル移動は起きない。sync サーバーの実装も無変更（Caddy が rewrite するため）。
`ALLOWED_ORIGINS` は Origin がスキーム＋ホストなのでパス変更の影響を受けない。

### 旧共有リンクの救済

timer のルーム共有リンクは **`?room=CODE` というクエリ形式**（`apps/timer-web/src/App.tsx`）。
`/` が LP になると `https://<host>/?room=ABC` は LP に着地してコードが失われる。
Issue #19 の「旧ブックマークで迷子にならない」は `/` → LP としか書いておらず、
この経路は想定されていなかった。

実害は限定的（デプロイでルームは全消滅するため、リンクが指す部屋はどのみち消えている）
だが、Caddy のルール 1 つで救えるので入れる。**`/` かつ `room` クエリありのときだけ**
`/timer/` へ 301 し、クエリ全体を引き継ぐ。

## Caddy 断片の並び替え

包括フォールバックが timer から LP へ移るので、断片の役割を入れ替える。

> **⚠ 当初この節は「ファイル名順が評価順を決める」と書いていたが、実測で誤りと判明した。**
> Caddyfile アダプタはルートを**マッチャの具体性**で並べ替えるため、包括フォールバックは
> 書いた位置に関わらず最後に回る。ファイル名順が効くのは具体性が同じマッチャ同士の
> タイブレークだけで、そのとき名前が後のものは一度も評価されない。
> 検証結果と、そこから導いた正しい不変条件は下記「実機検証の結果」を参照。

| 順 | ファイル | 対象 | 変更 |
|---|---|---|---|
| 10 | `timer/caddy/10-timer-ws.conf` | `/timer/ws` → 8787 | 内容変更（旧 `/ws*`） |
| 20 | `poker/caddy/20-poker.conf` | `/poker/ws`・`/poker/*` | 変更なし（コメントのみ） |
| 30 | `timer/caddy/30-timer-spa.conf` | `/timer/*` → `/var/www/tasuki` | **旧 `90-timer-spa.conf` をリネーム** |
| 40 | `timer/caddy/40-timer-legacy-room.conf` | `/` + `room` クエリ → `/timer/` | **新規** |
| 90 | `landing/caddy/90-landing.conf` | 包括 → `/var/www/tasuki-home` | **旧 `30-landing.conf` をリネーム** |

各断片は**自分の `root` を明示する**。サイトブロック（`deploy/caddy/tasuki.conf`）の
`root * /var/www/tasuki` には依存しない。サイトブロックは今回変更しない（TLS・ヘッダを
持つ最も壊してはいけない部分なので、触る範囲を `apps/*.conf` に閉じる）。

### ホスト上の旧ファイル削除

デプロイ時にホストで削除するもの:

- `/etc/caddy/tasuki/apps/30-landing.conf`
- `/etc/caddy/tasuki/apps/90-timer-spa.conf`

**消し忘れても `/timer/` は壊れない**（実測で確認）。残ると起きるのは、
`30-landing.conf` は `/home/` が LP の二重公開 URL として残ること、
`90-timer-spa.conf` は包括が 2 本になり名前が先の `90-landing.conf` だけが効いて
timer 側が死んだ設定として残ること。いずれも黙って残るので削除する。

手順は `deploy/caddy/README.md` に置く。

## コード変更

| ファイル | 現在 | S4 後 |
|---|---|---|
| `apps/timer-web/vite.config.ts` | `base` 未指定 | `base: '/timer/'`、dev proxy を `/timer/ws` → `/ws` に rewrite |
| `apps/timer-web/src/App.tsx` | WS URL を直書き | `buildSyncUrl` を呼ぶ（下記） |
| `apps/landing/vite.config.ts` | `base: '/home/'` | `base: '/'` |
| `apps/landing/src/tools.ts` | timer は `/` | `/timer/` |
| `deploy/timer/app.env` | `PUBLIC_PATH=/` | `/timer/` |
| `deploy/landing/app.env` | `PUBLIC_PATH=/home/` | `/` |

### この作業に必要な改善: WS URL の切り出し

WS URL は `App.tsx` の 600 行超のコンポーネント内に 1 行で直書きされており、
**テストから触れない**。パスを変える当事者なので `buildSyncUrl(location)` として
切り出し、単体テストを持たせる。移設漏れや将来のパス変更が検出できるようになる。

切り出す範囲はこの 1 関数に限る。`App.tsx` の他の整理はこの Issue の範囲外。

## テスト

| # | 対象 | 方法 |
|---|---|---|
| 1 | LP の遷移先 | 既存テストが `['/', '/poker/']` を直接押さえているので必ず落ちる。期待値を更新する |
| 2 | WS URL | `buildSyncUrl` の単体テスト。`https` なら `wss`、パスは `/timer/ws` |
| 3 | **Caddy 断片の衝突** | 構造テスト。包括フォールバックがちょうど 1 本・ルーティングの鍵に重複が無い・配信断片が自分の `root` を宣言していることを固定する（当初は「ファイル名順で最後」を見ていたが、実測で安全性の根拠にならないと分かったため差し替えた） |
| 5 | **`SYNC_PATH` と Caddy 断片の一致** | `apps/timer-web/test/sync/sync-url.test.ts` が両ファイルを読み比べる。同じ値を別ファイルで持つため、食い違ってもどちらも正しく見える |
| 4 | 3 系統の実機 | ローカルに Caddy を入れ、本物の断片・ビルド成果物・両 sync サーバーで `/`・`/timer/`・`/poker/`・`/?room=X` を Playwright で確認 |

テスト 3 は「新しく検査を足したら、わざと壊して落ちることまで確かめる」に従い、
断片の番号を入れ替えて赤くなることを確認する。

### 実機検証の結果（2026-08-05）

Caddy 2.11.4 をローカルに入れ、**本番と同一の断片ファイル**を `apps/*.conf` として集約し、
`/var/www/*` を各 dist への symlink にして検証した（断片の `root` 指定をそのまま使うため）。

| 経路 | 結果 |
|---|---|
| `/` | 200・LP（`<title>Tasuki</title>`・`/assets/...`） |
| `/timer/` | 200・timer（`/timer/assets/...`） |
| `/poker/` | 200・poker（`/poker/assets/...`） |
| `/?room=ABC123` | 301 → `/timer/?room=ABC123`（追加クエリも保持） |
| `/`（room 無し） | 200・LP のまま |
| `/timer` / `/poker` | 301 → 末尾スラッシュ付き |
| `/timer/ws` / `/poker/ws` | WebSocket **101 成立** |
| `/ws`（旧パス） | LP に吸われて接続失敗（移設後の期待どおり） |

Playwright でも LP からの遷移 2 経路と 3 画面の描画を確認し、コンソールエラーは 0 件だった。

### 評価順についての訂正（敵対的レビューで判明）

当初の設計は「断片のファイル名順が評価順を決める」という前提に立っていた。
これは S2（#57）から引き継いだ理解だったが、**実測で誤りと判明した**。

| 実測 | 結果 |
|---|---|
| 包括フォールバックを `90-landing.conf` → `05-landing.conf` に改名して `caddy adapt` | 生成されるルートの並びとマッチャは**完全に同一** |
| その構成を起動して実アクセス | `/`・`/timer/`・`/poker/`・`/timer/ws`・`/?room=X` **すべて正常** |
| 旧断片 2 本を消し忘れた構成 | `/timer/` は**正常**。実害は `/home/` の二重公開のみ |
| 包括 `handle {}` を 2 本置く | 名前が**先**の方だけが応答し、後は一度も評価されない |
| 同じパス `/same/*` を 2 本置く | 同上 |

**正しいモデル**: Caddy はルートをマッチャの具体性で並べ替える。ファイル名順が効くのは
具体性が同じマッチャ同士のタイブレークだけで、そのとき後のものは到達不能になる。
したがって守るべきは「順序」ではなく「同じ具体性のマッチャを 2 つ作らないこと」。
テスト 3 はこの結論に沿って書き直した。

本番で `/poker` が timer の index.html を返した事故も、順序ではなく
**poker の断片が存在しなかった**ことが原因だった。

## デプロイ（本段では実施しない）

epic #15 の全段階が終わった時点で、**指示を得てから 1 回だけ**実施する。
poker は初回公開なので追加の準備が要る。手順は `deploy/poker/NOTES.md` と
`deploy/caddy/README.md` に書く。

1. VPS に Bun を導入（未導入なら）
2. `sudo DEPLOY_USER=<user> bash deploy/setup.sh poker`
3. `/opt/tasuki-poker/tasuki-poker-sync.env` の `ALLOWED_ORIGINS` を実値へ
   （**空のままだと #63 の fail-closed で起動しない**）
4. `deploy.sh timer` / `deploy.sh poker` / `deploy.sh landing`
5. Caddy 断片の設置と**旧 2 本の削除** → `caddy validate` → reload
6. `sudo systemctl start tasuki-poker-sync`

### 実機で確認すること

- `/`・`/timer/`・`/poker/` の 3 系統が並存する
- `/timer/ws` は **426**、`/poker/ws` は **400** を返す（**どちらも 200 なら SPA フォールバックに
  吸われている**）。コードが違うのは実装の差で、timer-sync は 426、poker-sync は
  `WebSocket upgrade failed` を 400 で返す。判定に使うのは「200 でないこと」
- `/?room=X` が `/timer/?room=X` へ 301 する
- 配信中のアセットハッシュがローカルビルドと一致する
- **timer / poker の相互無干渉**（#17 から引き取った項目）:
  poker の WebSocket セッションを繋いだまま timer を再デプロイし、poker 側が切れないこと

## スコープ外

- 共通コードの抽出（S5 で完了済み）
- `App.tsx` の `buildSyncUrl` 以外の整理
- サイトブロック（`deploy/caddy/tasuki.conf`）の変更
