# Caddy 設定の設置手順

ホストの Caddy は他サイト（gallery / play 等）と共用しているため、**Tasuki のブロックは
import で切り離す**。アプリを増やしてもホストの `Caddyfile` に触らずに済む。

## 構成

```
/etc/caddy/
├── Caddyfile                    # 他サイトと共用。Tasuki 行は import 1 行だけ
└── tasuki/
    ├── site.conf                # deploy/caddy/tasuki.conf
    └── apps/
        ├── 10-timer-ws.conf     # deploy/timer/caddy/10-timer-ws.conf
        ├── 20-poker.conf        # deploy/poker/caddy/20-poker.conf（S4 まで置かない）
        ├── 30-landing.conf      # deploy/landing/caddy/30-landing.conf（S3 で /home/ に置く）
        └── 90-timer-spa.conf    # deploy/timer/caddy/90-timer-spa.conf
```

## 順序の制約（最重要）

Caddy の `handle` は**記述順に評価され、最初にマッチしたものだけが実行される**。
`import` のグロブは**ファイル名順**に展開されるため、番号接頭辞が順序を決めている。

| 番号 | 役割 |
|---|---|
| `10-` 〜 `80-` | 具体的なパスにマッチする handle（`/ws*`・`/poker/*` 等） |
| `90-` | **包括フォールバック**（`handle {}`）。必ず最後 |

`90-` を先に読ませると全リクエストがそれに吸われ、`/ws` が WebSocket にならず
`index.html` が 200 で返る。**本番で `/poker` が timer の index.html を返していたのは、
poker の断片が無くこのフォールバックに吸われていたため**で、同じ現象が起きる。

## 設置

```bash
# 1) 転送（ローカルから）
TASUKI_SSH_HOST=<host>
scp deploy/caddy/tasuki.conf              "$TASUKI_SSH_HOST:/tmp/site.conf"
scp deploy/timer/caddy/10-timer-ws.conf   "$TASUKI_SSH_HOST:/tmp/"
scp deploy/timer/caddy/90-timer-spa.conf  "$TASUKI_SSH_HOST:/tmp/"

# 2) 設置（VPS で・root）
sudo mkdir -p /etc/caddy/tasuki/apps
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak."$(date +%Y%m%d-%H%M)"   # 必ず退避
sudo install -m 644 /tmp/site.conf /etc/caddy/tasuki/site.conf
sudo install -m 644 /tmp/10-timer-ws.conf /tmp/90-timer-spa.conf /etc/caddy/tasuki/apps/

# 3) site.conf の <公開ドメイン> を実値へ置換
sudo sed -i 's|<公開ドメイン>|tasuki.example.com|' /etc/caddy/tasuki/site.conf

# 4) ホストの Caddyfile から旧 tasuki ブロックを削り、import 1 行に置き換える
#    （エディタで手作業。既存の他サイトのブロックには触れない）
#      import /etc/caddy/tasuki/site.conf

# 5) 検証してから反映（NG なら反映しない）
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

## 切り戻し

```bash
sudo cp /etc/caddy/Caddyfile.bak.<日付> /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

## 確認

```bash
curl -sI https://<公開ドメイン>/            # 200 / x-robots-tag: noindex, nofollow / HSTS
curl -s -o /dev/null -w '%{http_code}\n' https://<公開ドメイン>/ws     # 426 が正常
```
