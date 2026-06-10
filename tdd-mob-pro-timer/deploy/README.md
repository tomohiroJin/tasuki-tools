# Tasuki デプロイ手順（niku9.click）

`tasuki.niku9.click` で公開するための手順。設計の正本は
`../../docs/superpowers/specs/2026-06-07-tasuki-vps-deployment-design.md`。

## 構成

- Caddy（ホスト直接・自動 TLS）が静的フロントを配信し `/ws` を sync へ proxy
- sync は systemd + Bun でホスト常駐（`127.0.0.1:8787`・揮発インメモリ）
- 更新は `deploy.sh` でローカルからビルド→転送→再起動

## 実際のセットアップ手順（スクリプト方式・推奨）

2026-06-09 に niku9.click（Debian 12・ログインユーザー `tomohiro`・非 root）へ実デプロイ済み。
**サービスは `tomohiro` ユーザーで実行**する（専用 `tasuki` ユーザーは作らない＝転送の所有権と env
読取りが単純になる）。実際に使った流れ:

1. **SSH 準備**: ローカル（deploy 実行環境）から `ssh niku9` が通ること。`~/.ssh/config` に
   `Host niku9 / HostName niku9.click / User tomohiro / IdentityFile <鍵>` を用意。
2. **Bun 導入**（VPS で・非 sudo）: `ssh niku9 'curl -fsSL https://bun.sh/install | bash'`
3. **初回セットアップ**（VPS で・root）: `vps-setup.sh` を VPS へ転送し
   `sudo bash vps-setup.sh` を実行。bun を `/usr/local/bin` へ、`/opt/tasuki`・`/var/www/tasuki`
   を tomohiro 所有で作成、env 配置、systemd ユニット（`User=tomohiro`）配置＋enable、
   `systemctl {restart,status,start,stop} tasuki-sync` だけの NOPASSWD sudoers を設置。
4. **Caddy 設定**（VPS で・root）: `caddy-setup.sh` を転送し `sudo bash caddy-setup.sh`。
   既存 Caddyfile をバックアップ→tasuki ブロック追記→`caddy validate`→OK なら reload／NG なら自動復元。
5. **配置・起動**: ローカルから `./deploy/deploy.sh`（web ビルド＋sync バンドル→rsync/scp→
   `sudo systemctl restart tasuki-sync`。手順3の NOPASSWD で非対話に通る）。

> `vps-setup.sh` / `caddy-setup.sh` は冪等（再実行可）。手順3・4は VPS の sudo パスワードが要るため
> 端末で対話実行（例: `ssh -t niku9 'sudo bash /tmp/xxx.sh'`）。手順2・5はローカルから自動実行可。

以下の「前提」「初回セットアップ（手動）」は上記スクリプトの内訳・参考。

## 前提（デプロイ実行環境）

- **成果物の転送**: 初回セットアップで使う `tasuki-sync.service` / `tasuki-sync.env.example` /
  `Caddyfile.production` は VPS 側に置く必要がある。リポジトリを VPS に clone するか、
  ローカルから `scp deploy/tasuki-sync.service deploy/tasuki-sync.env.example deploy/Caddyfile.production <host>:/tmp/`
  で転送してから以降の手順を実行する（以下の手順は転送済み前提）。
- **SSH**: deploy.sh の接続先は環境変数 `TASUKI_SSH_HOST`（内部変数 `SSH_HOST`・既定 `niku9`）。
  これを `~/.ssh/config` か known_hosts に事前登録しておく（初回接続のホスト鍵確認で止まらないように）。
- **sudo**: `deploy.sh` は SSH 先で `sudo systemctl restart` を実行する。SSH ユーザーが
  **root**ならそのまま動く。一般ユーザーで運用する場合は `systemctl` への passwordless sudo
  （例: `/etc/sudoers.d/tasuki-deploy` に `<user> ALL=(root) NOPASSWD: /usr/bin/systemctl restart tasuki-sync`）
  を設定しないと、リモートでパスワード入力待ちになり処理が止まる。
- **bun パス**: `tasuki-sync.service` の `ExecStart` は `/usr/local/bin/bun` を既定にしているが、
  `curl | bash` 導入だと実際は `/root/.bun/bin/bun` 等になる。**必ず `which bun` の結果に合わせて
  ユニットの `ExecStart` を書き換える**こと（不一致だと `systemctl start` が即失敗する）。
  ⚠ 重要: bun が `/root/.bun/bin/bun` にある場合、ユニットの `ProtectHome=true` により
  実行ユーザー `tasuki` は `/root` にアクセスできず起動に失敗する。
  `sudo cp /root/.bun/bin/bun /usr/local/bin/bun && sudo chmod 755 /usr/local/bin/bun` で
  `/usr/local/bin/` にコピーし、`ExecStart` を `/usr/local/bin/bun` のままにするのが確実。

## ファイル

| ファイル | 用途 |
|---------|------|
| `Caddyfile.production` | 本番用 Caddy ブロック（既存 Caddyfile へ取り込む） |
| `tasuki-sync.service` | systemd ユニット |
| `tasuki-sync.env.example` | env テンプレート（実体は VPS のみ・非コミット） |
| `deploy.sh` | ローカルからのデプロイスクリプト |
| `Caddyfile` | （旧）Docker 用ドラフト。本番では使わない |

## 初回セットアップ（VPS 側・1回だけ）

1. **DNS**: `tasuki.niku9.click` の A レコードを `157.7.141.211` に向ける（自動 TLS の前提）。
   `dig +short tasuki.niku9.click` で反映を確認。

