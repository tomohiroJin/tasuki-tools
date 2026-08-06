# デプロイ手順（アプリ共通）

Tasuki の各アプリは「自分の systemd ユニット + 固有ポート + Caddy 断片 + env」を持ち、
**互いに無干渉でデプロイできる**。共通のドライバがアプリ名を受け取って動く。

アプリ固有の値は `deploy/<app>/app.env` にのみ書く。スクリプトやテンプレートに値を
散らさないのは、Issue #51 で起きた「ユニットのユーザー名がスクリプトとテンプレートで
食い違い、片方だけ直っていた」を構造的に防ぐため。

## アプリ一覧

| アプリ | サービス | ポート | 配置先 | 公開パス | 状態 |
|---|---|---|---|---|---|
| `landing` | （無し・静的） | — | `/var/www/tasuki-home` | `/`（玄関） | S4 で未デプロイ |
| `timer` | `tasuki-sync` | 8787 | `/opt/tasuki` / `/var/www/tasuki` | `/timer/` | 公開中（S4 で `/` から移設・未デプロイ） |
| `poker` | `tasuki-poker-sync` | 3311 | `/opt/tasuki-poker` / `/var/www/tasuki-poker` | `/poker/` | **初回公開が S4**（未デプロイ） |

> **S4（#19）の変更はまだ本番に出ていない。** epic #15 の全段階が終わってから、
> 指示を得てまとめて 1 回デプロイする方針（再起動でルームが全消滅するため）。
> 上表の公開パスはデプロイ後の姿を表す。

`landing` は **sync サーバーを持たない静的サイト**で、Caddy が直接配信する。`app.env` に
`STATIC_ONLY=1` を置くと、`deploy.sh` はバンドルとサービス再起動の段を飛ばし、
`setup.sh`（systemd ユニット・sudoers）も不要になる。

> `timer` のサービス名が命名規約（`tasuki-<tool>-sync`）から外れているのは、
> **稼働中のユニットを改名しない**と決めたため。改名は「旧停止 → 新起動」の切り替えを
> 伴い、失敗すればサービス断になる。得られるのは命名の一貫性だけで機能上の利得が無い。

## 通常運用（更新）

接続先は環境変数で必ず指定する。**既定値は用意していない**（実在しないホスト名を
既定にしていたため README の手順がそのまま失敗していた＝ #51 B）。

```bash
# 事前に ~/.ssh/config へホスト別名を定義しておく（下記「SSH の準備」）
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh timer
```

実行される内容:

1. `turbo --filter` で**対象アプリの web だけ**をビルド
2. `bun build` で sync を単一ファイルにバンドル
3. `rsync -az --delete` で web dist を配置（`index.html` の存在を確認してから）
4. `scp` で `server.js` を配置
5. `sudo systemctl restart <そのアプリの service>` （他アプリには触れない）

何が実行されるかを先に見たいときは `DRY_RUN=1` を付ける。

```bash
DRY_RUN=1 TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh timer
```

### ⚠ 再起動でルームは全消滅する

sync サーバーは**揮発インメモリ設計**で、再起動すると稼働中のルームが全て消える
（仕様どおり）。**利用者のいない時間帯に実施すること。**

## 動作確認

```bash
HOST=https://<公開ドメイン>

# ① 新版が確実に出た決定的証拠: 配信中のハッシュとローカルビルドの一致
LOCAL=$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' apps/timer-web/dist/index.html | head -1)
REMOTE=$(curl -s "$HOST/" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1)
[ "$LOCAL" = "$REMOTE" ] && echo 一致 || echo 不一致

# ② ヘッダとステータス
curl -sI "$HOST/" | grep -Ei 'HTTP/|x-robots-tag|strict-transport'

# ③ WebSocket は 426 が正常（200 なら SPA フォールバックに吸われている）
curl -s -o /dev/null -w '%{http_code}\n' "$HOST/ws"

# ④ クラッシュループしていないこと（20 秒あけて 2 回・NRestarts と MainPID を見る）
ssh "$TASUKI_SSH_HOST" 'systemctl --no-pager show tasuki-sync -p ActiveState -p NRestarts -p MainPID'
sleep 20
ssh "$TASUKI_SSH_HOST" 'systemctl --no-pager show tasuki-sync -p ActiveState -p NRestarts -p MainPID'

# ⑤ 起動ログに異常が無いこと
ssh "$TASUKI_SSH_HOST" 'journalctl -u tasuki-sync -n 12 -o cat'
```

