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
        ├── 05-hub-ws.conf           # deploy/landing/caddy/（唯一の WS 入口。#95 S5c）
        ├── 20-poker.conf            # deploy/poker/caddy/
        ├── 30-timer-spa.conf        # deploy/timer/caddy/
        ├── 40-topic.conf            # deploy/topic/caddy/（topic は #91 の PR 3 の後まで配らない）
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
scp deploy/landing/caddy/05-hub-ws.conf         "$TASUKI_SSH_HOST:/tmp/"
scp deploy/timer/caddy/*.conf                   "$TASUKI_SSH_HOST:/tmp/"
scp deploy/poker/caddy/20-poker.conf            "$TASUKI_SSH_HOST:/tmp/"
scp deploy/topic/caddy/40-topic.conf            "$TASUKI_SSH_HOST:/tmp/"  # topic は #91 の PR 3 の後まで配らない
scp deploy/landing/caddy/90-landing.conf        "$TASUKI_SSH_HOST:/tmp/"

# 2) 設置 その 1 — **配信物より先に入れてよい断片だけ**（VPS で・root）
# #95 S5c で 10-timer-ws.conf を撤去した。WS の入口は 05-hub-ws.conf（/ws）の 1 本だけ
# ——これを設置し忘れると本番の WS が一切繋がらない（timer も poker もハブも）。
#
# ⚠ **ここで入れるのは site.conf と 05-hub-ws.conf の 2 本だけである。**
# 20-poker.conf は **/poker/ws の handle を落としてある**ので、旧 poker がまだ配信されて
# いる段で入れると、手順 7 の reload の時点で /poker/ws が SPA フォールバックに吸われ、
# `deploy.sh poker` が走るまで poker の WS が死ぬ。30-timer-spa.conf と 90-landing.conf も
# 同じ段（下の「その 2」）へ送る —— 内容は S4 から変わっておらず、いつ入れても同じである。
# site.conf は S5a・S5c ともに差分が「断片の顔ぶれ」のコメントだけなので、先に入れて無害。
sudo mkdir -p /etc/caddy/tasuki/apps
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak."$(date +%Y%m%d-%H%M)"   # 必ず退避
sudo install -m 644 /tmp/site.conf /etc/caddy/tasuki/site.conf
sudo install -m 644 /tmp/05-hub-ws.conf /etc/caddy/tasuki/apps/

# **旧共有リンクの救済（40-timer-legacy-room.conf・S5a で撤去）はこの段で消す。**
# 後回しにできない —— 残したまま `deploy.sh landing` を走らせると、新しい玄関が配る
# 参加用 URL（/?room=CODE）が `permanent` 301 で /timer/ へ飛び、**その 301 を
# ブラウザがキャッシュする**。開いた端末は断片を消した後も飛ばされ続ける
# （../timer/NOTES.md の「旧共有リンクの救済」）。ここで消しておけば、その窓が開かない。
# 先に消しても壊れるのは S4 時代の `/?room=` リンクだけで、旧 LP に着地するだけである。
sudo rm -f /etc/caddy/tasuki/apps/40-timer-legacy-room.conf

# 3) 旧断片を削除し、残りの断片を設置する（S4 の入れ替え。上記「旧ファイルの削除が必須」を参照）
# 10-timer-ws.conf は #95 S5c で撤去した。ホストに残っていても実害は無い（WS 入口は
# クエリで振り分けており、この断片は timer 側の /timer/ws という死んだ handle でしかない）が、
# 「/ws の 1 本だけ」という前提と食い違う設定を残さないため一緒に消す。
#
# ⚠ **S5a〜S5c の初回配布では、この手順 3 だけを後回しにする。** ここを上から順に
# 実行すると、手順 2（設置）と手順 3（削除）の間に配信物の入れ替えが挟まらず、
# 手順 7 の reload 1 回で「旧 timer が配信されたまま /timer/ws が消える」状態になる。
# 残っていても実害が無いのは真だが、**配信物より先に消すと害がある**（逆向きの事実）。
# 正しい順序は ../timer/NOTES.md の「#95 S5c を配布するときに行うこと」の順序表にある
# ——「①site.conf と 05-hub-ws.conf を設置＋40 を削除 → ②deploy.sh を 3 本 → ③ここ」。
# **つまりこの README は 2 度通す。** 1 度目は手順 2 まで（＋4〜7）、2 度目がここである。
sudo rm -f /etc/caddy/tasuki/apps/30-landing.conf \
           /etc/caddy/tasuki/apps/90-timer-spa.conf \
           /etc/caddy/tasuki/apps/10-timer-ws.conf

# 設置 その 2 — 配信物を入れ替えた後に入れる断片（新しい 20-poker.conf はここ）
#
# **まっさらなホストへの初回設置では、手順 2 と手順 3 を分けなくてよい。** 分けるのは
# 「いま動いている旧い配信物」を壊さないためであり、それが無ければ守るものが無い。
sudo install -m 644 /tmp/20-poker.conf /tmp/30-timer-spa.conf /tmp/40-topic.conf /tmp/90-landing.conf \
                    /etc/caddy/tasuki/apps/
# ⚠ 40-topic.conf は #91 の PR 3 の後まで配らない（この行は将来の設置のための記載）

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

# 4 系統が並存すること
# ⚠ /topic/ は #91 の PR 3 の後まで配らない（それまでは 40-topic.conf を設置しないので、この行は 404 になる）
for p in / /timer/ /poker/ /topic/; do
  curl -s -o /dev/null -w "$p → %{http_code}\n" "$HOST$p"
done

# WebSocket が SPA に吸われていないこと。統合 sync（apps/tasuki-sync）は
# 非 Upgrade の HTTP に 426 を返す。
# （#95 S2 の統合前、poker-sync だけは 400 を返していた。統合で 426 に揃った。）
#
# **#95 S5c から、WS の入口は /ws の 1 本だけ。** 旧パス（/timer/ws・/poker/ws）は
# 断片ごと撤去したので、SPA フォールバックに吸われて 200 が返るのが正しい
# （e2e/specs/routing.spec.ts が具体値で固定している）。
curl -s -o /dev/null -w 'ws（唯一の WS 入口。426 が正しい） → %{http_code}\n' "$HOST/ws"
curl -s -o /dev/null -w 'timer/ws（旧入口。200 が正しい） → %{http_code}\n' "$HOST/timer/ws"
curl -s -o /dev/null -w 'poker/ws（旧入口。200 が正しい） → %{http_code}\n' "$HOST/poker/ws"

# **#95 S5a から /?room=CODE は参加用 URL そのものである。** 旧共有リンクの救済断片
# （40-timer-legacy-room.conf）は撤去した——残っていると、いま配っている招待リンクが
# 301 で timer へ飛ばされ、選択画面に着地しない（deploy/timer/NOTES.md）。
# **ここで 301 が返ったら断片が消し残っている。** 200（玄関 LP）が正しい。
curl -s -o /dev/null -w '?room 付き（200 が正しい） → %{http_code} %{redirect_url}\n' "$HOST/?room=TEST"
```
