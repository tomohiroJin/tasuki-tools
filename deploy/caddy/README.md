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

## 評価順の実際（2026-08-05 に Caddy 2.11.4 で実測）

**断片の記述順（＝ファイル名順）は、そのままでは評価順にならない。**
Caddyfile アダプタはルートを**マッチャの具体性**で並べ替える。パス指定のない
`handle`（包括フォールバック）は、書いた位置に関わらず最後に回る。

実測: 包括フォールバックの断片を `90-landing.conf` → `05-landing.conf` に改名して
先頭に置いても、`caddy adapt` が生成するルートの並びは**完全に同一**だった。
起動して叩いても `/`・`/timer/`・`/poker/`・`/timer/ws` すべて正常。

**ファイル名順が効くのは、具体性が同じマッチャ同士の並びを決めるときだけ。**
その場合は名前が先のものが勝ち、**後のものは一度も評価されない**
（実測: 包括 `handle {}` を 2 本置くと、名前が先の方だけが応答した）。

### 本当に危ないのは「順序」ではなく「衝突」

| 状況 | 何が起きるか |
|---|---|
| 包括フォールバックが 2 本 | 名前が後の方が**到達不能**。設定は有効なので気づけない |
| 同じパスを 2 本が宣言 | 同上 |
| ある経路の断片が**存在しない** | 包括フォールバックに吸われる。**本番の `/poker` 事故はこれ**（順序ではない） |

`apps/landing/tests/caddy-fragment-order.test.ts` がこの 3 つを機械的に押さえている
（包括はちょうど 1 本・ルーティングの鍵に重複が無い・配信断片は自分の root を宣言）。

番号接頭辞は**人が読むための規約**であって、安全性の根拠ではない。

## S4（#19）での入れ替え — 旧ファイルの削除

S4 で包括フォールバックが timer から LP へ移ったため、2 本の断片が改名されている。

| 旧 | 新 |
|---|---|
| `90-timer-spa.conf`（包括） | `30-timer-spa.conf`（`/timer/*` 限定） |
| `30-landing.conf`（`/home/*`） | `90-landing.conf`（包括） |

**旧ファイルを消し忘れても `/timer/` は壊れない**（実測で確認済み）。残ると起きるのは:

- `30-landing.conf` が残る → **`/home/` でも LP に到達できる二重公開 URL**になる
- `90-timer-spa.conf` が残る → 包括が 2 本になり、名前が先の `90-landing.conf` だけが
  効く。timer 側は死んだ設定として残り続ける

いずれも「壊れないが、意図しない状態が黙って残る」ので削除する。

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

# 6) 設置後の顔ぶれを目視（旧ファイルが残っていないこと・包括が 1 本だけであること）
ls /etc/caddy/tasuki/apps/
grep -l '^handle\s*{' /etc/caddy/tasuki/apps/*.conf   # 1 本だけ出れば正常

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
