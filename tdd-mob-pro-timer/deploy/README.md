# Tasuki デプロイ手順（niku9.click）

`tasuki.niku9.click` で公開するための手順。設計の正本は
`../docs/superpowers/specs/2026-06-07-tasuki-vps-deployment-design.md`。

## 構成

- Caddy（ホスト直接・自動 TLS）が静的フロントを配信し `/ws` を sync へ proxy
- sync は systemd + Bun でホスト常駐（`127.0.0.1:8787`・揮発インメモリ）
- 更新は `deploy.sh` でローカルからビルド→転送→再起動

## 前提（デプロイ実行環境）

- **SSH**: `deploy.sh` の `SSH_HOST`（既定 `niku9`）を `~/.ssh/config` か known_hosts に
  事前登録しておく（初回接続のホスト鍵確認で止まらないように）。
- **sudo**: `deploy.sh` は SSH 先で `sudo systemctl restart` を実行する。SSH ユーザーが
  **root**ならそのまま動く。一般ユーザーで運用する場合は `systemctl` への passwordless sudo
  （例: `/etc/sudoers.d/tasuki-deploy` に `<user> ALL=(root) NOPASSWD: /usr/bin/systemctl restart tasuki-sync`）
  を設定しないと、リモートでパスワード入力待ちになり処理が止まる。
- **bun パス**: `tasuki-sync.service` の `ExecStart` は `/usr/local/bin/bun` を既定にしているが、
  `curl | bash` 導入だと実際は `/root/.bun/bin/bun` 等になる。**必ず `which bun` の結果に合わせて
  ユニットの `ExecStart` を書き換える**こと（不一致だと `systemctl start` が即失敗する）。

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
   ```
   ※ この時点では `server.js` 未配置のため enable のみ。初回 `deploy.sh` 実行後に起動する。

6. **Caddy 設定を取り込む**: `Caddyfile.production` の `tasuki.niku9.click { ... }` ブロックを
   既存ホストの Caddyfile（gallery/play と同じファイル）へ追記し、検証して reload:
   ```bash
   sudo caddy validate --config /etc/caddy/Caddyfile   # 実パスは環境に合わせる
   sudo systemctl reload caddy
   ```

7. **初回デプロイ**（ローカルから・下記「更新」と同じ）を実行し、最後に:
   ```bash
   sudo systemctl enable --now tasuki-sync
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
（前提: `SSH_HOST` は `~/.ssh/config` か known_hosts に事前設定しておくこと。初回接続のホスト鍵確認で止まらないように。）

## 動作確認

```bash
curl -I https://tasuki.niku9.click/                 # 200 + X-Robots-Tag: noindex
curl -s https://tasuki.niku9.click/robots.txt       # Disallow: /
sudo systemctl status tasuki-sync                    # active (running)
sudo ss -tlnp | grep 8787                            # 127.0.0.1:8787 のみ
```
ブラウザで `https://tasuki.niku9.click/` を開き、ルーム作成→別タブで参加し WS 同期を確認。

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