## 切り戻し

デプロイ前に必ず退避しておく。

```bash
ssh "$TASUKI_SSH_HOST" "cp -p /opt/tasuki/server.js /opt/tasuki/server.js.bak-$(date +%Y%m%d-%H%M)"
```

戻すとき:

```bash
ssh "$TASUKI_SSH_HOST" 'cp -p /opt/tasuki/server.js.bak-<日付> /opt/tasuki/server.js && sudo systemctl restart tasuki-sync'
```

web 側は前コミットを checkout して `deploy.sh` を再実行する。

## 初回セットアップ（VPS 側・アプリごとに 1 回）

```bash
# 1) Bun を VPS に導入し /usr/local/bin/bun へ置く（未導入なら）

# 2) 資材を転送
scp -r deploy "$TASUKI_SSH_HOST:/tmp/tasuki-deploy"

# 3) VPS で実行（root）。DEPLOY_USER は SSH のログインユーザー名。
ssh -t "$TASUKI_SSH_HOST" 'sudo DEPLOY_USER=$(whoami) bash /tmp/tasuki-deploy/setup.sh timer'

# 4) env を実値へ編集（ALLOWED_ORIGINS 等）
ssh -t "$TASUKI_SSH_HOST" 'sudo -e /opt/tasuki/tasuki-sync.env'

# 5) Caddy 断片を設置（deploy/caddy/README.md 参照）

# 6) 配置して起動
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh timer
ssh "$TASUKI_SSH_HOST" 'sudo systemctl start tasuki-sync'
```

`setup.sh` が行うこと（冪等・再実行可）:

- ディレクトリ作成と所有権設定（`DEPLOY_USER` 所有 = 転送に sudo が要らなくなる）
- env ファイル作成（**既存があれば上書きしない**）
- systemd ユニットを `service.tmpl` から生成（`DEPLOY_USER` / パス / ポートを置換）
- `deploy.sh` 用の sudoers ルールを `visudo` で検証してから設置

**安全装置**: 既存ユニットの `User=` と指定した `DEPLOY_USER` が食い違う場合、
上書きせず中断する（再起動でサービスが起動しなくなるのを防ぐ）。意図した変更なら
`FORCE=1` を付ける。

生成されるユニットを事前に確認したいときは root なしで実行できる。

```bash
RENDER_ONLY=1 DEPLOY_USER=<user> bash deploy/setup.sh timer
```

## SSH の準備

`deploy.sh` は `rsync` / `scp` / `ssh` を非対話で叩くため、**パスフレーズ無しの鍵**を
使うか ssh-agent に載せておく。

```
# ~/.ssh/config
Host <ホスト別名>
  HostName <VPS の IP>
  User <ログインユーザー>
  IdentityFile ~/.ssh/<鍵>
  IdentitiesOnly yes
```

`deploy.sh` は SSH 先で `sudo systemctl restart` を実行する。一般ユーザーで運用する
場合は passwordless sudo が必要（`setup.sh` が設置する）。

## ファイル

```
deploy/
├── README.md                このファイル（共通手順の正本）
├── deploy.sh                共通ドライバ:  ./deploy/deploy.sh <app>
├── setup.sh                 共通 VPS セットアップ:  sudo bash setup.sh <app>
├── lib/common.sh            app.env の読込・検証
├── caddy/                   サイトブロックと設置手順
└── <app>/
    ├── app.env              このアプリの値（唯一の定義場所）
    ├── service.tmpl         systemd ユニットのテンプレート
    ├── env.example          env のテンプレート（実体はコミットしない）
    ├── caddy/*.conf         Caddy 断片
    └── NOTES.md             このアプリ固有の経緯・注意
```

## トラブルシュート

| 症状 | 原因と対処 |
|---|---|
| `ERROR: 接続先が未設定です` | `TASUKI_SSH_HOST` を指定する。既定値は意図的に置いていない |
| `systemctl start` が即失敗する | ユニットの `ExecStart` の bun パスが実際と違う。`which bun` に合わせる（`BUN_PATH=` で指定可） |
| リモートでパスワード入力待ちになる | passwordless sudo が未設定。`setup.sh` を実行する |
| `/ws` が 426 でなく 200 を返す | Caddy の包括フォールバック（`90-*.conf`）が先に評価されている。断片の順序を確認（`deploy/caddy/README.md`） |
| 配信中のハッシュがローカルと違う | rsync が失敗しているか、web root が想定と違う。`app.env` の `WEB_ROOT` を確認 |