2. **Bun を導入**（未導入時）:
   ```bash
   curl -fsSL https://bun.sh/install | bash
   which bun   # ExecStart のパスに合わせる（例: /root/.bun/bin/bun か /usr/local/bin/bun）
   ```

3. **専用ユーザとディレクトリ**:
   ```bash
   sudo useradd --system --no-create-home --shell /usr/sbin/nologin tasuki || true
   sudo mkdir -p /opt/tasuki /var/www/tasuki
   sudo chown -R tasuki:tasuki /opt/tasuki
   # /var/www/tasuki は rsync が SSH ユーザー（通常 root）として書き込む。
   # Caddy が読めれば良い（既存 gallery/play の web root 所有モデルに合わせる）。
   ```

4. **env を配置**:
   ```bash
   sudo cp tasuki-sync.env.example /opt/tasuki/tasuki-sync.env
   sudo nano /opt/tasuki/tasuki-sync.env   # ALLOWED_ORIGINS 等を確認
   sudo chown tasuki:tasuki /opt/tasuki/tasuki-sync.env
   sudo chmod 600 /opt/tasuki/tasuki-sync.env
   ```

5. **systemd ユニットを配置**（`ExecStart` の bun パスを `which bun` の結果に合わせてから）:
   ```bash
   sudo cp tasuki-sync.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable tasuki-sync   # 自動起動を有効化（start はまだしない）
   ```
   ※ この時点では `server.js` 未配置のため enable のみで start しない。初回 `deploy.sh` 実行後に start（step 7）。

6. **Caddy 設定を取り込む**: `Caddyfile.production` の `tasuki.niku9.click { ... }` ブロックを
   既存ホストの Caddyfile（gallery/play と同じファイル）へ追記し、検証して reload:
   ```bash
   sudo caddy validate --config /etc/caddy/Caddyfile   # 実パスは環境に合わせる
   sudo systemctl reload caddy
   ```

7. **初回デプロイ**（ローカルから・下記「更新」と同じ）を実行して `server.js` を配置し、最後に起動:
   ```bash
   sudo systemctl start tasuki-sync    # enable は step 5 で済み
   sudo systemctl status tasuki-sync
   ```

## 更新（ローカルから・通常運用）

```bash
# ~/.ssh/config に niku9 ホストを定義済みなら:
./deploy/deploy.sh
# 別名/IP を直接指定する場合:
TASUKI_SSH_HOST=user@157.7.141.211 ./deploy/deploy.sh
```

配置パスを変える場合は `TASUKI_WEB_ROOT` / `TASUKI_APP_DIR` / `TASUKI_SERVICE` を指定。
`pnpm` が PATH に無い環境は `PNPM=~/.local/bin/pnpm ./deploy/deploy.sh`。
（前提: 接続先 `TASUKI_SSH_HOST` は `~/.ssh/config` か known_hosts に事前設定しておくこと。初回接続のホスト鍵確認で止まらないように。）

## 動作確認

```bash
curl -I https://tasuki.niku9.click/                 # 200 + X-Robots-Tag: noindex
curl -s https://tasuki.niku9.click/robots.txt       # Disallow: /
sudo systemctl status tasuki-sync                    # active (running)
sudo ss -tlnp | grep 8787                            # 127.0.0.1:8787 のみ
```
ブラウザで `https://tasuki.niku9.click/` を開き、ルーム作成→別タブで参加し WS 同期を確認。

## リソース上限・Origin 保護（公開運用）

- 本番 env に `NODE_ENV=production` を置くと、`ALLOWED_ORIGINS` 未設定時に sync が
  **起動を拒否**する（CSWSH 防止の fail-closed）。
- `MAX_CONNECTIONS`（既定 200）/ `MAX_ROOMS`（既定 50）で同時接続数・ルーム数を制限。
  超過接続は WS 1013、超過 room.create は `ROOM_LIMIT_EXCEEDED` で拒否。
- `ROOM_IDLE_TTL_MS`（既定 30 分）全員切断が継続したルームを定期回収（60 秒間隔）。
  揮発設計のため回収されたルームは復帰不可（再作成すればよい）。

## 運用可視化（管理エンドポイント）

`ADMIN_TOKEN` を設定すると、VPS ホストから read-only の運用情報を参照できる（インターネット非公開・127.0.0.1 限定）。

```bash
curl -H "x-admin-token: $ADMIN_TOKEN" http://127.0.0.1:8787/status
curl -H "x-admin-token: $ADMIN_TOKEN" http://127.0.0.1:8787/admin/rooms
```

- `/status`: アクティブルーム数・累計回収数。
- `/admin/rooms`: 上記＋各ルーム要約（コード/参加者数/online数/ドライバー有無/作成時刻）。
- 回収ログは `journalctl -u tasuki-sync | grep reclaimed` で追える。

## ロールバック

sync を一旦止めて前バージョンの `server.js` に戻す:
```bash
sudo systemctl stop tasuki-sync
# 直前の server.js を退避しておけば差し替え。無ければローカルで前コミットを
# checkout して deploy.sh を再実行する。
sudo systemctl start tasuki-sync
```
（ルームは揮発のため再起動でクリアされる＝設計どおり。）

## トラブルシュート

- **502/WS つながらない**: `sudo systemctl status tasuki-sync` と `journalctl -u tasuki-sync -n 50`。
  `bun` パス誤り（`ExecStart`）、`ALLOWED_ORIGINS` 不一致（`1008 Origin not allowed`）を確認。
- **TLS が出ない**: DNS A レコード未反映、または Caddy が 80/443 を握れていない。`journalctl -u caddy`。
- **426 が返る（curl で /ws 直叩き）**: 正常（WebSocket Upgrade 待ち）。
