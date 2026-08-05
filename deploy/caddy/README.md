# Caddy 設定の設置手順

ホストの Caddy は他サイト（gallery / play 等）と共用しているため、**Tasuki のブロックは
import で切り離す**。アプリを増やしてもホストの `Caddyfile` に触らずに済む。

## 構成

```
/etc/caddy/
├── Caddyfile                        # 他サイトと共用。Tasuki 行は import 1 行だけ
└── tasuki/
    ├── site.conf                    # deploy/caddy/tasuki.conf
    └── apps/
        ├── 10-timer-ws.conf         # deploy/timer/caddy/
        ├── 20-poker.conf            # deploy/poker/caddy/
        ├── 30-timer-spa.conf        # deploy/timer/caddy/
        ├── 40-timer-legacy-room.conf # deploy/timer/caddy/
        └── 90-landing.conf          # deploy/landing/caddy/（包括フォールバック）
```

## 順序の制約（最重要）

Caddy の `handle` は**記述順に評価され、最初にマッチしたものだけが実行される**。
`import` のグロブは**ファイル名順**に展開されるため、番号接頭辞が順序を決めている。

| 番号 | 役割 |
|---|---|
| `10-` 〜 `80-` | 具体的なパスにマッチする handle（`/timer/ws`・`/poker/*` 等） |
| `90-` | **包括フォールバック**（`handle {}`）。必ず最後 |

`90-` を先に読ませると全リクエストがそれに吸われ、WebSocket が成立せず
`index.html` が 200 で返る。**本番で `/poker` が timer の index.html を返していたのは、
poker の断片が無くこのフォールバックに吸われていたため**で、同じ現象が起きる。

この不変条件は `apps/landing/tests/caddy-fragment-order.test.ts` が機械的に押さえている
（包括フォールバックが 1 本だけで、ファイル名順で最後に来ること）。

## ⚠ S4（#19）での入れ替え — 旧ファイルの削除が必須

S4 で**包括フォールバックが timer から LP へ移った**ため、2 本の断片が改名されている。

| 旧 | 新 |
|---|---|
| `90-timer-spa.conf`（包括） | `30-timer-spa.conf`（`/timer/*` 限定） |
| `30-landing.conf`（`/home/*`） | `90-landing.conf`（包括） |

**新しい断片を置くだけで旧ファイルを消さないと壊れる。** `90-landing.conf` と
`90-timer-spa.conf` が並ぶと辞書順で landing が先に評価され、`/timer/` が LP に吸われる。

```bash
sudo rm -f /etc/caddy/tasuki/apps/30-landing.conf \
           /etc/caddy/tasuki/apps/90-timer-spa.conf
```

## 設置

```bash
# 1) 転送（ローカルから）
TASUKI_SSH_HOST=<host>
scp deploy/caddy/tasuki.conf                    "$TASUKI_SSH_HOST:/tmp/site.conf"
scp deploy/timer/caddy/*.conf                   "$TASUKI_SSH_HOST:/tmp/"
scp deploy/poker/caddy/20-poker.conf            "$TASUKI_SSH_HOST:/tmp/"
scp deploy/landing/caddy/90-landing.conf        "$TASUKI_SSH_HOST:/tmp/"

# 2) 設置（VPS で・root）
sudo mkdir -p /etc/caddy/tasuki/apps
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak."$(date +%Y%m%d-%H%M)"   # 必ず退避
sudo install -m 644 /tmp/site.conf /etc/caddy/tasuki/site.conf
sudo install -m 644 /tmp/10-timer-ws.conf /tmp/20-poker.conf /tmp/30-timer-spa.conf \
                    /tmp/40-timer-legacy-room.conf /tmp/90-landing.conf \
                    /etc/caddy/tasuki/apps/

# 3) 旧断片を削除（S4 の入れ替え。上記「旧ファイルの削除が必須」を参照）
sudo rm -f /etc/caddy/tasuki/apps/30-landing.conf \
           /etc/caddy/tasuki/apps/90-timer-spa.conf

# 4) site.conf の <公開ドメイン> を実値へ置換（初回のみ）
sudo sed -i 's|<公開ドメイン>|tasuki.example.com|' /etc/caddy/tasuki/site.conf

# 5) ホストの Caddyfile に import 1 行があることを確認（初回のみ・エディタで手作業）
#      import /etc/caddy/tasuki/site.conf

# 6) 設置後の並びを目視（包括フォールバックが最後にあること）
ls /etc/caddy/tasuki/apps/

# 7) 検証してから反映（NG なら反映しない）
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

## 切り戻し

```bash
sudo cp /etc/caddy/Caddyfile.bak.<日付> /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

断片を戻す場合は、前の版の `apps/*.conf` を入れ直したうえで**今回追加した分を消す**。
消し忘れると順序が崩れる。

## 確認

```bash
HOST=https://<公開ドメイン>

curl -sI "$HOST/"                                        # 200・x-robots-tag: noindex, nofollow・HSTS
curl -s "$HOST/" | grep -o '<title>[^<]*</title>'        # LP の題名が出る

# 3 系統が並存すること
for p in / /timer/ /poker/; do
  curl -s -o /dev/null -w "$p → %{http_code}\n" "$HOST$p"
done

# WebSocket が SPA に吸われていないこと。**判定は「200 でないこと」**。
# timer-sync は 426、poker-sync は 400（WebSocket upgrade failed）を返す。実装の差。
curl -s -o /dev/null -w 'timer/ws → %{http_code}\n' "$HOST/timer/ws"
curl -s -o /dev/null -w 'poker/ws → %{http_code}\n' "$HOST/poker/ws"

# 旧共有リンクの救済（/?room= は timer へ 301。room 無しの / は LP のまま）
curl -s -o /dev/null -w '?room 付き → %{http_code} %{redirect_url}\n' "$HOST/?room=TEST"
```
